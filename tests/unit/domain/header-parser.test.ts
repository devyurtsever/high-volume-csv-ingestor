import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseHeaderLine } from '../../../src/domain/import-job/header-parser.js';

describe('Header Parser & Delimiter Detection (Domain Unit Tests)', () => {
  describe('detectDelimiter', () => {
    it('detects comma delimiter in standard line', () => {
      expect(detectDelimiter('customer_id,first_name,last_name')).toBe(',');
    });

    it('detects semicolon delimiter in standard line', () => {
      expect(detectDelimiter('customer_id;first_name;last_name')).toBe(';');
    });

    it('handles UTF-8 BOM properly when detecting delimiter', () => {
      expect(detectDelimiter('\uFEFFcustomer_id;first_name;last_name')).toBe(';');
      expect(detectDelimiter('\uFEFFcustomer_id,first_name,last_name')).toBe(',');
    });

    it('ignores commas inside quoted fields when counting semicolons', () => {
      const line = '"Doe, John";"Jane, Jr";12345678901';
      expect(detectDelimiter(line)).toBe(';');
    });

    it('defaults to comma if no delimiters found or count is equal', () => {
      expect(detectDelimiter('singlecolumn')).toBe(',');
    });
  });

  describe('parseHeaderLine', () => {
    it('parses standard comma-separated headers', () => {
      const line = 'customer_id,first_name,last_name,email';
      const result = parseHeaderLine(line);
      expect(result).toEqual(['customer_id', 'first_name', 'last_name', 'email']);
    });

    it('parses semicolon-separated headers', () => {
      const line = 'customer_id;first_name;last_name;email';
      const result = parseHeaderLine(line);
      expect(result).toEqual(['customer_id', 'first_name', 'last_name', 'email']);
    });

    it('handles quotes and whitespace around headers', () => {
      const line = '"customer_id" , "first_name" , "last_name"';
      const result = parseHeaderLine(line);
      expect(result).toEqual(['customer_id', 'first_name', 'last_name']);
    });

    it('strips UTF-8 BOM from the first header', () => {
      const line = '\uFEFFcustomer_id,first_name,last_name';
      const result = parseHeaderLine(line);
      expect(result).toEqual(['customer_id', 'first_name', 'last_name']);
    });

    it('returns an empty array for empty or whitespace-only input', () => {
      expect(parseHeaderLine('')).toEqual([]);
      expect(parseHeaderLine('   \n\t  ')).toEqual([]);
    });
  });
});
