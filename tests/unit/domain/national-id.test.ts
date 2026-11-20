import { describe, it, expect } from 'vitest';
import { isValidNationalId } from '../../../src/domain/customer/national-id.js';

describe('isValidNationalId (TCKN Algorithm)', () => {
  // Valid TCKNs generated strictly conforming to the official checksum algorithm
  const validIds = [
    '10000000146',
    '12345678950',
    '11111111110',
    '36548174514',
    '51428394028',
    '19191919190', // Negative diff: oddSum * 7 (35) - evenSum (36) = -1
  ];

  it.each(validIds)('returns true for valid TCKN: %s', (id) => {
    expect(isValidNationalId(id)).toBe(true);
  });

  it('rejects null, undefined, and empty string', () => {
    expect(isValidNationalId(null)).toBe(false);
    expect(isValidNationalId(undefined)).toBe(false);
    expect(isValidNationalId('')).toBe(false);
    expect(isValidNationalId('   ')).toBe(false);
  });

  it('rejects IDs with length not equal to 11', () => {
    expect(isValidNationalId('1000000014')).toBe(false); // 10 digits
    expect(isValidNationalId('100000001461')).toBe(false); // 12 digits
  });

  it('rejects IDs starting with 0', () => {
    expect(isValidNationalId('01234567890')).toBe(false);
  });

  it('rejects IDs containing non-digit characters', () => {
    expect(isValidNationalId('1000000014a')).toBe(false);
    expect(isValidNationalId('10000 00146')).toBe(false);
    expect(isValidNationalId('100-000-146')).toBe(false);
  });

  it('rejects IDs when 10th digit checksum fails', () => {
    // 10000000146 is valid; changing 10th digit '4' to '5' makes it invalid
    expect(isValidNationalId('10000000156')).toBe(false);
  });

  it('rejects IDs when 11th digit checksum fails', () => {
    // 10000000146 is valid; changing 11th digit '6' to '7' makes it invalid
    expect(isValidNationalId('10000000147')).toBe(false);
  });

  it('correctly handles cases where (oddSum * 7 - evenSum) is negative', () => {
    // In JS remainder, negative % 10 is negative unless normalized by ((x % 10) + 10) % 10
    // oddSum = 5 (1*5), 5*7 = 35. evenSum = 36 (9*4). diff = -1.
    // Normalized 10th digit is 9.
    expect(isValidNationalId('19191919190')).toBe(true);
  });
});
