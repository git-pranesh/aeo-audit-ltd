import { describe, it, expect } from 'vitest';
import { filterValidCompetitors } from '../server/domain-validator';
import { calculatePlatformScoresV2 } from '../server/scoring-service';

describe('Anti-Hallucination Tests', () => {
  describe('Competitor Domain Validation', () => {
    it('should validate real domains as valid', async () => {
      const { valid, invalid } = await filterValidCompetitors(['google.com', 'github.com']);
      expect(valid).toContain('google.com');
      expect(valid).toContain('github.com');
      expect(invalid.length).toBe(0);
    }, 15000);

    it('should reject non-existent domains', async () => {
      const fakeDomains = [
        'this-domain-definitely-does-not-exist-12345.com',
        'fake-hallucinated-competitor-xyz.io'
      ];
      const { valid, invalid } = await filterValidCompetitors(fakeDomains);
      expect(valid.length).toBe(0);
      expect(invalid.length).toBe(2);
    }, 15000);

    it('should handle mixed valid and invalid domains', async () => {
      const mixedDomains = [
        'google.com',
        'nonexistent-fake-domain-12345.com',
        'github.com'
      ];
      const { valid, invalid } = await filterValidCompetitors(mixedDomains);
      expect(valid).toContain('google.com');
      expect(valid).toContain('github.com');
      expect(invalid).toContain('nonexistent-fake-domain-12345.com');
    }, 15000);

    it('should handle empty array', async () => {
      const { valid, invalid } = await filterValidCompetitors([]);
      expect(valid.length).toBe(0);
      expect(invalid.length).toBe(0);
    });

    it('should handle domains with various formats', async () => {
      const domains = [
        'example.com',
        'www.example.com',
        'sub.example.com'
      ];
      const { valid } = await filterValidCompetitors(domains);
      expect(valid.length).toBeGreaterThanOrEqual(1);
    }, 15000);
  });

  describe('Signal-Based Scoring (No AI Dependency)', () => {
    it('should import scoring functions without errors', async () => {
      const module = await import('../server/content-signal-service');
      expect(typeof module.extractContentSignals).toBe('function');
      expect(typeof calculatePlatformScoresV2).toBe('function');
    });

    it('should return scores object with all platforms', async () => {
      const { extractContentSignals } = await import('../server/content-signal-service');
      
      const signals = extractContentSignals('<html><body><p>Test content</p></body></html>', 'Test content', [], {});
      const result = calculatePlatformScoresV2(signals, 0, 0);
      
      expect(result).toHaveProperty('platformScores');
      expect(result.platformScores).toHaveProperty('chatgpt');
      expect(result.platformScores).toHaveProperty('perplexity');
      expect(result.platformScores).toHaveProperty('gemini');
      expect(result.platformScores).toHaveProperty('claude');
      expect(typeof result.platformScores.chatgpt).toBe('number');
      expect(typeof result.platformScores.perplexity).toBe('number');
      expect(typeof result.platformScores.gemini).toBe('number');
      expect(typeof result.platformScores.claude).toBe('number');
    });

    it('should return reasonable scores for minimal content', async () => {
      const { extractContentSignals } = await import('../server/content-signal-service');
      
      const signals = extractContentSignals('<html></html>', '', [], {});
      const result = calculatePlatformScoresV2(signals, 0, 0);
      
      expect(result.platformScores.chatgpt).toBeLessThanOrEqual(80);
      expect(result.platformScores.perplexity).toBeLessThanOrEqual(80);
      expect(result.platformScores.gemini).toBeLessThanOrEqual(80);
      expect(result.platformScores.claude).toBeLessThanOrEqual(80);
    });

    it('should return higher scores for content-rich pages', async () => {
      const { extractContentSignals } = await import('../server/content-signal-service');
      
      const richHtml = `
        <html>
          <head>
            <script type="application/ld+json">{"@type": "FAQPage"}</script>
            <script type="application/ld+json">{"@type": "HowTo"}</script>
          </head>
          <body>
            <h1>Complete Tutorial</h1>
            <h2>Step by Step Guide</h2>
            <p>How to accomplish this task step by step with detailed instructions.</p>
            <h2>FAQ Section</h2>
            <p>Question: What is this? Answer: A comprehensive guide.</p>
            <a href="https://research-source.com">External Research</a>
            <a href="https://data-source.org">Statistics Source</a>
            <h3>Case Study: Client Success</h3>
            <p>Our framework helped increase conversion by 150%.</p>
          </body>
        </html>
      `;
      const richText = 'Complete tutorial with step by step guide and FAQ section and case study showing 150% improvement.';
      const sitemapUrls = [
        'https://example.com/tutorials/getting-started',
        'https://example.com/how-to/guide',
        'https://example.com/faq',
        'https://example.com/case-studies/client-a'
      ];
      
      const signals = extractContentSignals(richHtml, richText, sitemapUrls, {});
      const result = calculatePlatformScoresV2(signals, 0, 0);
      
      expect(result.platformScores.chatgpt).toBeGreaterThan(0);
      expect(result.platformScores.perplexity).toBeGreaterThan(0);
      expect(result.platformScores.gemini).toBeGreaterThan(0);
      expect(result.platformScores.claude).toBeGreaterThan(0);
    });

    it('should return consistent scores for same input', async () => {
      const { extractContentSignals } = await import('../server/content-signal-service');
      
      const html = '<html><body><h1>Test</h1><p>Content</p></body></html>';
      const text = 'Test content';
      
      const signals1 = extractContentSignals(html, text, [], {});
      const signals2 = extractContentSignals(html, text, [], {});
      const result1 = calculatePlatformScoresV2(signals1, 0, 0);
      const result2 = calculatePlatformScoresV2(signals2, 0, 0);
      
      expect(result1.platformScores.chatgpt).toBe(result2.platformScores.chatgpt);
      expect(result1.platformScores.perplexity).toBe(result2.platformScores.perplexity);
      expect(result1.platformScores.gemini).toBe(result2.platformScores.gemini);
      expect(result1.platformScores.claude).toBe(result2.platformScores.claude);
    });
  });

  describe('Score Boundaries', () => {
    it('should never return scores above 100', async () => {
      const { extractContentSignals } = await import('../server/content-signal-service');
      
      const extremeHtml = `
        <html>
          <body>
            ${Array(100).fill('<h1>Tutorial</h1><p>Step by step guide how to do something.</p>').join('')}
            ${Array(50).fill('<p>FAQ Question Answer</p>').join('')}
            ${Array(50).fill('<a href="https://external.com">Link</a>').join('')}
          </body>
        </html>
      `;
      const extremeText = Array(1000).fill('tutorial how to step by step faq question answer case study framework').join(' ');
      const manyUrls = Array(100).fill(null).map((_, i) => `https://example.com/tutorials/guide-${i}`);
      
      const signals = extractContentSignals(extremeHtml, extremeText, manyUrls, {});
      const result = calculatePlatformScoresV2(signals, 0, 0);
      
      expect(result.platformScores.chatgpt).toBeLessThanOrEqual(100);
      expect(result.platformScores.perplexity).toBeLessThanOrEqual(100);
      expect(result.platformScores.gemini).toBeLessThanOrEqual(100);
      expect(result.platformScores.claude).toBeLessThanOrEqual(100);
    });

    it('should never return scores below 0', async () => {
      const { extractContentSignals } = await import('../server/content-signal-service');
      
      const signals = extractContentSignals('', '', [], {});
      const result = calculatePlatformScoresV2(signals, 0, 0);
      
      expect(result.platformScores.chatgpt).toBeGreaterThanOrEqual(0);
      expect(result.platformScores.perplexity).toBeGreaterThanOrEqual(0);
      expect(result.platformScores.gemini).toBeGreaterThanOrEqual(0);
      expect(result.platformScores.claude).toBeGreaterThanOrEqual(0);
    });
  });
});
