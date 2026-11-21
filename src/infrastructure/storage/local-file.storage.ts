import fs from 'node:fs';
import readline from 'node:readline';
import type { FileStoragePort } from '../../application/ports/file-storage.port.js';
import { logger } from '../../shared/logger.js';

export class LocalFileStorage implements FileStoragePort {
  async deleteFile(filePath: string): Promise<void> {
    try {
      /* Hata aldığımızda dosya diskte gerçekten varsa siler, yoksa hata fırlatmadan güvenle geçer */
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (err) {
      logger.warn({ err, filePath }, 'Failed to delete file from local storage');
    }
  }

  readFirstLine(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      /* Dosyayı ram'e  yüklemeden parça parça okumak için Node.js stream'i başlatır */
      const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      let firstLineFound = false;

      rl.on('line', (line) => {
        firstLineFound = true;
        /* İlk satır yani başlıklar okunduğu anda akışı derhal yok eder ram harcamaz */
        rl.close();
        stream.destroy();
        resolve(line);
      });

      rl.on('close', () => {
        if (!firstLineFound) {
          resolve('');
        }
      });

      stream.on('error', (err) => {
        rl.close();
        reject(err);
      });
    });
  }

  countLines(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      let lineCount = 0;
      const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      rl.on('line', (line) => {
        if (line.trim().length > 0) {
          lineCount++;
        }
      });

      rl.on('close', () => {
        // İlk satır başlıktır, kalanlar veri satırıdır
        const dataRows = Math.max(0, lineCount - 1);
        resolve(dataRows);
      });

      rl.on('error', (err) => {
        rl.close();
        reject(err);
      });

      stream.on('error', (err) => {
        rl.close();
        reject(err);
      });
    });
  }
}
