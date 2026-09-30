import React, { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileUp, Keyboard } from 'lucide-react';
import { confereService } from '../../services/confere.service';
import Scanner from './Scanner';
import { BigButton, Field, Stepper, errorText, keyFrom, validKey } from './ui';

/**
 * Passo 1 — Ler a nota: câmera no código de barras do DANFE ou a chave
 * digitada. Ocupa a altura da tela sem rolar; a chave digitada abre por baixo.
 */
const ReadScreen: React.FC<{ marketId: string; onBalance: (b: number) => void }> = ({ marketId, onBalance }) => {
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const read = useCallback(async (raw: string) => {
    const key = keyFrom(raw);
    if (busyRef.current) return;
    if (!validKey(key)) { setError('Chave inválida. Confira os 44 números.'); return; }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await confereService.read(marketId, key);
      onBalance(r.balance);
      navigate(`/confere/nota/${r.documentId}`);
    } catch (e) {
      setError(errorText(e, 'Não foi possível buscar a nota. Tente de novo.'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [marketId, navigate, onBalance]);

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-xl flex-col lg-canvas text-[#0F1A14]">
      <header className="flex shrink-0 flex-col gap-2 px-4 pb-2 pt-3">
        <div className="flex items-center gap-3">
          <Link to="/confere/" aria-label="Voltar" className="flex h-12 w-12 items-center justify-center rounded-full bg-white"><ArrowLeft className="h-6 w-6" /></Link>
          <h1 className="text-2xl font-extrabold">Ler nota</h1>
        </div>
        <Stepper current={0} />
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-[max(12px,env(safe-area-inset-bottom))]">
        {busy ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-3xl bg-white p-6 text-center" role="status">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-[#0A7A3D] border-t-transparent" />
            <p className="text-2xl font-bold">Buscando a nota…</p>
            <p className="text-lg text-stone-600">Pode levar alguns segundos enquanto a Receita responde.</p>
          </div>
        ) : !typing ? (
          <div className="min-h-0 flex-1">
            <Scanner formats={['code_128', 'qr_code', 'itf']} onDetect={read} hint="Aponte para o código de barras do DANFE"
              height="100%" accept={(v) => validKey(keyFrom(v))} />
          </div>
        ) : null}

        {error && <p role="alert" className="max-h-[30dvh] shrink-0 overflow-auto rounded-2xl bg-red-50 p-4 text-lg text-red-800">{error}</p>}

        {typing ? (
          <form onSubmit={(e) => { e.preventDefault(); read(typed); }} className="flex shrink-0 flex-col gap-3 rounded-3xl bg-white p-4">
            <Field label="Ou digite a chave de acesso" inputMode="numeric" value={typed} maxLength={60} autoFocus
              onChange={(e) => setTyped(e.target.value.replace(/[^\d ]/g, ''))} placeholder="44 números embaixo do código de barras"
              hint={`${typed.replace(/\D/g, '').length} de 44 números`} />
            <BigButton type="submit" disabled={busy || typed.replace(/\D/g, '').length !== 44}>Buscar nota</BigButton>
            <button type="button" onClick={() => setTyping(false)} className="h-12 text-lg font-semibold text-[#06592C]">Voltar para a câmera</button>
          </form>
        ) : !busy && (
          <div className="grid shrink-0 grid-cols-2 gap-2">
            <button type="button" onClick={() => { setTyping(true); setError(null); }}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-white text-base font-bold text-stone-900">
              <Keyboard className="h-5 w-5 text-[#0A7A3D]" aria-hidden="true" />Digitar a chave
            </button>
            <Link to="/confere/importar" className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-white text-base font-bold text-stone-900">
              <FileUp className="h-5 w-5 text-[#0A7A3D]" aria-hidden="true" />Importar XML
            </Link>
          </div>
        )}
      </main>
    </div>
  );
};

export default ReadScreen;
