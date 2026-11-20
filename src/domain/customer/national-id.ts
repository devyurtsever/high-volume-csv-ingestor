/**
 * T.C. Kimlik Numarasını resmi matematiksel kurallara göre doğrular.
 *
 * Kurallar:
 * 1. Tam olarak 11 haneli ve sadece rakamlardan oluşmalıdır.
 * 2. İlk hanesi 0 olamaz.
 * 3. 10. hane = ((1, 3, 5, 7 ve 9. hanelerin toplamı * 7) - (2, 4, 6 ve 8. hanelerin toplamı)) mod 10
 * 4. 11. hane = İlk 10 hanenin toplamının mod 10'udur.
 */
export function isValidNationalId(value: string | undefined | null): boolean {
  if (!value) return false;

  const trimmed = value.trim();

  // 11 hane olmalı ve ilk hanesi 0 olamaz
  if (!/^[1-9]\d{10}$/.test(trimmed)) {
    return false;
  }

  const digits = trimmed.split('').map((ch) => Number.parseInt(ch, 10));

  // Tek ve çift basamaklardaki rakamların toplamı
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];

  // 10. hane kontrolü (fark negatif çıkarsa mod 10 bozulmasın diye +10 eklenir)
  const rawDiff = oddSum * 7 - evenSum;
  const tenthDigit = ((rawDiff % 10) + 10) % 10;
  if (tenthDigit !== digits[9]) {
    return false;
  }

  // 11. hane kontrolü: ilk 10 rakamın toplamının birler basamağı
  let firstTenSum = 0;
  for (let i = 0; i < 10; i++) {
    firstTenSum += digits[i];
  }

  const eleventhDigit = firstTenSum % 10;
  return eleventhDigit === digits[10];
}
