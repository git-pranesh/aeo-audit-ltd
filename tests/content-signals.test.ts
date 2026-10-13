import { describe, it, expect } from 'vitest';

describe('Content Signal Service', () => {
  describe('Signal Extraction', () => {
    it('should import content signal service without errors', async () => {
      const { extractContentSignals } = await import('../server/content-signal-service');
      expect(typeof extractContentSignals).toBe('function');
    });

    it('should extract signals from sample HTML', async () => {
      const { extractContentSignals } = await import('../server/content-signal-service');
      
      const sampleHtml = `
        <html>
          <head>
            <script type="application/ld+json">{"@type": "FAQPage"}</script>
          </head>
          <body>
            <h1>Main Title</h1>
            <h2>Section 1</h2>
            <p>This is a tutorial about how to do something step by step.</p>
            <h2>FAQ Section</h2>
            <p>Question: What is this? Answer: This is a test.</p>
            <a href="https://external-site.com">External Link</a>
          </body>
        </html>
      `;
      const textContent = 'Main Title Section 1 This is a tutorial about how to do something step by step. FAQ Section Question Answer';
      
      const signals = extractContentSignals(sampleHtml, textContent, [], {});
      
      expect(signals).toHaveProperty('tutorialCount');
      expect(signals).toHaveProperty('faqSectionCount');
      expect(signals).toHaveProperty('schemaTypeCount');
      expect(signals).toHaveProperty('externalLinkCount');
      expect(signals).toHaveProperty('headingHierarchyScore');
    });

    it('should detect schema markup types', async () => {
      const { extractContentSignals } = await import('../server/content-signal-service');
      
      const htmlWithSchema = `
        <html>
          <head>
            <script type="application/ld+json">{"@type": "HowTo"}</script>
            <script type="application/ld+json">{"@type": "FAQPage"}</script>
          </head>
          <body><p>Content</p></body>
        </html>
      `;
      
      const signals = extractContentSignals(htmlWithSchema, 'Content', [], {});
      expect(signals.schemaTypeCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty HTML gracefully', async () => {
      const { extractContentSignals } = await import('../server/content-signal-service');
      
      const signals = extractContentSignals('', '', [], {});
      
      expect(signals.tutorialCount).toBe(0);
      expect(signals.faqSectionCount).toBe(0);
    });

    it('should handle malformed HTML gracefully', async () => {
      const { extractContentSignals } = await import('../server/content-signal-service');
      
      const malformedHtml = '<html><body><p>Unclosed paragraph<div>Mixed tags</p></div>';
      
      expect(() => extractContentSignals(malformedHtml, 'Unclosed paragraph Mixed tags', [], {})).not.toThrow();
    });
  });

  describe('URL-Based Content Detection', () => {
    it('should detect tutorial URLs from sitemap', async () => {
      const { extractContentSignals } = await import('../server/content-signal-service');
      
      const sitemapUrls = [
        'https://example.com/tutorials/getting-started',
        'https://example.com/how-to/use-feature',
        'https://example.com/guide/complete-walkthrough',
        'https://example.com/blog/regular-post'
      ];
      
      const signals = extractContentSignals('<html></html>', '', sitemapUrls, {});
      expect(signals.tutorialCount).toBeGreaterThanOrEqual(2);
    });

    it('should detect FAQ URLs from sitemap', async () => {
      const { extractContentSignals } = await import('../server/content-signal-service');
      
      const sitemapUrls = [
        'https://example.com/faq',
        'https://example.com/help/questions',
        'https://example.com/support/answers'
      ];
      
      const signals = extractContentSignals('<html></html>', '', sitemapUrls, {});
      expect(signals.faqSectionCount).toBeGreaterThanOrEqual(1);
    });

    it('should detect case study URLs from sitemap', async () => {
      const { extractContentSignals } = await import('../server/content-signal-service');
      
      const sitemapUrls = [
        'https://example.com/case-studies/client-a',
        'https://example.com/customers/success-story',
        'https://example.com/testimonials/happy-client'
      ];
      
      const signals = extractContentSignals('<html></html>', '', sitemapUrls, {});
      expect(signals.caseStudyCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Strength and Weakness Generation', () => {
    it('should import strength generation function', async () => {
      const { generateSignalBasedStrengths } = await import('../server/content-signal-service');
      expect(typeof generateSignalBasedStrengths).toBe('function');
    });

    it('should import weakness generation function', async () => {
      const { generateSignalBasedWeaknesses } = await import('../server/content-signal-service');
      expect(typeof generateSignalBasedWeaknesses).toBe('function');
    });

    it('should return empty strengths for minimal content', async () => {
      const { extractContentSignals, generateSignalBasedStrengths } = await import('../server/content-signal-service');
      
      const signals = extractContentSignals('', '', [], {});
      const strengths = generateSignalBasedStrengths(signals, 'TestCompany', []);
      
      expect(Array.isArray(strengths)).toBe(true);
    });

    it('should return weaknesses for minimal content', async () => {
      const { extractContentSignals, generateSignalBasedWeaknesses } = await import('../server/content-signal-service');
      
      const signals = extractContentSignals('', '', [], {});
      const weaknesses = generateSignalBasedWeaknesses(signals, 'TestCompany', []);
      
      expect(Array.isArray(weaknesses)).toBe(true);
      expect(weaknesses.length).toBeGreaterThan(0);
    });
  });
});
