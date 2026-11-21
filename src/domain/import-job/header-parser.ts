import { parse } from 'csv-parse/sync';

export type CsvDelimiter = ',' | ';';

export function detectDelimiter(line: string): CsvDelimiter {
  /* Başta UTF-8 BOM varsa temizler */
  const cleanLine = line.startsWith('\uFEFF') ? line.slice(1) : line;

  let commaCount = 0;
  let semicolonCount = 0;
  let inQuotes = false;

  /* Tırnak içindeki metinleri atlayarak satırdaki virgül ve noktalı virgülleri sayar */
  for (let i = 0; i < cleanLine.length; i++) {
    const char = cleanLine[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (char === ',') commaCount++;
      else if (char === ';') semicolonCount++;
    }
  }

  /* Noktalı virgül fazlaysa ';' değilse varsayılan olarak ',' döner */
  return semicolonCount > commaCount ? ';' : ',';
}

export function parseHeaderLine(firstLine: string): string[] {
  const trimmed = firstLine.trim();
  /* Satır boşsa boş dizi döner */
  if (!trimmed) {
    return [];
  }

  /* Doğru ayırıcıyı tespit eder ve BOM karakterini siler */
  const delimiter = detectDelimiter(trimmed);
  const cleanLine = trimmed.startsWith('\uFEFF') ? trimmed.slice(1) : trimmed;

  /* İlk satırdaki kolon başlıklarını dizi olarak ayıklar ve boşlukları kırpar */
  const records = parse(cleanLine, {
    delimiter,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
  }) as string[][];

  return records[0]?.map((h) => h.trim()) ?? [];
}
