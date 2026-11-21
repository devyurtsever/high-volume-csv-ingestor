import { Router } from 'express';
import type { ImportController } from '../controllers/import.controller.js';
import type { ReportController } from '../controllers/report.controller.js';
import { uploadMiddleware } from '../middlewares/upload.middleware.js';

export function createImportRouter(
  controller: ImportController,
  reportController?: ReportController,
): Router {
  const router = Router();

  // POST /api/v1/imports  = CSV Yükleme için
  router.post('/', uploadMiddleware, controller.upload);

  // GET /api/v1/imports = Geçmiş yüklemeleri çekiyoruz
  router.get('/', controller.list);

  // GET /api/v1/imports/:id = Tek bir dosyanın durumunu sorgulama için
  router.get('/:id', controller.getById);

  // Raporlama endpoint'leri
  if (reportController) {
    // GET /api/v1/imports/:id/errors/export = CSV Olarak Hataları İndir
    router.get('/:id/errors/export', reportController.exportErrors);

    // GET /api/v1/imports/:id/errors = Sayfalanmış Hata Listesi (Keyset Cursor)
    router.get('/:id/errors', reportController.getErrors);

    // GET /api/v1/imports/:id/summary = İçe Aktarım Özeti ve Hata Dağılımı
    router.get('/:id/summary', reportController.getSummary);
  }

  return router;
}
