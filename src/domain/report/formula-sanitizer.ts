/**
 * CSV Formula Injection yani DDE saldırısına karşılık koruma için yapıldı
 * Hücre metni '=', '+', '-', '@', '\t' veya '\r' ile başlıyorsa
 * Excel / Google Sheets tarafından formül veya sistem komutu olarak çalıştırılmasını engellemek için
 * değerin başına tek tırnak (') ekler.
 */
export function sanitizeCsvFormula(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }

  return str;
}

/*!!!
 * Nesne veya JSON içindeki tüm metin alanlarına özyinelemeli olarak
 * CSV Formula Injection koruması uygular.
 */
export function sanitizeRecord<T extends Record<string, unknown>>(record: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    if (typeof val === 'string') {
      result[key] = sanitizeCsvFormula(val);
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = sanitizeRecord(val as Record<string, unknown>);
    } else {
      result[key] = val;
    }
  }
  return result as T;
}
