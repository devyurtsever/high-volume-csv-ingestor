import { Router } from 'express';
import type { ImportController } from '../controllers/import.controller.js';
import { uploadMiddleware } from '../middlewares/upload.middleware.js';

export function createImportRouter(controller: ImportController): Router {
  const router = Router();

  // POST /api/v1/imports  = CSV Yükleme için
  router.post('/', uploadMiddleware, controller.upload);

  // GET /api/v1/imports = Geçmiş yüklemeleri çekiyoruz
  router.get('/', controller.list);

  // GET /api/v1/imports/:id = Tek bir dosyanın durumunu sorgulama için
  router.get('/:id', controller.getById);

  return router;
}
