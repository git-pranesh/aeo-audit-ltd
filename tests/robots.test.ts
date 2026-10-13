import { describe, expect, it } from 'vitest';
import { getBlockedBots } from '../server/engine/ai-bot-auditor';

const BOTS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'OAI-SearchBot'];

describe('robots.txt parsing', () => {
  it('blocks every bot under a global disallow (case-insensitive keys)', () => {
    expect(getBlockedBots('user-agent: *\nDISALLOW: /', BOTS)).toEqual(BOTS);
  });
  it('a bot-specific group overrides "*"', () => {
    const txt = 'User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /';
    expect(getBlockedBots(txt, BOTS)).toEqual(['ClaudeBot', 'PerplexityBot', 'OAI-SearchBot']);
  });
  it('handles grouped user-agents and comments', () => {
    const txt = '# AI\nUser-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: / # no AI\n\nUser-agent: *\nDisallow: /admin';
    expect(getBlockedBots(txt, BOTS)).toEqual(['GPTBot', 'ClaudeBot']);
  });
  it('partial disallows are not a full block', () => {
    expect(getBlockedBots('User-agent: *\nDisallow: /private\nDisallow:', BOTS)).toEqual([]);
  });
});
