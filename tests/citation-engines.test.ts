import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { fakeDb } from './setup';
import { registerRoutes } from '../server/routes';
import { generateCitationSnapshot } from '../server/services/citation-snapshot';
import { CUSTOM_ENGINE, ENGINES, countAnswers, estimateCheckUsd } from '../shared/engines';
import { generateCodes, activateCode } from '../server/services/license-service';
import { saveOpenRouterKey } from '../server/services/user-service';

const COMPANY = 'Acme';
const FIVE = ENGINES.map((e) => ({ id: e.id, label: e.label, model: e.model }));
const QUESTIONS = { brand: ['What is Acme known for today?', 'Is Acme any good to use?', 'What do people say about Acme?'], category: ['What are the best widget makers?', 'Who makes the best cheap widgets?', 'Which widget brand is most trusted?', 'Where should I buy widgets online?', 'What widget should a beginner buy?'] };

/** Fake OpenRouter: writes questions, answers per model, and charges 1 cent a call. */
function stubOpenRouter(answer: (model: string, question: string) => Response | string) {
  const asked: { model: string; question: string }[] = [];
  const chat = (content: string) => Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.01 } });
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const text: string = body.messages[0].content;
    if (body.response_format || text.startsWith('Write the questions') || text.includes('### ANSWER')) {
      if (text.includes('### ANSWER')) return chat('{"results": []}');
      return chat(JSON.stringify(QUESTIONS));
    }
    asked.push({ model: body.model, question: text });
    const out = answer(body.model, text);
    return typeof out === 'string' ? chat(out) : out;
  }));
  return asked;
}

const base_params = { websiteUrl: 'https://acme.com/', industry: 'Widgets', companyName: COMPANY, keywords: ['widgets'], apiKey: 'sk-or-test' };
let runId = 0;
const freshParams = () => ({ ...base_params, auditId: `audit-${++runId}` });

afterEach(() => vi.unstubAllGlobals());

describe('five-engine citation check', () => {
  it('asks every engine the same 8 questions and scores each one separately', async () => {
    const asked = stubOpenRouter((model) => (model.startsWith('anthropic/') || model === 'perplexity/sonar' ? 'Acme is a great choice.' : 'Try Widgetron instead.'));
    const r = await generateCitationSnapshot({ ...freshParams(), engines: FIVE });

    expect(asked).toHaveLength(40);
    for (const e of ENGINES) expect(asked.filter((a) => a.model === e.model)).toHaveLength(8);
    const sets = ENGINES.map((e) => asked.filter((a) => a.model === e.model).map((a) => a.question).sort().join('|'));
    expect(new Set(sets).size).toBe(1);

    expect(r.totalPromptsChecked).toBe(40);
    expect(r.mentionedCount).toBe(16);
    expect(r.mentionRate).toBe(40);
    expect(r.engines?.map((e) => e.id)).toEqual(ENGINES.map((e) => e.id));
    expect(r.engines?.find((e) => e.id === 'claude')).toMatchObject({ answered: 8, mentionedCount: 8, mentionRate: 100, failed: false });
    expect(r.engines?.find((e) => e.id === 'grok')).toMatchObject({ answered: 8, mentionedCount: 0, mentionRate: 0, failed: false });
    expect(r.promptResults.every((p) => !!p.engine)).toBe(true);
  });

  it('reports what OpenRouter really charged', async () => {
    stubOpenRouter(() => 'Acme is fine.');
    const r = await generateCitationSnapshot({ ...freshParams(), engines: FIVE.slice(0, 2) });
    // 1 question-writing call, 16 answers, 2 name clean-ups, at 1 cent each.
    expect(r.estimatedCost).toBeCloseTo(0.19, 5);
  });

  it('one engine being down never relabels or sinks the others', async () => {
    const asked = stubOpenRouter((model) => (model.startsWith('x-ai/') ? new Response('{}', { status: 503 }) : 'Acme is great.'));
    const r = await generateCitationSnapshot({ ...freshParams(), engines: FIVE });

    expect(asked.filter((a) => a.model.startsWith('x-ai/'))).toHaveLength(8);
    expect(asked.filter((a) => a.model === 'google/gemini-2.5-flash-lite:online')).toHaveLength(8); // no backup calls added
    expect(r.engines?.find((e) => e.id === 'grok')).toMatchObject({ answered: 0, failed: true, mentionRate: 0 });
    expect(r.totalPromptsChecked).toBe(32);
    expect(r.mentionRate).toBe(100);
  });

  it('stops with the key error when the key is out of credit', async () => {
    stubOpenRouter(() => new Response('{}', { status: 402 }));
    await expect(generateCitationSnapshot({ ...freshParams(), engines: FIVE })).rejects.toMatchObject({ code: 'KEY_NO_CREDIT' });
  });

  it('keeps the answers already paid for when the key runs out part way', async () => {
    let answered = 0;
    stubOpenRouter(() => {
      answered += 1;
      return answered <= 12 ? 'Acme is great.' : new Response(JSON.stringify({ error: { message: 'Key limit exceeded', metadata: { limit_source: 'openrouter_key_limit' } } }), { status: 403 });
    });
    const r = await generateCitationSnapshot({ ...freshParams(), engines: FIVE });
    expect(r.stoppedEarly).toContain('spending limit');
    expect(r.totalPromptsChecked).toBe(12);
    expect(r.mentionedCount).toBe(12);
    expect(r.promptResults.filter((p) => p.fullResponse).length).toBe(12);
  });

  it('says so plainly when no engine answers', async () => {
    stubOpenRouter(() => new Response('{}', { status: 503 }));
    await expect(generateCitationSnapshot({ ...freshParams(), engines: FIVE })).rejects.toMatchObject({ code: 'UPSTREAM', message: expect.stringContaining('None of the AI engines') });
  });

  it('keeps stored answers small enough for the audit document', async () => {
    stubOpenRouter(() => `Acme. ${'long answer '.repeat(2000)}`);
    const r = await generateCitationSnapshot({ ...freshParams(), engines: FIVE });
    expect(Math.max(...r.promptResults.map((p) => p.fullResponse.length))).toBeLessThanOrEqual(3000);
    expect(JSON.stringify(r).length).toBeLessThan(300_000);
  });

  it('still runs a single engine the old way when none are chosen', async () => {
    const asked = stubOpenRouter(() => 'Acme is great.');
    const r = await generateCitationSnapshot(freshParams());
    expect(new Set(asked.map((a) => a.model))).toEqual(new Set(['perplexity/sonar']));
    expect(r.engines).toBeUndefined();
    expect(r.totalPromptsChecked).toBe(8);
  });

  it('estimates the cost before you press the button', () => {
    expect(estimateCheckUsd(['perplexity'])).toBeCloseTo(0.0468, 3);
    const all = estimateCheckUsd(ENGINES.map((e) => e.id));
    expect(all).toBeGreaterThan(0.9);
    expect(all).toBeLessThan(1);
  });
});

