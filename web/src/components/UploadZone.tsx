import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';
import { uploadCsvFile } from '../api/imports.api';

interface UploadZoneProps {
  onUploadSuccess: (importId: string) => void;
}

export function UploadZone({ onUploadSuccess }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileSizeMB, setFileSizeMB] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<{ title: string; desc: string } | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ id: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFile = async (file: File) => {
    setErrorMessage(null);
    setSuccessInfo(null);

    // 1. Format kontrolü
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setErrorMessage({
        title: file.name,
        desc: 'Yalnızca .csv dosyaları kabul edilir.',
      });
      return;
    }

    // 2. Boyut kontrolü (500 MB)
    const MAX_SIZE = 500 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErrorMessage({
        title: 'Dosya yüklenemedi',
        desc: 'Dosya boyutu 500 MB sınırını aşıyor.',
      });
      return;
    }

    setFileName(file.name);
    setFileSizeMB(Math.round(file.size / (1024 * 1024)));
    setUploadProgress(0);

    try {
      const res = await uploadCsvFile(file, (percent) => {
        setUploadProgress(percent);
      });
      setUploadProgress(null);
      const newId = res.id || '';
      setSuccessInfo({ id: newId });
      onUploadSuccess(newId);

      // 5 saniye sonra otomatik ekrandan kaybolsun
      setTimeout(() => {
        setSuccessInfo(null);
      }, 5000);
    } catch (err: unknown) {
      setUploadProgress(null);
      const msg = err instanceof Error ? err.message : 'Yükleme başarısız';
      setErrorMessage({
        title: file.name,
        desc: msg,
      });
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".csv"
        style={{ display: 'none' }}
      />

      <div
        className={`upload-card ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="upload-left">
          <div className="upload-icon-box">↑</div>
          <div>
            <div className="upload-text-title">
              {isDragging ? 'Bırakın, yüklensin' : 'CSV dosyasını buraya bırakın'}
            </div>
            <div className="upload-text-desc">
              {isDragging
                ? 'Dosya sürükleniyor'
                : 'Tek dosyada 1 milyon satıra kadar. En fazla 500 MB, yalnızca .csv.'}
            </div>
          </div>
        </div>

        <button type="button" className="btn-primary" onClick={() => fileInputRef.current?.click()}>
          Dosya seç
        </button>
      </div>

      {uploadProgress !== null && (
        <div className="upload-status-box">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: 8,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <span>{fileName}</span>
            <span style={{ color: 'var(--text-muted)' }}>
              {fileSizeMB} MB - yükleniyor %{uploadProgress}
            </span>
          </div>
          <div style={{ height: 6, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                background: 'var(--primary-blue)',
                width: `${uploadProgress}%`,
                transition: 'width 0.2s',
              }}
            />
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="upload-error-box">
          <div className="upload-error-title">{errorMessage.title}</div>
          <div className="upload-error-desc">{errorMessage.desc}</div>
        </div>
      )}

      {successInfo && (
        <div className="upload-success-badge">
          <div className="upload-success-left">
            <span className="upload-success-icon">✓</span>
            <span>
              Dosya alındı. {successInfo.id ? `İşlem no: ${successInfo.id.slice(0, 8)}, ` : ''}arka
              planda işleniyor.
            </span>
          </div>
          <button
            type="button"
            className="upload-success-close"
            onClick={() => setSuccessInfo(null)}
            title="Kapat"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
