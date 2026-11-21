/*
  - FILE STORAGE PORT (Dosya Depolama Arayüzü Sözleşmesi)
 
 *  Clean architecture gereği servis katmanı doğrudan diske veya AWS S3'e
 bağımlı olmamalıdır. Bu arayüz dosya işlemlerinin dış dünyadan nasıl talep edileceğini belirler.
 *  Gerçekte bu sözleşmeyi uygulayan adaptör: LocalFileStorage (src/infrastructure/storage/local-file.storage.ts)
 */
export interface FileStoragePort {
  /*
   * Belleği tüketmemek için tüm dosyayı okumaz
   *** Yalnızca CSV dosyasının 1. satırını (başlıklarını) stream ile okur ****
   */
  readFirstLine(filePath: string): Promise<string>;

  /*
   * Geçersiz dosya, hatalı başlık veya işlem sonrasında dosyayı diskten siler.
   */
  deleteFile(filePath: string): Promise<void>;
}