describe('citation check route', () => {
  let server: Server;
  let base = '';
  const realFetch = fetch;

  beforeAll(() => {
    const app = express();
    app.use(express.json());
    registerRoutes(app);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  const setup = async () => {
    const [code] = await generateCodes(1, { whiteLabel: false, channel: 'marketplace' });
    await activateCode('u1', code);
    await saveOpenRouterKey('u1', 'sk-or-v1-own-key-0123456789abcdef0123456789');
    await fakeDb.collection('audits').doc('a1a1a1a1a1a1a1a1a1a1a1a1').set({ userId: 'u1', status: 'completed', websiteUrl: 'https://acme.com/', domain: 'acme.com', createdAt: 'now', context: { companyName: COMPANY, industry: 'Widgets', keywords: ['widgets'] }, auditData: { auditResults: { overallScore: 50 } } });
  };
  const post = (body?: object) => realFetch(`${base}/api/audits/a1a1a1a1a1a1a1a1a1a1a1a1/citation-snapshot`, { method: 'POST', headers: { Authorization: 'Bearer u1:a@b.com:true', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

  it('rejects unknown engines before spending anything', async () => {
    await setup();
    const asked = stubOpenRouter(() => 'Acme.');
    const res = await post({ engines: ['perplexity', 'made-up'] });
    expect(res.status).toBe(400);
    expect(asked).toHaveLength(0);
  });

  it('runs the chosen engines and saves one result on the audit', async () => {
    await setup();
    const asked = stubOpenRouter(() => 'Acme is great.');
    const res = await post({ engines: ['perplexity', 'gemini'] });
    expect(res.status).toBe(200);
    expect((await res.json()).citationSnapshot.engines.map((e: any) => e.id)).toEqual(['perplexity', 'gemini']);
    expect(asked).toHaveLength(16);
    const saved = (await fakeDb.collection('audits').doc('a1a1a1a1a1a1a1a1a1a1a1a1').get()).data();
    expect(saved?.auditData.citationSnapshot.engines).toHaveLength(2);
  });

  it('refuses "your model" when none is set in Settings', async () => {
    await setup();
    stubOpenRouter(() => 'Acme.');
    const res = await post({ engines: [CUSTOM_ENGINE] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('at least one');
  });
});

describe('countAnswers', () => {
  it('counts answers to questions that name the business apart from the rest', () => {
    const results = [
      { prompt: 'Is Acme any good?', mentioned: true, engine: 'gpt' },
      { prompt: 'Who makes the best widgets?', mentioned: false, engine: 'gpt' },
      { prompt: 'Who makes the best widgets?', mentioned: true, engine: 'grok' },
      { prompt: 'Which widget lasts longest?', mentioned: false, engine: 'grok', error: 'failed' },
    ];
    expect(countAnswers(results, 'Acme')).toEqual({ open: 2, openNamed: 1, byName: 1, byNameNamed: 1 });
    expect(countAnswers(results, 'Acme', 'gpt')).toEqual({ open: 1, openNamed: 0, byName: 1, byNameNamed: 1 });
  });
});
