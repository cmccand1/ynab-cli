import { describe, expect, it } from 'vitest';
import { parseIntegerOption, parseNumberOption } from './command-utils.js';

describe('parseNumberOption', () => {
  it('parses integers, decimals, and negative amounts', () => {
    expect(parseNumberOption('10')).toBe(10);
    expect(parseNumberOption('10.50')).toBe(10.5);
    expect(parseNumberOption('-21.40')).toBe(-21.4);
  });

  it.each(['abc', '', ' ', '12abc', 'NaN', 'Infinity'])('rejects %j', (value) => {
    expect(() => parseNumberOption(value)).toThrow('Must be a number.');
  });
});

describe('parseIntegerOption', () => {
  it('parses whole numbers', () => {
    expect(parseIntegerOption('5')).toBe(5);
    expect(parseIntegerOption('0')).toBe(0);
  });

  it('rejects decimals', () => {
    expect(() => parseIntegerOption('1.5')).toThrow('Must be a whole number.');
  });

  it('rejects non-numeric input', () => {
    expect(() => parseIntegerOption('abc')).toThrow('Must be a number.');
  });
});
