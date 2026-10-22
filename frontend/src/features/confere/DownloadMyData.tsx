import React, { useState } from 'react';
import { Download, X } from 'lucide-react';
import { DATA_EXPORT_SUMMARY, fetchMyData, shareOrSave } from '../../services/personalDataExport';
import { BigButton, Row } from './ui';

/** "Baixar meus dados" no Bipaê (LGPD art. 18, II e V). No celular abre a folha de compartilhar para salvar o arquivo. */
const DownloadMyData: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const close = () => { setOpen(false); setMessage(null); };

  const download = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await shareOrSave(await fetchMyData());
      setMessage('Pronto. O arquivo foi gerado.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Row onClick={() => setOpen(true)} icon={<Download className="h-5 w-5" />} tone="stone" title="Baixar meus dados"
        detail="Uma cópia dos seus dados pessoais" />

      {/* Dentro de <li>: o Row fica numa lista (Group). */}
      {open && (
        <li className="list-none">
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={close}>
          <div role="dialog" aria-modal="true" aria-label="Baixar meus dados" onClick={(e) => e.stopPropagation()}
            className="flex max-h-[90dvh] w-full max-w-xl flex-col gap-4 overflow-auto rounded-t-3xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold">Baixar meus dados</h2>
              <button type="button" onClick={close} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-base text-[#34443B]">{DATA_EXPORT_SUMMARY}</p>
            <p className="text-sm text-[#5F7067]">Dá para baixar uma vez a cada 10 minutos.</p>
            <BigButton type="button" disabled={busy} onClick={() => { void download(); }}>{busy ? 'Preparando…' : 'Baixar meus dados'}</BigButton>
            {message && <p role="status" className="rounded-2xl bg-stone-100 p-4 text-base">{message}</p>}
          </div>
        </div>
        </li>
      )}
    </>
  );
};

export default DownloadMyData;
