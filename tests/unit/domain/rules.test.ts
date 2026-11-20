import { describe, it, expect } from 'vitest';
import {
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
        first_name: '   ', // whitespace counts as empty
        // last_name is omitted
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

  describe('customerIdRule, firstNameRule, lastNameRule', () => {
    it('rejects fields exceeding 100 characters', () => {
      const longStr = 'a'.repeat(101);
      expect(customerIdRule({ customer_id: longStr })).toMatchObject({
        code: 'INVALID_CUSTOMER_ID',
      });
      expect(firstNameRule({ first_name: longStr })).toMatchObject({
        code: 'INVALID_FIRST_NAME',
      });
      expect(lastNameRule({ last_name: longStr })).toMatchObject({
        code: 'INVALID_LAST_NAME',
      });
    });

    it('accepts fields within 100 characters', () => {
      const normalStr = 'a'.repeat(100);
      expect(customerIdRule({ customer_id: normalStr })).toBeNull();
      expect(firstNameRule({ first_name: normalStr })).toBeNull();
      expect(lastNameRule({ last_name: normalStr })).toBeNull();
    });
  });

  describe('emailRule', () => {
    it('accepts valid email addresses', () => {
      expect(emailRule({ email: 'user@example.com' })).toBeNull();
      expect(emailRule({ email: 'first.last+tag@sub.domain.co' })).toBeNull();
    });

    it('rejects invalid email addresses', () => {
      expect(emailRule({ email: 'plainaddress' })).toMatchObject({ code: 'INVALID_EMAIL' });
      expect(emailRule({ email: 'missing-at.com' })).toMatchObject({ code: 'INVALID_EMAIL' });
      expect(emailRule({ email: 'user@' })).toMatchObject({ code: 'INVALID_EMAIL' });
      expect(emailRule({ email: '@domain.com' })).toMatchObject({ code: 'INVALID_EMAIL' });
      expect(emailRule({ email: 'user@domain' })).toMatchObject({ code: 'INVALID_EMAIL' });
    });

    it('rejects emails exceeding 255 characters', () => {
      const longEmail = `${'a'.repeat(250)}@example.com`;
      expect(emailRule({ email: longEmail })).toMatchObject({ code: 'INVALID_EMAIL' });
    });
  });

  describe('phoneRule & normalizeTurkishPhone', () => {
    it('normalizes valid Turkish mobile numbers to +905XXXXXXXXX format', () => {
      expect(normalizeTurkishPhone('+90 555 123 45 67')).toBe('+905551234567');
      expect(normalizeTurkishPhone('0555 123 45 67')).toBe('+905551234567');
      expect(normalizeTurkishPhone('0 (555) 123-4567')).toBe('+905551234567');
      expect(normalizeTurkishPhone('5551234567')).toBe('+905551234567');
      expect(normalizeTurkishPhone('00905551234567')).toBe('+905551234567');
    });

    it('rejects invalid or non-Turkish mobile phone numbers', () => {
      expect(normalizeTurkishPhone('123456')).toBeNull();
      expect(normalizeTurkishPhone('0212 123 45 67')).toBeNull(); // landline
      expect(normalizeTurkishPhone('+1 555 123 4567')).toBeNull(); // US
      expect(phoneRule({ phone: '12345' })).toMatchObject({ code: 'INVALID_PHONE' });
    });
  });

  describe('parseIsoDate', () => {
    it('correctly parses valid calendar dates', () => {
      const date = parseIsoDate('2020-02-29'); // Leap year
      expect(date).not.toBeNull();
      expect(date?.getUTCFullYear()).toBe(2020);
      expect(date?.getUTCMonth()).toBe(1);
      expect(date?.getUTCDate()).toBe(29);
    });

    it('rejects non-existent calendar dates (e.g., February 30)', () => {
      expect(parseIsoDate('2021-02-29')).toBeNull(); // Non-leap year
      expect(parseIsoDate('2020-02-30')).toBeNull();
      expect(parseIsoDate('2020-04-31')).toBeNull();
    });

    it('rejects invalid format strings', () => {
      expect(parseIsoDate('2020/01/01')).toBeNull();
      expect(parseIsoDate('01-01-2020')).toBeNull();
      expect(parseIsoDate('invalid')).toBeNull();
    });
  });

  describe('birthDateRule & createdDateRule', () => {
    it('accepts valid past dates after 1900', () => {
      expect(birthDateRule({ birth_date: '1985-05-15' })).toBeNull();
      expect(createdDateRule({ created_date: '2023-01-01' })).toBeNull();
    });

    it('rejects dates before 1900', () => {
      expect(birthDateRule({ birth_date: '1899-12-31' })).toMatchObject({
        code: 'INVALID_BIRTH_DATE',
      });
    });

    it('rejects dates in the future', () => {
      const futureDate = '2999-01-01';
      expect(birthDateRule({ birth_date: futureDate })).toMatchObject({
        code: 'DATE_IN_FUTURE',
      });
      expect(createdDateRule({ created_date: futureDate })).toMatchObject({
        code: 'DATE_IN_FUTURE',
      });
    });
  });

  describe('dateOrderRule', () => {
    it('accepts created_date on or after birth_date', () => {
      expect(dateOrderRule({ birth_date: '1990-01-01', created_date: '1990-01-01' })).toBeNull();
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
