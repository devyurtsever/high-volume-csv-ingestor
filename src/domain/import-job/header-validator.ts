import { CUSTOMER_FIELDS, type CustomerField } from '../customer/types.js';

// Dosyada bulunması gereken zorunlu 8 kolon başlığı
export const EXPECTED_HEADERS: readonly string[] = CUSTOMER_FIELDS;

export interface HeaderValidationResult {
  isValid: boolean;
  normalizedHeaders: string[];
  missingHeaders: string[];
  duplicateHeaders: string[];
  unexpectedHeaders: string[];
}

/*
 - Başlık metnini temizler:
 - Excel'in başa koyduğu gizli dosya karakterini (BOM) siler, küçük harfe çevirir,
 - boşluk ve tireleri alt çizgiye dönüştürür (örn: "Customer ID" -> "customer_id").
 */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * CSV dosyasının başlık satırını denetler:
 * 1. Zorunlu 8 başlığın hepsi var mı?
 * 2. Aynı başlık iki kez yazılmış mı (örn: iki tane email kolonu)?
 * 3. Beklenmeyen fazladan kolon var mı?
 * Hepsini hatasız geçerse dosya okunmaya başlanabilir.
 */
export function validateHeaders(rawHeaders: string[]): HeaderValidationResult {
  const normalizedHeaders = rawHeaders.map(normalizeHeader);

  // Çift yazılmış (mükerrer) kolon kontrolü
  const duplicates: string[] = [];
  const seen = new Set<string>();
  for (const h of normalizedHeaders) {
    if (seen.has(h)) {
      duplicates.push(h);
    }
    seen.add(h);
  }

  // Eksik zorunlu kolon kontrolü
  const missingHeaders: string[] = [];
  for (const expected of EXPECTED_HEADERS) {
    if (!seen.has(expected)) {
      missingHeaders.push(expected);
    }
  }

  // Şemada olmayan fazladan kolon kontrolü
  const unexpectedHeaders = normalizedHeaders.filter(
    (h) => !CUSTOMER_FIELDS.includes(h as CustomerField),
  );

  const isValid =
    missingHeaders.length === 0 && duplicates.length === 0 && unexpectedHeaders.length === 0;

  return {
    isValid,
    normalizedHeaders,
    missingHeaders,
    duplicateHeaders: Array.from(new Set(duplicates)),
    unexpectedHeaders,
  };
}
