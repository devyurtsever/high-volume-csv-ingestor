const STORAGE_KEY = 'yui_api_key';
export const DEFAULT_KEY = 'dev-local-key-change-me';

export function getApiKey(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored?.trim() || DEFAULT_KEY;
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim());
}

export function maskApiKey(key: string): string {
  if (key.length <= 5) return '••••••';
  return `••••••${key.slice(-5)}`;
}

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const apiKey = getApiKey();
  const headers = new Headers(options.headers || {});

  if (!headers.has('X-API-Key') && apiKey) {
    headers.set('X-API-Key', apiKey);
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorDetail = '';
    try {
      const errJson = await res.json();
      errorDetail = errJson.message || errJson.error || JSON.stringify(errJson);
    } catch {
      errorDetail = await res.text();
    }
    const err = new Error(errorDetail || `İstek başarısız (${res.status})`);
    (err as unknown as { status: number }).status = res.status;
    throw err;
  }

  return res.json() as Promise<T>;
}

export async function downloadCsv(importId: string, filename: string): Promise<void> {
  const apiKey = getApiKey();
  const res = await fetch(`/api/v1/imports/${importId}/errors/export`, {
    headers: {
      'X-API-Key': apiKey,
    },
  });

  if (!res.ok) {
    throw new Error('CSV dışa aktarılamadı.');
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
