import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { fakeDb } from './setup';
import { registerRoutes } from '../server/routes';
import { activateCode, generateCodes } from '../server/services/license-service';
import { saveOpenRouterKey } from '../server/services/user-service';
import { MAX_OWN_QUESTIONS } from '../shared/engines';
import { saveCitationSnapshot } from '../server/services/audit-store';

const ID = 'b2b2b2b2b2b2b2b2b2b2b2b2';
const OTHER = 'c3c3c3c3c3c3c3c3c3c3c3c3';
const TOKEN = 'u1:a@b.com:true';
const realFetch = fetch;
let server: Server;
let base = '';

beforeAll(() => {
  const app = express();
  app.use(express.json());
  registerRoutes(app);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
afterEach(() => vi.unstubAllGlobals());

const call = (method: string, path: string, body?: object, token = TOKEN) => realFetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

const topic = (t: string) => ({ topic: t, justification: 'fills a gap', targetPlatform: 'chatgpt', contentType: 'faq' });
const auditDoc = (over = {}) => ({
  userId: 'u1', status: 'completed', websiteUrl: 'https://acme.com/', domain: 'acme.com', createdAt: '2026-11-01T00:00:00.000Z', overallScore: 50, letterGrade: 'C',
  context: { companyName: 'Acme', industry: 'Widgets', businessType: 'B2B', targetAudience: 'Makers', valueProposition: 'Good widgets', keywords: ['widgets'], competitors: [] },
  auditData: { auditResults: { overallScore: 50, platformScores: { chatgpt: 40, perplexity: 50, gemini: 60, claude: 70 } }, contentTopics: { authoritative: [topic('What is a good widget?')], thoughtLeadership: [], competitiveAdvantage: [], emergingOpportunity: [] } },
  aeoInputs: { signals: {}, sitemapUrls: [], facts: { pages: [{ title: 'Acme', description: 'Widgets', h1: 'Acme', paragraphs: ['We make widgets.'] }], logoUrl: null, socialProfiles: [], faqs: [] }, sitemapLocation: null, hasLlmsTxt: false },
  ...over,
});

async function setup() {
  const [code] = await generateCodes(1, { whiteLabel: false, channel: 'marketplace' });
  await activateCode('u1', code);
  await saveOpenRouterKey('u1', 'sk-or-v1-own-key-0123456789abcdef0123456789');
  await fakeDb.collection('audits').doc(ID).set(auditDoc());
}

function stubAi() {
  const prompts: { model: string; text: string }[] = [];
  const chat = (content: string) => Response.json({ choices: [{ message: { content } }], usage: { cost: 0.01 } });
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const text = body.messages.at(-1).content as string;
    prompts.push({ model: body.model, text });
    if (text.startsWith('Write the questions')) return chat(JSON.stringify({ brand: ['What is Acme known for?', 'Is Acme any good?', 'Does Acme ship fast?'], category: ['Who makes the best widgets?', 'What is the best cheap widget?', 'Which widget lasts longest?', 'Where can I buy widgets?', 'Which widget brand is safest?'] }));
    if (text.includes('### ANSWER')) return chat('{"results": []}');
    if (text.includes('content topic ideas')) {
      const list = (p: string) => ['alpha', 'beta', 'gamma'].map((n) => ({ topic: `${p} question about ${n} widgets?`, justification: 'gap', targetPlatform: 'chatgpt', contentType: 'faq' }));
      return chat(JSON.stringify({ authoritative: [...list('Authority'), topic('What is a good widget?')], thoughtLeadership: list('Leader'), competitiveAdvantage: list('Edge'), emergingOpportunity: list('New') }));
    }
    return chat(text.toLowerCase().includes('acme') || text.includes('secret') ? 'Acme is a great choice.' : 'Try Widgetron.');
  }));
  return prompts;
}

