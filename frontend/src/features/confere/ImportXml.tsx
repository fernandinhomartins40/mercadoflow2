import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileUp } from 'lucide-react';
import { confereService } from '../../services/confere.service';
import { Shell, TopBar, errorText } from './ui';

/** XML recebido por e-mail ou WhatsApp: confere do mesmo jeito, sem gastar leitura. */
const ImportXml: React.FC<{ marketId: string }> = ({ marketId }) => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const location = useLocation();

  const send = useCallback(async (blob: Blob, name?: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await confereService.upload(marketId, blob, name);
      navigate(`/confere/nota/${r.documentId}`);
    } catch (e) {
      setError(errorText(e, 'Esse arquivo não é um XML de nota fiscal.'));
    } finally {
      setBusy(false);
    }
  }, [marketId, navigate]);

  // Arquivo vindo do "compartilhar" do Android (o service worker guardou).
  useEffect(() => {
    if (new URLSearchParams(location.search).get('compartilhado') !== '1' || !('caches' in window)) return;
    (async () => {
      const cache = await caches.open('confere-share');
      const res = await cache.match('/confere-shared.xml');
      if (res) {
        await cache.delete('/confere-shared.xml');
        send(await res.blob(), 'compartilhado.xml');
      }
    })();
  }, [location.search, send]);

  return (
    <Shell>
      <TopBar title="Importar XML" />
      <div className="flex flex-col gap-4 px-4 pb-10">
        <p className="text-lg text-stone-700">Recebeu o XML da nota por e-mail ou WhatsApp? Importe aqui e confira do mesmo jeito. Não gasta leitura.</p>
        <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-stone-300 bg-white text-xl font-bold">
          <FileUp className="h-10 w-10 text-green-700" aria-hidden="true" />{busy ? 'Enviando…' : 'Escolher o XML'}
          <input type="file" accept=".xml,text/xml,application/xml" className="sr-only" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) send(f, f.name); e.target.value = ''; }} />
        </label>
        {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-lg text-red-800">{error}</p>}
      </div>
    </Shell>
  );
};

export default ImportXml;
