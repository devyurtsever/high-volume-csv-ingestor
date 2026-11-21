import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import multer, { MulterError } from 'multer';
import { env } from '../../config/env.js';
import { BadRequestError, PayloadTooLargeError } from '../../shared/errors.js';

/* Yükleme klasörü yoksa sunucu açılışında oluşturur */
if (!fs.existsSync(env.UPLOAD_DIR)) {
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
}

/* Dosyayı ram'e almaz doğrudan harddiske rastgele UUID ismiyle kaydeder */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.UPLOAD_DIR);
  },
  filename: (_req, _file, cb) => {
    const uniqueFilename = `${crypto.randomUUID()}.csv`;
    cb(null, uniqueFilename);
  },
});

/* Kabul edilen standart CSV MIME tipleri */
const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/csv',
  'text/x-csv',
  'application/octet-stream',
]);

/* Multer ayarları : maksimum dosya boyutu 500 MB ve dosya uzantı kontrolü */
const upload = multer({
  storage,
  limits: {
    fileSize: env.MAX_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    /* Uzantısı .csv olmayan dosyaları derhal 400 ile reddeder */
    if (ext !== '.csv') {
      return cb(new BadRequestError('Only files with .csv extension are allowed'));
    }

    /* Beklenmeyen MIME tiplerini reddeder */
    if (!ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
      return cb(new BadRequestError(`Invalid MIME type '${file.mimetype}'. Expected text/csv.`));
    }

    cb(null, true);
  },
}).single('file');

export function uploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err) => {
    if (err) {
      /* Dosya boyutu sınırı aşıldığında temiz 413 Payload Too Large hatası üretir */
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new PayloadTooLargeError(
              `File size exceeds maximum allowed limit of ${env.MAX_FILE_SIZE_BYTES} bytes (${Math.round(env.MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB)`,
              { maxSize: env.MAX_FILE_SIZE_BYTES },
            ),
          );
        }
        return next(new BadRequestError(`File upload error: ${err.message}`));
      }
      return next(err);
    }
    next();
  });
}
