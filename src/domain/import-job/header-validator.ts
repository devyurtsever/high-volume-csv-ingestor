/**
 * Standard expected column headers in CSV files.
 */
export const EXPECTED_HEADERS = [
  'customer_id',
  'first_name',
  'last_name',
  'national_id',
  'email',
  'phone',
  'birth_date',
  'created_date',
] as const;

export type ExpectedHeader = (typeof EXPECTED_HEADERS)[number];

export interface HeaderValidationResult {
  isValid: boolean;
  normalizedHeaders: string[];
  missingHeaders: string[];
}

/**
 * Cleans UTF-8 BOM, trims whitespace, converts to lowercase,
 * and normalizes spaces/hyphens to underscores.
 */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '') // Strip UTF-8 BOM
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * Validates the headers of an uploaded CSV file.
 * Requires all 8 standard customer columns to be present.
 */
export function validateHeaders(rawHeaders: string[]): HeaderValidationResult {
  const normalizedHeaders = rawHeaders.map(normalizeHeader);
  const headerSet = new Set(normalizedHeaders);

  const missingHeaders: string[] = [];

  for (const expected of EXPECTED_HEADERS) {
    if (!headerSet.has(expected)) {
      missingHeaders.push(expected);
    }
  }

  return {
    isValid: missingHeaders.length === 0,
    normalizedHeaders,
    missingHeaders,
  };
}
