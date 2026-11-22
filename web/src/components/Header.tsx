import { useState } from 'react';
import { getApiKey, setApiKey, maskApiKey } from '../api/client';

export function Header() {
  const [showModal, setShowModal] = useState(false);
  const [apiKey, setKeyValue] = useState(getApiKey());
  const [currentKey, setCurrentKey] = useState(getApiKey());

  const handleSave = () => {
    setApiKey(apiKey);
    setCurrentKey(apiKey);
    setShowModal(false);
  };

  return (
    <>
      <header className="app-header">
        <a href="/" className="logo-area">
          <span>Veri Aktarım ve İşleme Sistemi</span>
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/docs" target="_blank" rel="noopener noreferrer" className="header-docs-btn">
            <span>📖</span>
            <span>API Dokümantasyonu (Swagger)</span>
          </a>

          <button className="header-api-btn" onClick={() => setShowModal(true)} type="button">
            API anahtarı {maskApiKey(currentKey)}
          </button>
        </div>
      </header>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">API anahtarı gerekli</div>
            <div className="modal-desc">
              Yüklemeleri görmek için anahtarınızı girin. Anahtar yalnızca bu tarayıcıda saklanır.
            </div>
            <input
              type="password"
              className="modal-input"
              value={apiKey}
              onChange={(e) => setKeyValue(e.target.value)}
              placeholder="API Anahtarı"
            />
            <div className="modal-actions">
              <button type="button" className="btn-outline" onClick={() => setShowModal(false)}>
                Vazgeç
              </button>
              <button type="button" className="btn-primary" onClick={handleSave}>
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
