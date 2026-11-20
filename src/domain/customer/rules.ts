import type { RawCustomerRow, ValidationIssue, ValidationRule } from './types.js';
import { isValidNationalId } from './national-id.js';

export const REQUIRED_FIELDS = [
  'customer_id',
  'first_name',
  'last_name',
  'national_id',
  'email',
  'phone',
  'birth_date',
  'created_date',
] as const;

/**
 * Checks for non-empty presence of all required fields.
 */
export const requiredFieldsRule: ValidationRule = (row: RawCustomerRow) => {
  const issues: ValidationIssue[] = [];

  for (const field of REQUIRED_FIELDS) {
    const val = row[field];
    if (val === undefined || val === null || val.trim().length === 0) {
      issues.push({
        code: 'REQUIRED_FIELD_MISSING',
        message: `Field '${field}' is required and cannot be empty`,
        field,
      });
    }
  }

  return issues.length > 0 ? issues : null;
};

/**
 * Validates Customer ID format and length.
 */
export const customerIdRule: ValidationRule = (row: RawCustomerRow) => {
  const val = row.customer_id?.trim();
  if (!val) return null; // Missing fields handled by requiredFieldsRule

  if (val.length > 100) {
    return {
      code: 'INVALID_CUSTOMER_ID',
      message: 'Customer ID cannot exceed 100 characters',
      field: 'customer_id',
    };
  }

  return null;
};

/**
 * Validates First Name format and length.
 */
export const firstNameRule: ValidationRule = (row: RawCustomerRow) => {
  const val = row.first_name?.trim();
  if (!val) return null;

  if (val.length > 100) {
    return {
      code: 'INVALID_FIRST_NAME',
      message: 'First name cannot exceed 100 characters',
      field: 'first_name',
    };
  }

  return null;
};

/**
 * Validates Last Name format and length.
 */
export const lastNameRule: ValidationRule = (row: RawCustomerRow) => {
  const val = row.last_name?.trim();
  if (!val) return null;

  if (val.length > 100) {
    return {
      code: 'INVALID_LAST_NAME',
      message: 'Last name cannot exceed 100 characters',
      field: 'last_name',
    };
  }

  return null;
};

/**
 * Validates National ID using the official Turkish identity algorithm.
 */
export const nationalIdRule: ValidationRule = (row: RawCustomerRow) => {
  const val = row.national_id?.trim();
  if (!val) return null;

  if (!isValidNationalId(val)) {
    return {
      code: 'INVALID_NATIONAL_ID',
      message: 'National ID is not a valid Turkish identification number',
      field: 'national_id',
    };
  }

  return null;
};

/**
 * RFC 5322 compatible email pattern
 */
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export const emailRule: ValidationRule = (row: RawCustomerRow) => {
  const val = row.email?.trim();
  if (!val) return null;

  if (val.length > 255 || !EMAIL_REGEX.test(val)) {
    return {
      code: 'INVALID_EMAIL',
      message: 'Email address is invalid',
      field: 'email',
    };
  }

  return null;
};

/**
 * Normalizes Turkish phone numbers to +905XXXXXXXXX format.
 * Returns null if the number is not a valid Turkish mobile/landline number.
 */
export function normalizeTurkishPhone(phone: string): string | null {
  // Strip spaces, dashes, dots, parentheses, and leading plus
  let cleaned = phone.replace(/[\s\-.()+]/g, '');

  if (cleaned.startsWith('0090')) {
    cleaned = cleaned.slice(4);
  } else if (cleaned.startsWith('90')) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }

  // A valid Turkish phone number without country code is 10 digits starting with 5 (for mobile)
  if (/^5\d{9}$/.test(cleaned)) {
    return `+90${cleaned}`;
  }

  return null;
}

export const phoneRule: ValidationRule = (row: RawCustomerRow) => {
  const val = row.phone?.trim();
  if (!val) return null;

  if (!normalizeTurkishPhone(val)) {
    return {
      code: 'INVALID_PHONE',
      message: 'Phone number must be a valid Turkish mobile number (e.g. +90 5XX XXX XX XX)',
      field: 'phone',
    };
  }

  return null;
};

/**
 * Parses and verifies strict YYYY-MM-DD calendar dates.
 */
export function parseIsoDate(val: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return null;

  const [yearStr, monthStr, dayStr] = val.split('-');
  const year = Number.parseInt(yearStr, 10);
  const month = Number.parseInt(monthStr, 10);
  const day = Number.parseInt(dayStr, 10);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export const birthDateRule: ValidationRule = (row: RawCustomerRow) => {
  const val = row.birth_date?.trim();
  if (!val) return null;

  const date = parseIsoDate(val);
  if (!date || date.getUTCFullYear() < 1900) {
    return {
      code: 'INVALID_BIRTH_DATE',
      message: 'Birth date must be a valid date in YYYY-MM-DD format (year >= 1900)',
      field: 'birth_date',
    };
  }

  const now = new Date();
  if (date > now) {
    return {
      code: 'DATE_IN_FUTURE',
      message: 'Birth date cannot be in the future',
      field: 'birth_date',
    };
  }

  return null;
};

export const createdDateRule: ValidationRule = (row: RawCustomerRow) => {
  const val = row.created_date?.trim();
  if (!val) return null;

  const date = parseIsoDate(val);
  if (!date || date.getUTCFullYear() < 1900) {
    return {
      code: 'INVALID_CREATED_DATE',
      message: 'Created date must be a valid date in YYYY-MM-DD format',
      field: 'created_date',
    };
  }

  const now = new Date();
  if (date > now) {
    return {
      code: 'DATE_IN_FUTURE',
      message: 'Created date cannot be in the future',
      field: 'created_date',
    };
  }

  return null;
};

export const dateOrderRule: ValidationRule = (row: RawCustomerRow) => {
  const birthStr = row.birth_date?.trim();
  const createdStr = row.created_date?.trim();
  if (!birthStr || !createdStr) return null;

  const birthDate = parseIsoDate(birthStr);
  const createdDate = parseIsoDate(createdStr);

  if (birthDate && createdDate && createdDate < birthDate) {
    return {
      code: 'CREATED_DATE_BEFORE_BIRTH_DATE',
      message: 'Created date cannot be earlier than birth date',
      field: 'created_date',
    };
  }

  return null;
};

/**
 * Standard rule chain containing all verification rules.
 */
export const DEFAULT_CUSTOMER_RULES: ValidationRule[] = [
  requiredFieldsRule,
  customerIdRule,
  firstNameRule,
  lastNameRule,
  nationalIdRule,
  emailRule,
  phoneRule,
  birthDateRule,
  createdDateRule,
  dateOrderRule,
];
