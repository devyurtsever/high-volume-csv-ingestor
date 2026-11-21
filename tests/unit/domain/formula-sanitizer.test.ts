import { describe, expect, it } from 'vitest';
import { sanitizeCsvFormula } from '../../../src/domain/report/formula-sanitizer.js';

describe('sanitizeCsvFormula (Formula Injection Mitigation)', () => {
  it('should prepend a single quote to dangerous formula prefixes', () => {
    expect(sanitizeCsvFormula('=SUM(1,2)')).toBe("'=SUM(1,2)");
    expect(sanitizeCsvFormula('+905551234567')).toBe("'+905551234567");
    expect(sanitizeCsvFormula('-500')).toBe("'-500");
    expect(sanitizeCsvFormula('@username')).toBe("'@username");
    expect(sanitizeCsvFormula('\tmalicious')).toBe("'\tmalicious");
    expect(sanitizeCsvFormula('\rmalicious')).toBe("'\rmalicious");
  });

  it('should leave normal safe values untouched', () => {
    expect(sanitizeCsvFormula('Ahmet Yılmaz')).toBe('Ahmet Yılmaz');
    expect(sanitizeCsvFormula('CUST-1001')).toBe('CUST-1001');
    expect(sanitizeCsvFormula('test@example.com')).toBe('test@example.com');
    expect(sanitizeCsvFormula('12345678901')).toBe('12345678901');
  });

  it('should handle null and undefined safely', () => {
    expect(sanitizeCsvFormula(null)).toBe('');
    expect(sanitizeCsvFormula(undefined)).toBe('');
  });
});
