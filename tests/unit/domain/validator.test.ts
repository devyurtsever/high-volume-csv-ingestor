import { describe, it, expect } from 'vitest';
import { validateRow, normalizeRow } from '../../../src/domain/customer/validator.js';
import type { RawCustomerRow, ValidationRule } from '../../../src/domain/customer/types.js';

describe('Customer Validator (validateRow & normalizeRow)', () => {
  it('returns an empty array when the row is completely valid', () => {
    const validRow: RawCustomerRow = {
      customer_id: 'CUST-100',
      first_name: 'Mehmet',
      last_name: 'Demir',
      national_id: '10000000146',
      email: 'mehmet.demir@example.com',
      phone: '+90 532 123 45 67',
      birth_date: '1992-06-20',
      created_date: '2024-01-15',
    };

    const issues = validateRow(validRow);
    expect(issues).toHaveLength(0);

    const normalized = normalizeRow(validRow);
    expect(normalized).toEqual({
      customer_id: 'CUST-100',
      first_name: 'Mehmet',
      last_name: 'Demir',
      national_id: '10000000146',
      email: 'mehmet.demir@example.com',
      phone: '+905321234567',
      birth_date: '1992-06-20',
      created_date: '2024-01-15',
    });
  });

  it('collects ALL issues simultaneously on a broken row (Collect-All)', () => {
    const multiErrorRow: RawCustomerRow = {
      customer_id: 'CUST-200',
      first_name: 'Ali',
      last_name: 'Veli',
      national_id: '11111111111', // Invalid TCKN algorithm checksum
      email: 'not-an-email', // Invalid email
      phone: '12345', // Invalid phone
      birth_date: '2999-01-01', // Future birth date
      created_date: '1980-01-01', // Created before birth date
    };

    const issues = validateRow(multiErrorRow);

    const issueCodes = issues.map((i) => i.code);
    expect(issueCodes).toContain('INVALID_NATIONAL_ID');
    expect(issueCodes).toContain('INVALID_EMAIL');
    expect(issueCodes).toContain('INVALID_PHONE');
    expect(issueCodes).toContain('DATE_IN_FUTURE');
    expect(issueCodes).toContain('CREATED_DATE_BEFORE_BIRTH_DATE');
    expect(issues.length).toBeGreaterThanOrEqual(5);
  });

  it('demonstrates Open-Closed Principle (OCP) by accepting custom rules without modifying core validator', () => {
    const customVipRule: ValidationRule = (row) => {
      if (row.customer_id?.startsWith('VIP') && !row.email?.endsWith('@vip.com')) {
        return {
          code: 'INVALID_EMAIL',
          message: 'VIP customers must use @vip.com domain',
          field: 'email',
        };
      }
      return null;
    };

    const row: RawCustomerRow = {
      customer_id: 'VIP-001',
      email: 'user@regular.com',
    };

    const issues = validateRow(row, [customVipRule]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe('VIP customers must use @vip.com domain');
  });

  it('normalizes email to lowercase and trims surrounding whitespace', () => {
    const row: RawCustomerRow = {
      customer_id: '  C-10  ',
      first_name: '  Ayse  ',
      last_name: '  Yilmaz  ',
      national_id: '10000000146',
      email: '  AYSE.YILMAZ@Example.COM  ',
      phone: '0544 987 65 43',
      birth_date: '1995-10-10',
      created_date: '2023-05-01',
    };

    const normalized = normalizeRow(row);
    expect(normalized.customer_id).toBe('C-10');
    expect(normalized.first_name).toBe('Ayse');
    expect(normalized.last_name).toBe('Yilmaz');
    expect(normalized.email).toBe('ayse.yilmaz@example.com');
    expect(normalized.phone).toBe('+905449876543');
  });
});