describe('your own questions', () => {
  it('asks exactly your questions, on the engines you chose, and never writes its own', async () => {
    await setup();
    const prompts = stubAi();
    const mine = ['Who sells the best secret widget?', 'Is Acme a real company?', 'Who sells the best secret widget?'];
    const res = await call('POST', `/api/audits/${ID}/citation-snapshot`, { engines: ['perplexity', 'gemini'], questions: mine });
    expect(res.status).toBe(200);
    const { citationSnapshot: s } = await res.json();
    expect(new Set(s.promptResults.map((r: any) => r.prompt))).toEqual(new Set(['Who sells the best secret widget?', 'Is Acme a real company?']));
    expect(s.promptResults).toHaveLength(4);
    expect(prompts.some((p) => p.text.startsWith('Write the questions'))).toBe(false);
  });

  it(`takes up to ${MAX_OWN_QUESTIONS} questions without tripping the call budget`, async () => {
    await setup();
    const prompts = stubAi();
    const many = Array.from({ length: MAX_OWN_QUESTIONS }, (_, i) => `Question number ${i + 1} about widgets?`);
    const res = await call('POST', `/api/audits/${ID}/citation-snapshot`, { engines: ['perplexity'], questions: many });
    expect(res.status).toBe(200);
    const { citationSnapshot: s } = await res.json();
    expect(s.totalPromptsChecked).toBe(MAX_OWN_QUESTIONS);
    expect(s.promptResults.every((r: any) => !r.error)).toBe(true);
    expect(prompts.filter((p) => p.model === 'perplexity/sonar')).toHaveLength(MAX_OWN_QUESTIONS);
  }, 30_000);

  it('rejects too many or too short, before spending anything', async () => {
    await setup();
    const prompts = stubAi();
    const tooMany = Array.from({ length: MAX_OWN_QUESTIONS + 1 }, (_, i) => `Question number ${i}?`);
    expect((await call('POST', `/api/audits/${ID}/citation-snapshot`, { engines: ['gpt'], questions: tooMany })).status).toBe(400);
    expect((await call('POST', `/api/audits/${ID}/citation-snapshot`, { engines: ['gpt'], questions: ['hi'] })).status).toBe(400);
    expect(prompts).toHaveLength(0);
  });

  it('writes new questions for review, told to avoid the old ones, without asking any engine', async () => {
    await setup();
    const prompts = stubAi();
    const res = await call('POST', `/api/audits/${ID}/citation-questions`, { avoid: ['Is Acme overpriced?'] });
    expect(res.status).toBe(200);
    expect((await res.json()).questions).toHaveLength(8);
    expect(prompts).toHaveLength(1);
    expect(prompts[0].text).toContain('Is Acme overpriced?');
  });
});

describe('new questions really are new', () => {
  it('removes repeats even when the AI ignores the instruction', async () => {
    await setup();
    stubAi();
    const avoid = ['Who makes the best widgets?', 'Is Acme any good?'];
    const res = await call('POST', `/api/audits/${ID}/citation-questions`, { avoid });
    const { questions } = await res.json();
    expect(questions).not.toContain('Who makes the best widgets?');
    expect(questions).not.toContain('Is Acme any good?');
    expect(questions).toHaveLength(6);
  });
});

describe('more topic ideas', () => {
  it('adds new ideas, keeps the old ones, skips duplicates, and tells the AI what exists', async () => {
    await setup();
    const prompts = stubAi();
    const res = await call('POST', `/api/audits/${ID}/topics`);
    expect(res.status).toBe(200);
    const { contentTopics } = await res.json();
    const auth = contentTopics.authoritative.map((t: any) => t.topic);
    expect(auth.filter((t: string) => t === 'What is a good widget?')).toHaveLength(1);
    expect(auth.length).toBe(4);
    expect(contentTopics.thoughtLeadership).toHaveLength(3);
    expect(prompts[0].text).toContain('What is a good widget?');
    const saved = (await fakeDb.collection('audits').doc(ID).get()).data();
    expect(saved?.auditData.contentTopics.authoritative).toHaveLength(4);
  });

  it('is yours only', async () => {
    await setup();
    stubAi();
    const [code] = await generateCodes(1, { whiteLabel: false, channel: 'marketplace' });
    await activateCode('u2', code);
    await saveOpenRouterKey('u2', 'sk-or-v1-own-key-0123456789abcdef0123456700');
    expect((await call('POST', `/api/audits/${ID}/topics`, undefined, 'u2:c@d.com:true')).status).toBe(404);
    expect((await call('GET', `/api/audits/${ID}/history`, undefined, 'u2:c@d.com:true')).status).toBe(404);
  });
});

describe('history', () => {
  it('keeps a summary of each check, counts un-named questions separately, and joins audits of the same site', async () => {
    await setup();
    await fakeDb.collection('audits').doc(OTHER).set(auditDoc({ createdAt: '2026-10-01T00:00:00.000Z', overallScore: 40, letterGrade: 'D', citationHistory: [{ date: '2026-10-02T00:00:00.000Z', engines: ['Perplexity'], totalAnswers: 8, mentioned: 3, openTotal: 5, openNamed: 0, cost: 0.04 }] }));
    await fakeDb.collection('audits').doc('d4d4d4d4d4d4d4d4d4d4d4d4').set(auditDoc({ domain: 'other.com', overallScore: 99 }));
    stubAi();

    const run = await call('POST', `/api/audits/${ID}/citation-snapshot`, { engines: ['perplexity'] });
    expect(run.status).toBe(200);
    // A later check on the same audit adds to the history instead of replacing it.
    const saved = (await fakeDb.collection('audits').doc(ID).get()).data();
    await saveCitationSnapshot('u1', ID, saved?.auditData.citationSnapshot, { date: '2026-09-01T00:00:00.000Z', engines: ['Grok'], totalAnswers: 8, mentioned: 1, openTotal: 5, openNamed: 1, cost: 0.35 });

    const res = await call('GET', `/api/audits/${ID}/history`);
    expect(res.status).toBe(200);
    const h = await res.json();
    expect(h.scores.map((s: any) => s.score)).toEqual([40, 50]);
    expect(h.checks).toHaveLength(3);
    const newest = h.checks[0];
    expect(newest).toMatchObject({ engines: ['Perplexity'], totalAnswers: 8, openTotal: 5, cost: expect.any(Number) });
    expect(newest.openNamed).toBe(0);
    expect(newest.mentioned).toBe(3);
  });
});
