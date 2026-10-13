import { describe, expect, it } from 'vitest';
import { isOwnProduct } from '../server/services/citation-snapshot';

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
