import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { DATA_EXPORT_SUMMARY, fetchMyData, saveFile } from '../../services/personalDataExport';

/** "Baixar meus dados" (LGPD art. 18, II e V): cópia dos dados pessoais da própria pessoa. */
const DownloadMyDataCard: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setMessage(null);
    try {
      saveFile(await fetchMyData());
      setMessage('Pronto. O arquivo foi baixado.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-soft)', background: 'var(--surface-base)' }} data-testid="download-my-data-card">
      <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-soft)' }}>
        <Download className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Baixar meus dados</p>
      </div>
      <div className="flex flex-col gap-3 p-5">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{DATA_EXPORT_SUMMARY}</p>
        <button type="button" disabled={busy} className="rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
          style={{ color: 'var(--text-primary)', border: '1px solid var(--border-soft)', alignSelf: 'flex-start' }}
          onClick={() => { void download(); }}>
          {busy ? 'Preparando…' : 'Baixar meus dados'}
        </button>
        {message && <p role="status" className="text-sm" style={{ color: 'var(--text-muted)' }}>{message}</p>}
      </div>
    </div>
  );
};

export default DownloadMyDataCard;
