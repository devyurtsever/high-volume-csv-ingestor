/**
 * Validates Republic of Turkey National Identification Number (T.C. Kimlik No).
 *
 * Mathematical rules:
 * 1. Must be exactly 11 digits.
 * 2. First digit cannot be 0.
 * 3. 10th digit = ((sum of odd digits: 1, 3, 5, 7, 9 * 7) - (sum of even digits: 2, 4, 6, 8)) mod 10
 *    Note: In JS, % is remainder. Negative difference uses: ((diff % 10) + 10) % 10.
 * 4. 11th digit = sum of the first 10 digits mod 10.
 */
export function isValidNationalId(value: string | undefined | null): boolean {
  if (!value) return false;

  const trimmed = value.trim();

  // Must be exactly 11 digits and cannot start with 0
  if (!/^[1-9]\d{10}$/.test(trimmed)) {
    return false;
  }

  const digits = trimmed.split('').map((ch) => Number.parseInt(ch, 10));

  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];

  // 10th digit check
  const rawDiff = oddSum * 7 - evenSum;
  const tenthDigit = ((rawDiff % 10) + 10) % 10;
  if (tenthDigit !== digits[9]) {
    return false;
  }

  // 11th digit check
  let firstTenSum = 0;
  for (let i = 0; i < 10; i++) {
    firstTenSum += digits[i];
  }

  const eleventhDigit = firstTenSum % 10;
  return eleventhDigit === digits[10];
}
