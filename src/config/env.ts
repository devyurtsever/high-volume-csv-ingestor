import dotenv from 'dotenv';
import { z } from 'zod';

// .env dosyasındaki değişkenleri process.env içerisine yükler
dotenv.config();

// Uygulamanın ihtiyaç duyduğu tüm ayarların tip ve kurallarını belirleyen Zod şeması
const envSchema = z
  .object({
    // Çalışma ortamı: geliştirme, test veya canlı (production)
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('0.0.0.0'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    // PostgreSQL bağlantı adresi ve maksimum havuz bağlantı sayısı
    DATABASE_URL: z
      .string()
      .url()
      .default('postgres://postgres:postgres@localhost:5433/customer_import_db'),
    DB_MAX_CONNECTIONS: z.coerce.number().int().positive().default(20),

    // Redis kuyruk bağlantı adresi
    REDIS_URL: z.string().url().default('redis://localhost:6380'),

    // Yüklenen dosyaların geçici kaydedileceği klasör ve boyut limiti (varsayılan 500 MB)
    UPLOAD_DIR: z.string().default('./uploads'),
    MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(524288000),

    // API Güvenlik anahtarı, eşzamanlı çalışacak worker sayısı ve toplu yazma (batch) boyutu
    API_KEY: z.string().min(1).default('dev-local-key-change-me'),
    WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
    BATCH_SIZE: z.coerce.number().int().positive().default(2000),
    DELETE_FILE_AFTER_IMPORT: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine((data, ctx) => {
    // Canlı ortamda (production) güvenlik açığı olmaması için localhost veritabanını engelle
    if (data.NODE_ENV === 'production') {
      if (data.DATABASE_URL.includes('localhost') || data.DATABASE_URL.includes('127.0.0.1')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Canlı ortamda (Production) veritabanı adresi localhost olamaz',
          path: ['DATABASE_URL'],
        });
      }
    }
  });

// Ayarları doğrula tek bir ayar bile hatalıysa uygulamayı ayağa kaldırmadan hemen durdur

// Buradaki amacımız zod kullanarak daha sunucu ayağa kalktığı ilk saniyede .env dosyasını denetleriz
// Eğer ki tek bir ayar bile eksik veya hatalı ise uygulama daha başlamadan anında hata verir ve kapanır.
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Hatalı ortam değişkeni konfigürasyonu:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
export type Env = z.infer<typeof envSchema>;
