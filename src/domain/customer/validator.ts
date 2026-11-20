import type {
  NormalizedCustomerRow,
  RawCustomerRow,
  ValidationIssue,
  ValidationRule,
} from './types.js';
import { DEFAULT_CUSTOMER_RULES, normalizeTurkishPhone } from './rules.js';

/**
 * Validates a single customer row against an extensible chain of rules.
 * Collects ALL issues instead of failing on the first one (Strategy Pattern / Collect-All).
 */
export function validateRow(
  row: RawCustomerRow,
  rules: ValidationRule[] = DEFAULT_CUSTOMER_RULES,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const rule of rules) {
    const result = rule(row);
    if (!result) continue;

    if (Array.isArray(result)) {
      issues.push(...result);
    } else {
      issues.push(result);
    }
  }

  return issues;
}

/**
 * Normalizes a raw customer row into trimmed, sanitized, and standardized types.
 * Should only be called after validateRow returns an empty array of issues.
 */
export function normalizeRow(row: RawCustomerRow): NormalizedCustomerRow {
  const phone = row.phone?.trim() ?? '';
  const normalizedPhone = normalizeTurkishPhone(phone) ?? phone;

  return {
    customer_id: row.customer_id?.trim() ?? '',
    first_name: row.first_name?.trim() ?? '',
    last_name: row.last_name?.trim() ?? '',
    national_id: row.national_id?.trim() ?? '',
    email: row.email?.trim().toLowerCase() ?? '',
    phone: normalizedPhone,
    birth_date: row.birth_date?.trim() ?? '',
    created_date: row.created_date?.trim() ?? '',
  };
}
