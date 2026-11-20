import type { Pool, PoolClient } from 'pg';
import { logger } from '../../shared/logger.js';

/**
 * Veritabanı işlemlerini atomik bir transaction içinde güvenle çalıştırır.
 * Hata anında tüm işlemleri geri alır (ROLLBACK), bağlantı sızıntısını önler.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  // Havuzdan bağlantı ödünç al
  const client = await pool.connect();
  let rollbackFailedError: Error | null = null;

  try {
    // İşlem paketini başlat
    await client.query('BEGIN');
    const result = await fn(client);
    // Sorun yoksa tüm değişiklikleri tek seferde kalıcı yap
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      // hata çıkarsa yapılan her şeyi gel ve eski haline dön
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      rollbackFailedError =
        rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
      logger.error({ err: rollbackError }, 'Error executing ROLLBACK on database client');
    }
    throw error;
  } finally {
    // 5. Başarılı da olsa hata da alsa bağlantıyı havuza bırakıp sızıntıyı önle.
    // Rollback dahi patladıysa bozuk bağlantıyı havuza döndürmeyip imha et.
    client.release(rollbackFailedError ?? undefined);
  }
}
