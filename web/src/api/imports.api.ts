import { apiFetch } from './client';
import type { ImportJob, ImportSummary, ErrorsApiResponse } from '../types';

export async function fetchImports(): Promise<{ items: ImportJob[] }> {
  return apiFetch<{ items: ImportJob[] }>('/api/v1/imports');
}

export async function fetchImportById(id: string): Promise<ImportJob> {
  return apiFetch<ImportJob>(`/api/v1/imports/${id}`);
}

export async function fetchImportSummary(id: string): Promise<ImportSummary> {
  return apiFetch<ImportSummary>(`/api/v1/imports/${id}/summary`);
}

export async function fetchImportErrors(
  id: string,
  afterRow?: number | null,
  errorType?: string | null,
  limit = 50
): Promise<ErrorsApiResponse> {
  const params = new URLSearchParams();
  params.set('limit', limit.toString());
  if (afterRow) params.set('after_row', afterRow.toString());
  if (errorType && errorType !== 'ALL') params.set('error_type', errorType);

  return apiFetch<ErrorsApiResponse>(`/api/v1/imports/${id}/errors?${params.toString()}`);
}

export async function uploadCsvFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ id: string; original_filename: string; status: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/v1/imports');

    const apiKey = localStorage.getItem('yui_api_key') || 'dev-local-key-change-me';
    xhr.setRequestHeader('X-API-Key', apiKey.trim());

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res);
        } catch {
          resolve({ id: '', original_filename: file.name, status: 'PENDING' });
        }
      } else {
        let msg = `Yükleme hatası (${xhr.status})`;
        try {
          const res = JSON.parse(xhr.responseText);
          msg = res.message || res.error || msg;
        } catch {
          // ignore
        }
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Sunucuya ulaşılamadı. Lütfen tekrar deneyin.'));
    };

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}
