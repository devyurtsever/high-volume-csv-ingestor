import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchImports } from '../api/imports.api';
import { Header } from '../components/Header';
import { UploadZone } from '../components/UploadZone';
import { StatusBadge } from '../components/StatusBadge';
import type { ImportJob } from '../types';

function formatDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    const months = [
      'Oca',
      'Şub',
      'Mar',
      'Nis',
      'May',
      'Haz',
      'Tem',
      'Ağu',
      'Eyl',
      'Eki',
      'Kas',
      'Ara',
    ];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return `${day} ${month} ${year}, ${time}`;
  } catch {
    return isoStr;
  }
}

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '-';
  return new Intl.NumberFormat('tr-TR').format(num);
}

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return '';
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const diffSec = Math.max(1, Math.round((end - start) / 1000));
  if (diffSec < 60) return `süre ${diffSec} sn`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `süre ${mins} dk ${secs} sn`;
}

export function ImportsListPage() {
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    queryKey: ['imports'],
    queryFn: fetchImports,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const items = query.state.data?.items;
      const hasActive = items?.some(
        (job) => job.status === 'PENDING' || job.status === 'PROCESSING',
      );
      return hasActive ? 2000 : false;
    },
  });

  const items = data?.items || [];
  const hasActiveJobs = items.some(
    (job) => job.status === 'PENDING' || job.status === 'PROCESSING',
  );

  return (
    <div>
      <Header />

      <main className="page-container">
        <h1 className="page-title">CSV dosyalarını yükleyin</h1>
        <p className="page-subtitle">
          Dosyalar arka planda işlenir. Bu sayfayı kapatsanız bile işlem devam eder.
        </p>

        <UploadZone onUploadSuccess={() => refetch()} />

        <div className="section-header">
          <h2 className="section-title">Yüklemeler</h2>
          <div className="section-meta">
            {items.length > 0 && `${items.length} dosya`}
            {hasActiveJobs && ' – her 2 saniyede güncellenir'}
          </div>
        </div>

        {isLoading && (
          <div
            className="table-card"
            style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}
          >
            Yükleniyor...
          </div>
        )}

        {isError && (
          <div className="table-card" style={{ padding: 48, textAlign: 'center' }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginBottom: 8,
                color: 'var(--color-danger-text)',
              }}
            >
              Yüklemeler alınamadı
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              Sunucuya bağlanılamadı ya da API anahtarı geçersiz.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button type="button" className="btn-primary" onClick={() => refetch()}>
                Tekrar dene
              </button>
            </div>
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="table-card" style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 12 }}>📄</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
              Henüz dosya yüklemediniz
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
              İlk CSV dosyanızı yukarıdan yükleyin, durumunu burada izleyin.
            </div>
          </div>
        )}

        {!isLoading && !isError && items.length > 0 && (
          <div className="table-card">
            <table className={`data-table ${isPlaceholderData ? 'table-fetching' : ''}`}>
              <thead>
                <tr>
                  <th style={{ width: '22%', textAlign: 'left' }}>Dosya</th>
                  <th style={{ width: '15%', textAlign: 'center' }}>Durum</th>
                  <th style={{ width: '18%', textAlign: 'center' }}>İlerleme</th>
                  <th style={{ width: '9%', textAlign: 'center' }}>Başarılı</th>
                  <th style={{ width: '9%', textAlign: 'center' }}>Hatalı</th>
                  <th style={{ width: '9%', textAlign: 'center' }}>Mükerrer</th>
                  <th style={{ width: '18%', textAlign: 'center' }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {items.map((job: ImportJob) => {
                  const percent =
                    job.total_rows && job.total_rows > 0
                      ? Math.round((job.processed_rows / job.total_rows) * 100)
                      : job.status === 'COMPLETED'
                        ? 100
                        : 0;

                  const successWidth =
                    job.total_rows && job.total_rows > 0
                      ? (job.success_rows / job.total_rows) * 100
                      : 0;
                  const dupWidth =
                    job.total_rows && job.total_rows > 0
                      ? (job.duplicate_rows / job.total_rows) * 100
                      : 0;
                  const failWidth =
                    job.total_rows && job.total_rows > 0
                      ? (job.failed_rows / job.total_rows) * 100
                      : 0;

                  return (
                    <tr key={job.id}>
                      <td style={{ textAlign: 'left' }}>
                        <div
                          style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: 2 }}
                        >
                          {job.original_filename}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {formatDate(job.created_at)}
                          {job.total_rows
                            ? ` – ${formatNumber(job.total_rows)} satır`
                            : job.status === 'FAILED'
                              ? ' – okunamadı'
                              : job.status === 'PENDING'
                                ? ' – sırada'
                                : ''}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <StatusBadge status={job.status} />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {job.status === 'PENDING' && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            Sırada
                          </span>
                        )}
                        {job.status === 'FAILED' && (
                          <div style={{ display: 'inline-flex', justifyContent: 'center' }}>
                            <span
                              className="status-badge"
                              style={{
                                background:
                                  job.duplicate_rows > 0
                                    ? 'var(--color-warning-bg)'
                                    : 'var(--color-danger-bg)',
                                color:
                                  job.duplicate_rows > 0
                                    ? 'var(--color-warning-text)'
                                    : 'var(--color-danger-text)',
                              }}
                            >
                              <span
                                className="status-dot"
                                style={{
                                  background:
                                    job.duplicate_rows > 0
                                      ? 'var(--color-warning-text)'
                                      : 'var(--color-danger-text)',
                                }}
                              />
                              {job.duplicate_rows > 0 ? 'Tümü mükerrer' : 'İşlem başarısız'}
                            </span>
                          </div>
                        )}
                        {(job.status === 'PROCESSING' ||
                          job.status === 'COMPLETED' ||
                          job.status === 'PARTIALLY_COMPLETED') && (
                          <div
                            style={{
                              display: 'inline-flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                            }}
                          >
                            <div className="table-progress-bar">
                              <div
                                style={{
                                  width: `${successWidth}%`,
                                  background: 'var(--color-success)',
                                }}
                              />
                              <div
                                style={{
                                  width: `${dupWidth}%`,
                                  background: 'var(--color-warning)',
                                }}
                              />
                              <div
                                style={{
                                  width: `${failWidth}%`,
                                  background: 'var(--color-danger)',
                                }}
                              />
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: 'var(--text-muted)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              %{percent}
                              {job.status === 'PROCESSING' &&
                                job.total_rows &&
                                ` – ${formatNumber(job.processed_rows)} / ${formatNumber(job.total_rows)} satır`}
                              {job.status !== 'PROCESSING' &&
                                ` – ${formatDuration(job.started_at, job.finished_at)}`}
                            </div>
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          textAlign: 'center',
                          fontWeight: 500,
                          color: 'var(--color-success-text)',
                        }}
                      >
                        {job.status === 'PENDING' ? '-' : formatNumber(job.success_rows)}
                      </td>
                      <td
                        style={{
                          textAlign: 'center',
                          fontWeight: 500,
                          color:
                            job.failed_rows > 0 ? 'var(--color-danger-text)' : 'var(--text-muted)',
                        }}
                      >
                        {job.status === 'PENDING' ? '-' : formatNumber(job.failed_rows)}
                      </td>
                      <td
                        style={{
                          textAlign: 'center',
                          fontWeight: 500,
                          color:
                            job.duplicate_rows > 0
                              ? 'var(--color-warning-text)'
                              : 'var(--text-muted)',
                        }}
                      >
                        {job.status === 'PENDING' ? '-' : formatNumber(job.duplicate_rows)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-action-report"
                          onClick={() => navigate(`/imports/${job.id}`)}
                        >
                          {job.failed_rows > 0 ||
                          job.status === 'PARTIALLY_COMPLETED' ||
                          job.status === 'FAILED'
                            ? 'Hata Raporunu Gör'
                            : 'Detay'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
