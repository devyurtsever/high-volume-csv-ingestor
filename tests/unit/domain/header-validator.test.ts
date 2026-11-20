import { describe, it, expect } from 'vitest';
import {
  validateHeaders,
  normalizeHeader,
} from '../../../src/domain/import-job/header-validator.js';

describe('Header Validator', () => {
  it('normalizes BOM, whitespace, uppercase, and special characters', () => {
    expect(normalizeHeader('\uFEFFCustomer ID')).toBe('customer_id');
    expect(normalizeHeader('  First-Name  ')).toBe('first_name');
    expect(normalizeHeader('NATIONAL ID')).toBe('national_id');
    expect(normalizeHeader('Birth   Date')).toBe('birth_date');
  });

  it('accepts headers in any order when all 8 are present', () => {
    const rawHeaders = [
      'Customer ID',
      'First Name',
      'Last Name',
      'National ID',
      'Email',
      'Phone',
      'Birth Date',
      'Created Date',
    ];

    const result = validateHeaders(rawHeaders);
    expect(result.isValid).toBe(true);
    expect(result.missingHeaders).toHaveLength(0);
    expect(result.duplicateHeaders).toHaveLength(0);
    expect(result.unexpectedHeaders).toHaveLength(0);
  });

  it('strips UTF-8 BOM from the first header automatically', () => {
    const headersWithBom = [
      '\uFEFFCustomer ID',
      'First Name',
      'Last Name',
      'National ID',
      'Email',
      'Phone',
      'Birth Date',
      'Created Date',
    ];

    const result = validateHeaders(headersWithBom);
    expect(result.isValid).toBe(true);
    expect(result.normalizedHeaders[0]).toBe('customer_id');
  });

  it('rejects duplicate headers (e.g. Email, Email)', () => {
    const duplicateHeaders = [
      'Customer ID',
      'First Name',
      'Last Name',
      'National ID',
      'Email',
      'Email', // duplicate!
      'Phone',
      'Birth Date',
      'Created Date',
    ];

    const result = validateHeaders(duplicateHeaders);
    expect(result.isValid).toBe(false);
    expect(result.duplicateHeaders).toContain('email');
  });

  it('rejects unexpected extra headers to enforce strict schema contract', () => {
    const extraHeaders = [
      'Customer ID',
      'First Name',
      'Last Name',
      'National ID',
      'Email',
      'Phone',
      'Birth Date',
      'Created Date',
      'Unexpected_Column',
    ];

    const result = validateHeaders(extraHeaders);
    expect(result.isValid).toBe(false);
    expect(result.unexpectedHeaders).toContain('unexpected_column');
  });

  it('identifies missing headers and marks result as invalid', () => {
    const incompleteHeaders = ['Customer ID', 'First Name', 'Email'];

    const result = validateHeaders(incompleteHeaders);
    expect(result.isValid).toBe(false);
    expect(result.missingHeaders).toEqual([
      'last_name',
      'national_id',
      'phone',
      'birth_date',
      'created_date',
    ]);
  });
});
