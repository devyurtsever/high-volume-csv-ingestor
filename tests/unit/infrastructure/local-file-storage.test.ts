import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LocalFileStorage } from '../../../src/infrastructure/storage/local-file.storage.js';

describe('LocalFileStorage Unit Tests', () => {
  const storage = new LocalFileStorage();
  const testDir = path.join(os.tmpdir(), `test-storage-${Date.now()}`);

  beforeAll(async () => {
    await fs.promises.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });

  it('should return empty string for completely empty file', async () => {
    const filePath = path.join(testDir, 'empty.csv');
    await fs.promises.writeFile(filePath, '');

    const firstLine = await storage.readFirstLine(filePath);
    expect(firstLine).toBe('');

    const lines = await storage.countLines(filePath);
    expect(lines).toBe(0);
  });

  it('should count 0 data rows for header-only file', async () => {
    const filePath = path.join(testDir, 'header-only.csv');
    await fs.promises.writeFile(filePath, 'Customer ID,First Name,Last Name\n');

    const lines = await storage.countLines(filePath);
    expect(lines).toBe(0);
  });

  it('should correctly count data rows excluding header and trailing empty lines', async () => {
    const filePath = path.join(testDir, 'mixed.csv');
    const content = [
      'Customer ID,First Name,Last Name',
      'C1,Ali,Yilmaz',
      'C2,Ayse,Kaya',
      'C3,Mehmet,Demir',
      '',
      '',
    ].join('\n');

    await fs.promises.writeFile(filePath, content);

    const firstLine = await storage.readFirstLine(filePath);
    expect(firstLine).toBe('Customer ID,First Name,Last Name');

    const lines = await storage.countLines(filePath);
    expect(lines).toBe(3);
  });

  it('should delete file safely if it exists', async () => {
    const filePath = path.join(testDir, 'to-delete.csv');
    await fs.promises.writeFile(filePath, 'some,data');

    expect(fs.existsSync(filePath)).toBe(true);
    await storage.deleteFile(filePath);
    expect(fs.existsSync(filePath)).toBe(false);

    // Calling deleteFile on non-existent file should not throw
    await expect(storage.deleteFile(filePath)).resolves.not.toThrow();
  });
});
