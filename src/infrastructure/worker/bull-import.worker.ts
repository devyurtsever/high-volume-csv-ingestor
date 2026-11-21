import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from '../../shared/logger.js';
import type { ImportQueueJobData } from '../../application/ports/import-queue.port.js';
import type { ImportRepositoryPort } from '../../application/ports/import-repository.port.js';
import type { ImportProcessorService } from '../../application/services/import-processor.service.js';

export class BullImportWorker {
  private readonly worker: Worker<ImportQueueJobData>;
  private readonly redisClient: IORedis.Redis;

  constructor(
    private readonly processorService: ImportProcessorService,
    private readonly repository: ImportRepositoryPort,
  ) {
    /*
     * Worker için Producer'dan ayrı, blocking komutlar için
     */
    this.redisClient = new IORedis.Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // null olarak bıraktım çünkü iş gelmezse redis bağlantısı kapanır ve zaman aşımına uğrar ardından worker çöker
      enableOfflineQueue: true,
    });

    this.worker = new Worker<ImportQueueJobData>(
      'csv-import-queue',
      async (job: Job<ImportQueueJobData>) => {
        await this.processorService.processImport(job.data);
      },
      {
        connection: this.redisClient,
        concurrency: env.WORKER_CONCURRENCY,
      },
    );

    this.worker.on('failed', async (job, err) => {
      logger.error(
        {
          importId: job?.data.importId,
          attemptsMade: job?.attemptsMade,
          err: err.message,
        },
        'BullMQ worker job failed',
      );

      /*
       * Deneme hakkı tükendiğinde iş veritabanında 'PROCESSING' durumunda takılı kalmasın;
       * doğrudan 'FAILED' durumuna çekilsin.
       */
      if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
        try {
          await this.repository.updateStatus(
            job.data.importId,
            'FAILED',
            `Processing failed after ${job.attemptsMade} attempts: ${err.message}`,
          );
        } catch (dbErr) {
          logger.error(
            { importId: job.data.importId, err: dbErr },
            'Failed to set job status to FAILED in worker failure handler',
          );
        }
      }
    });

    this.worker.on('error', (err) => {
      logger.error({ err }, 'BullMQ Worker unexpected error');
    });
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.redisClient.quit();
  }
}
