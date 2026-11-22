import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchImportById, fetchImportSummary, fetchImportErrors } from '../api/imports.api';
import { downloadCsv } from '../api/client';
import { Header } from '../components/Header';
import { StatusBadge } from '../components/StatusBadge';
import type { ImportJob, RowErrorItem } from '../types';

function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '0';
  return new Intl.NumberFormat('tr-TR').format(num);
}

function formatDate(isoStr: string | null): string {
  if (!isoStr) return '-';
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

function calculateDurationSeconds(job: ImportJob): number {
  if (!job.started_at) return 0;
  const start = new Date(job.started_at).getTime();
  const end = job.finished_at ? new Date(job.finished_at).getTime() : Date.now();
  return Math.max(1, Math.round((end - start) / 1000));
}

function formatPercent(count: number, total: number): string {
  if (total <= 0 || count <= 0) return '%0,00';
  if (count === total) return '%100,00';
  const ratio = (count / total) * 100;
  if (ratio < 0.01) return '%0,01';
  if (ratio > 99.99) return '%99,99';
  return `%${ratio.toFixed(2).replace('.', ',')}`;
}

export function ImportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [filterType, setFilterType] = useState<'ALL' | 'VALIDATION' | 'DUPLICATE'>('ALL');
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedError, setSelectedError] = useState<RowErrorItem | null>(null);
  const [copiedToast, setCopiedToast] = useState(false);

  // 1. Job details query (canlı polling)
  const { data: job } = useQuery({
    queryKey: ['import-job', id],
    queryFn: () => fetchImportById(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'PENDING' || status === 'PROCESSING' ? 2000 : false;
    },
  });

  // 2. Summary query (özellikle bittiğinde veya periyodik)
  const { data: summary } = useQuery({
    queryKey: ['import-summary', id],
    queryFn: () => fetchImportSummary(id!),
    enabled: Boolean(id) && job?.status !== 'PENDING',
    refetchInterval: () => (job?.status === 'PROCESSING' ? 2000 : false),
  });

  // 3. Keyset Pagination Error Query (useInfiniteQuery)
  const {
    data: errorsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPlaceholderData,
  } = useInfiniteQuery({
    queryKey: ['import-errors', id, filterType],
    queryFn: ({ pageParam = null }: { pageParam: number | null }) => {
      const apiType = filterType === 'ALL' ? null : filterType;
      return fetchImportErrors(id!, pageParam, apiType, 50);
    },
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
    placeholderData: keepPreviousData,
    enabled: Boolean(id),
  });

  if (!job) {
    return (
      <div>
        <Header />
        <main
          className="page-container"
          style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}
        >
          Yükleniyor...
        </main>
      </div>
    );
  }

  const isLive = job.status === 'PENDING' || job.status === 'PROCESSING';

  // Yüzdeler
  const total = job.total_rows || 0;
  const processed = job.processed_rows || 0;
  const success = job.success_rows || 0;
  const failed = job.failed_rows || 0;
  const duplicate = job.duplicate_rows || 0;

  const progressPercent =
    total > 0
      ? Math.round((processed / total) * 100)
      : job.status === 'COMPLETED' || job.status === 'PARTIALLY_COMPLETED'
        ? 100
        : 0;
  const successPercent = formatPercent(success, total);
  const failedPercent = formatPercent(failed, total);
  const duplicatePercent = formatPercent(duplicate, total);

  // Hız ve Kalan Süre
  const durationSec = summary?.duration_seconds ?? calculateDurationSeconds(job);
  const rowsPerSec =
    summary?.rows_per_second ?? (durationSec > 0 ? Math.round(processed / durationSec) : 0);
  const remainingRows = Math.max(0, total - processed);
  const estimatedRemainingSec = rowsPerSec > 0 ? Math.round(remainingRows / rowsPerSec) : 0;

  // Çubuk oranları
  const barSuccess = total > 0 ? (success / total) * 100 : 0;
  const barDup = total > 0 ? (duplicate / total) * 100 : 0;
  const barFail = total > 0 ? (failed / total) * 100 : 0;

  // Hata dağılımı (dizi olarak geliyor: [{ code: '...', count: 12 }])
  const errorDistList = summary?.error_distribution || [];
  const maxErrorCount = Math.max(1, ...errorDistList.map((item) => item.count));

  // Hata listesi (data dizisi)
  const allErrors = errorsData?.pages.flatMap((page) => page.data) || [];
  const totalErrorsCount = job.failed_rows + job.duplicate_rows;

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      await downloadCsv(job.id, `hata_raporu_${job.original_filename}`);
    } catch {
      alert('CSV indirilemedi.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div>
      <Header />

      <main className="page-container">
        <Link to="/" className="back-link">
          <span className="back-arrow">←</span>
          <span>Yüklemeler</span>
        </Link>

        {/* Top Header Row */}
        <div className="detail-top-row">
          <div>
            <div className="detail-title-group">
              <h1 className="page-title" style={{ margin: 0 }}>
                {job.original_filename}
              </h1>
              <StatusBadge status={job.status} />
              {isLive && (
                <span className="live-indicator">
                  <span className="status-dot" style={{ background: 'var(--color-info-text)' }} />
                  Canlı – her 2 saniyede güncellenir
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              İşlem no: {job.id} – Yüklenme: {formatDate(job.created_at)}
            </div>
          </div>

          <button
            type="button"
            className="btn-export-csv"
            onClick={handleDownload}
            disabled={isDownloading}
          >
            <span style={{ fontSize: 16 }}>⤓</span>
            <span>
              {isDownloading
                ? 'İndiriliyor...'
                : isLive
                  ? 'Şu ana kadarki hata raporunu CSV indir'
                  : 'Hata raporunu CSV indir'}
            </span>
          </button>
        </div>

        {/* 4 Stat Cards */}
        <div className="stat-cards-grid">
          <div className="stat-card">
            <div className="stat-label">Toplam satır</div>
            <div className="stat-value">{formatNumber(total)}</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Başarılı</div>
            <div className="stat-value-row">
              <span className="stat-value" style={{ color: 'var(--color-success-text)' }}>
                {formatNumber(success)}
              </span>
              <span className="stat-sub">{successPercent}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Hatalı</div>
            <div className="stat-value-row">
              <span
                className="stat-value"
                style={{ color: failed > 0 ? 'var(--color-danger-text)' : 'var(--text-main)' }}
              >
                {formatNumber(failed)}
              </span>
              <span className="stat-sub">{failedPercent}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Mükerrer</div>
            <div className="stat-value-row">
              <span
                className="stat-value"
                style={{ color: duplicate > 0 ? 'var(--color-warning-text)' : 'var(--text-main)' }}
              >
                {formatNumber(duplicate)}
              </span>
              <span className="stat-sub">{duplicatePercent}</span>
            </div>
          </div>
        </div>

        {/* Mid Section: Progress / Result Distribution vs Error Codes */}
        <div className="mid-section-grid">
          {/* Sol Panel */}
          <div className="panel-card">
            <div className="panel-title">{isLive ? 'İlerleme' : 'Sonuç dağılımı'}</div>

            {isLive ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  <span style={{ fontSize: 18, fontWeight: 700 }}>%{progressPercent}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {formatNumber(processed)} / {formatNumber(total)} satır işlendi
                  </span>
                </div>

                <div className="segmented-bar">
                  <div className="seg-success" style={{ width: `${barSuccess}%` }} />
                  <div className="seg-duplicate" style={{ width: `${barDup}%` }} />
                  <div className="seg-failed" style={{ width: `${barFail}%` }} />
                </div>

                <div className="bar-legend">
                  <div className="legend-item">
                    <span className="legend-dot" style={{ background: 'var(--color-success)' }} />
                    <span>Başarılı</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot" style={{ background: 'var(--color-warning)' }} />
                    <span>Mükerrer</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot" style={{ background: 'var(--color-danger)' }} />
                    <span>Hatalı</span>
                  </div>
                </div>

                <div className="metrics-row">
                  <div>
                    <div className="metric-label">Geçen süre</div>
                    <div className="metric-val">{durationSec} sn</div>
                  </div>
                  <div>
                    <div className="metric-label">Hız</div>
                    <div className="metric-val">{formatNumber(rowsPerSec)} satır/sn</div>
                  </div>
                  <div>
                    <div className="metric-label">Tahmini kalan</div>
                    <div className="metric-val">yaklaşık {estimatedRemainingSec} sn</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="segmented-bar">
                  <div className="seg-success" style={{ width: `${barSuccess}%` }} />
                  <div className="seg-duplicate" style={{ width: `${barDup}%` }} />
                  <div className="seg-failed" style={{ width: `${barFail}%` }} />
                </div>

                <div className="bar-legend">
                  <div className="legend-item">
                    <span className="legend-dot" style={{ background: 'var(--color-success)' }} />
                    <span>Başarılı</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot" style={{ background: 'var(--color-warning)' }} />
                    <span>Mükerrer</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot" style={{ background: 'var(--color-danger)' }} />
                    <span>Hatalı</span>
                  </div>
                </div>

                <div className="metrics-row">
                  <div>
                    <div className="metric-label">Süre</div>
                    <div className="metric-val">{durationSec} sn</div>
                  </div>
                  <div>
                    <div className="metric-label">Hız</div>
                    <div className="metric-val">{formatNumber(rowsPerSec)} satır/sn</div>
                  </div>
                  <div>
                    <div className="metric-label">Bitiş</div>
                    <div className="metric-val">{formatDate(job.finished_at)}</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sağ Panel: Hata kodlarına göre dağılım */}
          <div className="panel-card">
            <div className="panel-title">Hata kodlarına göre dağılım</div>

            {errorDistList.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, paddingTop: 20 }}>
                Henüz kayıtlı hata yok.
              </div>
            ) : (
              <div className="error-bar-list">
                {errorDistList.map((item) => {
                  const widthPercent = (item.count / maxErrorCount) * 100;
                  return (
                    <div className="error-bar-row" key={item.code}>
                      <span className="error-bar-code">{item.code}</span>
                      <div className="error-bar-track">
                        <div className="error-bar-fill" style={{ width: `${widthPercent}%` }} />
                      </div>
                      <span className="error-bar-count">{formatNumber(item.count)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: Hatalı Kayıtlar Tablosu */}
        <div className="table-header-outside">
          <div>
            <div className="table-title-outside">Hatalı kayıtlar</div>
            <div style={{ fontSize: 15, color: 'var(--text-muted)', marginTop: 4 }}>
              Hatalı kaydın detaylı incelenmesi için ilgili satıra tıklayabilirsiniz.
            </div>
          </div>

          <div className="filter-pills">
            <button
              type="button"
              className={`pill-btn ${filterType === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilterType('ALL')}
            >
              Tümü ({formatNumber(totalErrorsCount)})
            </button>
            <button
              type="button"
              className={`pill-btn ${filterType === 'VALIDATION' ? 'active' : ''}`}
              onClick={() => setFilterType('VALIDATION')}
            >
              Hatalı ({formatNumber(failed)})
            </button>
            <button
              type="button"
              className={`pill-btn ${filterType === 'DUPLICATE' ? 'active' : ''}`}
              onClick={() => setFilterType('DUPLICATE')}
            >
              Mükerrer ({formatNumber(duplicate)})
            </button>
          </div>
        </div>

        <div className="table-card" style={{ minHeight: 320 }}>
          <table className={`data-table ${isPlaceholderData ? 'table-fetching' : ''}`}>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Satır</th>
                <th style={{ width: 120 }}>Tür</th>
                <th style={{ width: 220 }}>Hata kodları</th>
                <th>Açıklama</th>
                <th style={{ width: 280 }}>Ham veri</th>
              </tr>
            </thead>
            <tbody>
              {allErrors.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}
                  >
                    Hatalı kayıt bulunmuyor.
                  </td>
                </tr>
              ) : (
                allErrors.map((err, idx) => {
                  const isDup =
                    err.error_type === 'DUPLICATE' || err.error_codes.includes('DUPLICATE_RECORD');
                  const rawString = err.raw_data ? JSON.stringify(err.raw_data) : '-';

                  return (
                    <tr
                      key={`${err.row_number}-${idx}`}
                      onClick={() => setSelectedError(err)}
                      style={{ cursor: 'pointer' }}
                      className="error-table-row"
                    >
                      <td style={{ fontWeight: 600 }}>
                        {formatNumber(Math.max(1, err.row_number - 1))}
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 12,
                            padding: '3px 8px',
                            borderRadius: 12,
                            background: isDup
                              ? 'var(--color-warning-bg)'
                              : 'var(--color-danger-bg)',
                            color: isDup ? 'var(--color-warning-text)' : 'var(--color-danger-text)',
                            fontWeight: 500,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: isDup
                                ? 'var(--color-warning-text)'
                                : 'var(--color-danger-text)',
                            }}
                          />
                          {isDup ? 'Mükerrer' : 'Hatalı'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {err.error_codes && err.error_codes.length > 0 ? (
                            err.error_codes.map((c) => (
                              <span
                                key={c}
                                style={{
                                  fontFamily: 'monospace',
                                  fontSize: 11,
                                  background: '#f1f5f9',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  color: 'var(--text-main)',
                                }}
                              >
                                {c}
                              </span>
                            ))
                          ) : (
                            <span
                              style={{
                                fontFamily: 'monospace',
                                fontSize: 11,
                                background: '#f1f5f9',
                                padding: '2px 6px',
                                borderRadius: 4,
                                color: 'var(--text-main)',
                              }}
                            >
                              {err.error_type}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-main)', fontSize: 13 }}>
                        {err.error_message}
                      </td>
                      <td
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          maxWidth: 280,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={rawString}
                      >
                        {rawString}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {hasNextPage && (
            <div
              style={{
                padding: '20px',
                textAlign: 'center',
                borderTop: '1px solid var(--border-light)',
              }}
            >
              <button
                type="button"
                className="btn-load-more"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage
                  ? 'Yükleniyor...'
                  : `Daha fazla yükle (${allErrors.length} / ${formatNumber(totalErrorsCount)} gösteriliyor)`}
              </button>
            </div>
          )}
        </div>

        {/* Slide-over Error Detail Drawer */}
        {selectedError && (
          <div className="drawer-overlay" onClick={() => setSelectedError(null)}>
            <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
              <div className="drawer-header">
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                    Hatalı Kayıt Detayı
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      color: 'var(--text-main)',
                      marginTop: 2,
                    }}
                  >
                    Satır #{formatNumber(Math.max(1, selectedError.row_number - 1))}
                  </div>
                </div>
                <button
                  type="button"
                  className="drawer-close-btn"
                  onClick={() => setSelectedError(null)}
                >
                  ✕
                </button>
              </div>

              <div className="drawer-body">
                {/* Satır & İşlem Bilgileri Özeti */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 10,
                    background: '#f8fafc',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div>
                    <div className="drawer-label" style={{ fontSize: 10 }}>
                      Dosya
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--text-main)',
                        marginTop: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={job.original_filename}
                    >
                      {job.original_filename}
                    </div>
                  </div>
                  <div>
                    <div className="drawer-label" style={{ fontSize: 10 }}>
                      Hata Zamanı
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--text-main)',
                        marginTop: 2,
                      }}
                    >
                      {formatDate(job.created_at)}
                    </div>
                  </div>
                </div>

                {/* Hata Türü & Kodları */}
                <div className="drawer-section">
                  <div className="drawer-label">Hata Türü ve Kodları</div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      marginTop: 8,
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        padding: '4px 10px',
                        borderRadius: 14,
                        background:
                          selectedError.error_type === 'DUPLICATE'
                            ? 'var(--color-warning-bg)'
                            : 'var(--color-danger-bg)',
                        color:
                          selectedError.error_type === 'DUPLICATE'
                            ? 'var(--color-warning-text)'
                            : 'var(--color-danger-text)',
                        fontWeight: 600,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background:
                            selectedError.error_type === 'DUPLICATE'
                              ? 'var(--color-warning-text)'
                              : 'var(--color-danger-text)',
                        }}
                      />
                      {selectedError.error_type === 'DUPLICATE' ? 'Mükerrer' : 'Hatalı'}
                    </span>
                    {selectedError.error_codes.map((c: string) => (
                      <span key={c} className="drawer-code-badge">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Hata Açıklaması */}
                <div className="drawer-section">
                  <div className="drawer-label">Hata Açıklaması</div>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--text-main)',
                      marginTop: 6,
                      lineHeight: 1.5,
                      fontWeight: 500,
                      background: '#fff',
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    {selectedError.error_message}
                  </div>
                </div>

                {/* Ham CSV Verisi Tablosu */}
                <div className="drawer-section">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div className="drawer-label">Ham CSV Satır Verisi (Ayrıştırılmış)</div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {selectedError.raw_data
                        ? `${Object.keys(selectedError.raw_data).length} alan`
                        : '0 alan'}
                    </span>
                  </div>

                  {selectedError.raw_data ? (
                    <div className="drawer-table-wrapper">
                      <table className="drawer-table">
                        <thead>
                          <tr>
                            <th style={{ width: '40%' }}>Sütun (Alan)</th>
                            <th style={{ width: '60%' }}>Değer</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(selectedError.raw_data).map(([key, value]) => (
                            <tr key={key}>
                              <td className="drawer-field-name">{key}</td>
                              <td className="drawer-field-value">
                                {String(
                                  value !== null && value !== undefined && value !== ''
                                    ? value
                                    : '–',
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 12 }}>
                      Ham veri bulunmuyor.
                    </div>
                  )}
                </div>
              </div>

              {copiedToast && (
                <div className="drawer-toast">
                  <span>✓</span>
                  <span>Ham veri JSON olarak panoya kopyalandı</span>
                </div>
              )}

              <div className="drawer-footer" style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className={copiedToast ? 'btn-copied' : 'btn-action-report'}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    textAlign: 'center',
                    transition: 'all 0.2s',
                  }}
                  onClick={() => {
                    if (selectedError.raw_data) {
                      navigator.clipboard.writeText(
                        JSON.stringify(selectedError.raw_data, null, 2),
                      );
                      setCopiedToast(true);
                      setTimeout(() => setCopiedToast(false), 2500);
                    }
                  }}
                >
                  {copiedToast ? '✓ Kopyalandı!' : '📋 JSON Kopyala'}
                </button>
                <button
                  type="button"
                  className="btn-export-csv"
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    textAlign: 'center',
                    justifyContent: 'center',
                  }}
                  onClick={() => setSelectedError(null)}
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
