import { Queue, type Job } from 'bullmq';
import IORedis from 'ioredis';
import type {
  ImportQueueJobData,
  ImportQueuePort,
} from '../../application/ports/import-queue.port.js';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

export class BullImportQueue implements ImportQueuePort {
  private readonly queue: Queue<ImportQueueJobData>;
  private readonly redisClient: IORedis.Redis;

  constructor() {
    /* Redis kapalıysa isteği askıda bırakmayıp hemen hata fırlatması için fail-fast ayarları */
    this.redisClient = new IORedis.Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    this.queue = new Queue<ImportQueueJobData>('csv-import-queue', {
      connection: this.redisClient,
    });

    this.queue.on('error', (err) => {
      logger.error({ err }, 'Unexpected error in BullMQ Import Queue');
    });
  }

  async addJob(data: ImportQueueJobData): Promise<void> {
    /* jobId=importId ile mükerrer kuyruk işini önler, hata anında 3 kez üstel artan süreyle tekrar dener */
    await this.queue.add('process-csv-job', data, {
      jobId: data.importId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  async getJob(jobId: string): Promise<Job<ImportQueueJobData> | undefined> {
    /* Entegrasyon testlerinin işin kuyruğa ulaştığını doğrulaması için kullanılır */
    return this.queue.getJob(jobId);
  }

  async clearQueue(): Promise<void> {
    /* Testler bittikten sonra kuyruğu sıfırlayıp temizler */
    await this.queue.drain();
    await this.queue.clean(0, 1000, 'completed');
    await this.queue.clean(0, 1000, 'failed');
    await this.queue.clean(0, 1000, 'delayed');
    await this.queue.clean(0, 1000, 'wait');
    await this.queue.clean(0, 1000, 'paused');
  }

  async close(): Promise<void> {
    /* Sunucu kapanırken açık bağlantıları kibarca sonlandırır */
    await this.queue.close();
    await this.redisClient.quit();
  }
}
