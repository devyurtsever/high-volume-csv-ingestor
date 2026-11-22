import type { ImportStatus } from '../types';

interface StatusBadgeProps {
  status: ImportStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const map: Record<ImportStatus, { label: string; className: string }> = {
    PROCESSING: { label: 'İşleniyor', className: 'status-processing' },
    COMPLETED: { label: 'Tamamlandı', className: 'status-completed' },
    PARTIALLY_COMPLETED: { label: 'Kısmen tamamlandı', className: 'status-partially_completed' },
    FAILED: { label: 'Başarısız', className: 'status-failed' },
    PENDING: { label: 'Bekliyor', className: 'status-pending' },
  };

  const current = map[status] || { label: status, className: 'status-pending' };

  return (
    <span className={`status-badge ${current.className}`}>
      <span className="status-dot" />
      {current.label}
    </span>
  );
}
