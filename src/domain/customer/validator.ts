import type {
  NormalizedCustomerRow,
  RawCustomerRow,
  ValidationContext,
  ValidationIssue,
  ValidationRule,
} from './types.js';
import { DEFAULT_CUSTOMER_RULES, normalizeTurkishPhone } from './rules.js';

export type { ValidationContext };

/**
 * Tek bir ham müşteri satırını kural zincirinden geçirir.
 * İlk hatada DURMAZ; satırdaki TÜM hataları tek seferde toplar (Strategy Pattern / Collect-All).
 * İsteğe bağlı 'context' parametresi ile zaman diliminden bağımsız, saf (pure) tarih kıyaslaması yapar.
 */
export function validateRow(
  row: RawCustomerRow,
  rules: ValidationRule[] = DEFAULT_CUSTOMER_RULES,
  context?: ValidationContext,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const rule of rules) {
    const result = rule(row, context);
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
 * Doğrulamadan başarıyla geçmiş bir satırı veritabanına yazılacak temiz formata dönüştürür:
 * - Boşlukları temizler (trim).
 * - E-postayı küçük harfe çevirir.
 * - Telefonu uluslararası +905XXXXXXXXX formatına getirir.
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
