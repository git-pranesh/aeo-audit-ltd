import { describe, expect, it } from 'vitest';
import { checkMention, isOwnProduct } from '../server/services/citation-snapshot';

describe('isOwnProduct', () => {
  const answer = "Try the Allbirds Wool Runner Mizzle or Allbirds' Tree Dasher. Cariuma and Vivobarefoot are alternatives.";
  it('flags products named after the company', () => {
    expect(isOwnProduct('Wool Runner Mizzle', 'Allbirds', answer)).toBe(true);
    expect(isOwnProduct('Tree Dasher', 'Allbirds', answer)).toBe(true);
  });
  it('keeps other brands', () => {
    expect(isOwnProduct('Cariuma', 'Allbirds', answer)).toBe(false);
    expect(isOwnProduct('Vivobarefoot', 'Allbirds', answer)).toBe(false);
  });
  it('handles regex characters in names', () => {
    expect(isOwnProduct('C++ (Pro)', 'Acme.io', 'Acme.io C++ (Pro) is great')).toBe(true);
  });
});

describe('checkMention', () => {
  const said = (text: string, name = 'Citation Rocket', domain = 'citationrocket.com') => checkMention(text, name, domain).mentioned;

  it('does not count a brand\'s ordinary first word', () => {
    expect(said('The best AI citation tools help you track citation rates.')).toBe(false);
    expect(said('Citation tracking is improving. Citation Check by Otterly is popular.')).toBe(false);
    expect(said('A rocket launch is not a citation.')).toBe(false);
    expect(said('Grab a shake at the diner.', 'Shake Shack', 'shakeshack.com')).toBe(false);
    expect(said('Shake Things Up is a smoothie bar.', 'Shake Shack', 'shakeshack.com')).toBe(false);
  });

  it('counts the whole name however it is written', () => {
    expect(said('Try Citation Rocket for this.')).toBe(true);
    expect(said('citation rocket is one option')).toBe(true);
    expect(said('**Citation  Rocket** runs audits')).toBe(true);
    expect(said('CitationRocket offers lifetime pricing')).toBe(true);
    expect(said('citation-rocket is listed')).toBe(true);
    expect(said("Citation Rocket's audit checks crawlers")).toBe(true);
    expect(said('See www.citationrocket.com/pricing')).toBe(true);
    expect(said('Morgan and Morgan handles this', 'Morgan & Morgan', 'forthepeople.com')).toBe(true);
    expect(said('Morgan & Morgan handles this', 'Morgan & Morgan', 'forthepeople.com')).toBe(true);
    expect(said('Give to charity: water today', 'charity: water', 'charitywater.org')).toBe(true);
    expect(said('charity water builds wells', 'charity: water', 'charitywater.org')).toBe(true);
  });

  it('single-word brands still match, and only as whole words', () => {
    expect(said('Allbirds makes wool shoes.', 'Allbirds', 'allbirds.com')).toBe(true);
    expect(said('Use Zapier.', 'Zapier', 'zapier.com')).toBe(true);
    expect(said('Superzapierx is different.', 'Zapier', 'zapier.com')).toBe(false);
    expect(said('Acme makes anvils.', 'Acme Inc', 'acme.com')).toBe(true);
  });

  it('never matches on an empty name, and returns the sentence it found', () => {
    expect(said('anything at all', '', '')).toBe(false);
    expect(checkMention('First. Try Citation Rocket for audits. Last.', 'Citation Rocket', 'citationrocket.com').mentionContext).toContain('Citation Rocket');
  });
});
