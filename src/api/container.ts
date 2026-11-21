import { pool, closePool } from '../infrastructure/db/pool.js';
import { PgImportRepository } from '../infrastructure/repositories/pg-import.repository.js';
import { BullImportQueue } from '../infrastructure/queue/bull-import.queue.js';
import { LocalFileStorage } from '../infrastructure/storage/local-file.storage.js';
import { ImportService } from '../application/services/import.service.js';
import { ImportController } from './controllers/import.controller.js';

/**
 * Manuel Bağımlılık Enjeksiyonu (Dependency Injection) Konteyneri.
 * Tüm katmanları bir araya getirir ve birbirine bağlar: Altyapı (Infrastructure) -> Uygulama (Application) -> API.
 * Harici framework şişkinliği olmadan Bağımlılıkların Tersine Çevrilmesi İlkesini (Dependency Inversion Principle - SOLID) izler.
 */

class Container {
  public readonly importRepository: PgImportRepository;
  public readonly importQueue: BullImportQueue;
  public readonly fileStorage: LocalFileStorage;
  public readonly importService: ImportService;
  public readonly importController: ImportController;

  constructor() {
    // 1. Infrastructure adaptörleri
    this.importRepository = new PgImportRepository(pool);
    this.importQueue = new BullImportQueue();
    this.fileStorage = new LocalFileStorage();

    // 2. Application services
    this.importService = new ImportService(
      this.importRepository,
      this.importQueue,
      this.fileStorage,
    );

    // 3. API controllers
    this.importController = new ImportController(this.importService);
  }

  /**
   * Graceful resource cleanup (called during server shutdown or test teardown)
   */
  async cleanup(): Promise<void> {
    await Promise.all([this.importQueue.close(), closePool()]);
  }
}

export const container = new Container();
