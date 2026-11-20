import { describe, it, expect } from 'vitest';
import {
  controlCharactersRule,
  requiredFieldsRule,
  customerIdRule,
  firstNameRule,
  lastNameRule,
  emailRule,
  phoneRule,
  normalizeTurkishPhone,
  birthDateRule,
  createdDateRule,
  dateOrderRule,
  parseIsoDate,
} from '../../../src/domain/customer/rules.js';

describe('Customer Validation Rules', () => {
  describe('controlCharactersRule (NUL byte & ASCII control protection)', () => {
    it('detects NUL byte (\\u0000) and returns INVALID_CONTROL_CHARACTER', () => {
      const row = {
        first_name: 'Ahmet\u0000',
        email: 'ahmet@example.com',
      };
      const result = controlCharactersRule(row);
      expect(result).toMatchObject([
        {
          code: 'INVALID_CONTROL_CHARACTER',
          field: 'first_name',
        },
      ]);
    });

    it('passes strings with normal characters', () => {
      const row = {
        first_name: 'Ahmet Can',
        last_name: 'Öztürk',
        email: 'ahmet@example.com',
      };
      expect(controlCharactersRule(row)).toBeNull();
    });
  });

  describe('requiredFieldsRule', () => {
    it('returns null when all required fields are present and non-empty', () => {
      const row = {
        customer_id: 'C-1',
        first_name: 'Ahmet',
        last_name: 'Kaya',
        national_id: '12345678901',
        email: 'ahmet@example.com',
        phone: '+905551234567',
        birth_date: '1990-01-01',
        created_date: '2020-01-01',
      };
      expect(requiredFieldsRule(row)).toBeNull();
    });

    it('collects all missing fields into issues array', () => {
      const row = {
        customer_id: 'C-1',
        first_name: '   ',
        national_id: '12345678901',
      };

      const result = requiredFieldsRule(row);
      expect(Array.isArray(result)).toBe(true);
      const issues = result as Array<{ code: string; field?: string }>;

      const missingFields = issues.map((i) => i.field);
      expect(missingFields).toContain('first_name');
      expect(missingFields).toContain('last_name');
      expect(missingFields).toContain('email');
      expect(missingFields).toContain('phone');
      expect(missingFields).toContain('birth_date');
      expect(missingFields).toContain('created_date');
      expect(issues.every((i) => i.code === 'REQUIRED_FIELD_MISSING')).toBe(true);
    });
  });

  describe('customerIdRule (Pattern & Length)', () => {
    const validIds = ['CUST-001', 'cust_123', 'A.B.C', '12345', 'X-Y-Z_1.0'];
    it.each(validIds)('accepts valid customer ID: %s', (id) => {
      expect(customerIdRule({ customer_id: id })).toBeNull();
    });

    const invalidIds = ['<script>', 'cust 123', 'cust@id', 'a'.repeat(101)];
    it.each(invalidIds)('rejects invalid customer ID: %s', (id) => {
      expect(customerIdRule({ customer_id: id })).toMatchObject({
        code: 'INVALID_CUSTOMER_ID',
      });
    });
  });

  describe('firstNameRule & lastNameRule', () => {
    it('rejects names with HTML tags or pure numbers', () => {
      expect(firstNameRule({ first_name: '<script>alert(1)</script>' })).toMatchObject({
        code: 'INVALID_FIRST_NAME',
      });
      expect(lastNameRule({ last_name: '123456' })).toMatchObject({
        code: 'INVALID_LAST_NAME',
      });
    });

    it('accepts valid Turkish and international names', () => {
      expect(firstNameRule({ first_name: 'Jean-Paul' })).toBeNull();
      expect(firstNameRule({ first_name: 'Ali Rıza' })).toBeNull();
      expect(lastNameRule({ last_name: "O'Connor" })).toBeNull();
      expect(lastNameRule({ last_name: 'Çalışkan' })).toBeNull();
    });
  });

  describe('emailRule (Table-driven tests)', () => {
    const validEmails = [
      'user@example.com',
      'first.last+tag@sub.domain.co',
      'customer.123@company.org.tr',
    ];
    it.each(validEmails)('accepts valid email: %s', (email) => {
      expect(emailRule({ email })).toBeNull();
    });

    const invalidEmails = [
      'plainaddress',
      'missing-at.com',
      'user@',
      '@domain.com',
      'user@domain',
      'user name@domain.com',
    ];
    it.each(invalidEmails)('rejects invalid email: %s', (email) => {
      expect(emailRule({ email })).toMatchObject({ code: 'INVALID_EMAIL' });
    });
  });

  describe('phoneRule & normalizeTurkishPhone', () => {
    const validPhones = [
      ['+90 555 123 45 67', '+905551234567'],
      ['0555 123 45 67', '+905551234567'],
      ['0 (555) 123-4567', '+905551234567'],
      ['5551234567', '+905551234567'],
      ['00905551234567', '+905551234567'],
    ];

    it.each(validPhones)('normalizes %s to %s', (input, expected) => {
      expect(normalizeTurkishPhone(input)).toBe(expected);
      expect(phoneRule({ phone: input })).toBeNull();
    });

    const invalidPhones = ['123456', '0212 123 45 67', '+1 555 123 4567', '555abcd'];
    it.each(invalidPhones)('rejects non-mobile or invalid phone: %s', (phone) => {
      expect(normalizeTurkishPhone(phone)).toBeNull();
      expect(phoneRule({ phone })).toMatchObject({ code: 'INVALID_PHONE' });
    });
  });

  describe('parseIsoDate', () => {
    it('correctly parses valid calendar dates', () => {
      const date = parseIsoDate('2020-02-29');
      expect(date).not.toBeNull();
      expect(date?.getUTCFullYear()).toBe(2020);
      expect(date?.getUTCMonth()).toBe(1);
      expect(date?.getUTCDate()).toBe(29);
    });

    it('rejects non-existent calendar dates', () => {
      expect(parseIsoDate('2021-02-29')).toBeNull();
      expect(parseIsoDate('2020-02-30')).toBeNull();
      expect(parseIsoDate('2020-04-31')).toBeNull();
    });
  });

  describe('Date boundary tests (Purity & Timezone Safety)', () => {
    const fixedToday = '2026-11-20';

    it('accepts today as valid date', () => {
      expect(birthDateRule({ birth_date: fixedToday }, { referenceToday: fixedToday })).toBeNull();
      expect(
        createdDateRule({ created_date: fixedToday }, { referenceToday: fixedToday }),
      ).toBeNull();
    });

    it('rejects tomorrow as future date', () => {
      const tomorrow = '2026-11-21';
      expect(birthDateRule({ birth_date: tomorrow }, { referenceToday: fixedToday })).toMatchObject(
        { code: 'DATE_IN_FUTURE' },
      );
      expect(
        createdDateRule({ created_date: tomorrow }, { referenceToday: fixedToday }),
      ).toMatchObject({ code: 'DATE_IN_FUTURE' });
    });
  });

  describe('dateOrderRule', () => {
    it('accepts created_date equal to birth_date (same-day newborn registration)', () => {
      expect(dateOrderRule({ birth_date: '2020-05-10', created_date: '2020-05-10' })).toBeNull();
    });

    it('accepts created_date after birth_date', () => {
      expect(dateOrderRule({ birth_date: '1990-01-01', created_date: '2020-01-01' })).toBeNull();
    });

    it('rejects created_date earlier than birth_date', () => {
      expect(dateOrderRule({ birth_date: '2000-01-01', created_date: '1990-01-01' })).toMatchObject(
        {
          code: 'CREATED_DATE_BEFORE_BIRTH_DATE',
        },
      );
    });
  });
});
