/*
 * IMPORT QUEUE JOB DATA
 * Kuyruğa (BullMQ / Redis) atılan iş paketinin taşıdığı asgari veriler.
 * Worker bu bilgileri alıp dosyayı açacak ve satır satır işleyecektir.
 */
export interface ImportQueueJobData {
  importId: string; // Veritabanındaki import_jobs tablosunun UUID birincil anahtarı
  storedPath: string; // Diskteki geçici CSV dosyasının yolu
  originalFilename: string; // Kullanıcının yüklediği dosyanın orijinal adı
}

/*
 * IMPORT QUEUE PORT (Kuyruk Arayüzü / Sözleşmesi)
 * Servis katmanının Redis veya BullMQ detaylarını bilmesini engeller.
 * Yarın Redis yerine RabbitMQ, AWS SQS veya Kafka kullanılsa bile bu arayüz aynı kalır.
 * Gerçekte bu sözleşmeyi uygulayan adaptör: BullImportQueue (src/infrastructure/queue/bull-import.queue.ts)
 */
export interface ImportQueuePort {
  /*
   * Yeni bir CSV işleme görevini arka plan kuyruğuna ekler.
   */
  addJob(data: ImportQueueJobData): Promise<void>;
}
