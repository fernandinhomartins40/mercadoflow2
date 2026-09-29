import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { confereService } from '../../services/confere.service';
import Scanner from './Scanner';
import { BigButton, Field, Shell, TopBar, errorText, keyFrom, validKey } from './ui';

/** Ler a nota: câmera no código de barras do DANFE ou a chave digitada. */
const ReadScreen: React.FC<{ marketId: string; onBalance: (b: number) => void }> = ({ marketId, onBalance }) => {
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
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
    <Shell>
      <TopBar title="Ler nota" />
      <div className="flex flex-col gap-4 px-4 pb-10">
        {busy ? (
          <div className="flex h-[46vh] flex-col items-center justify-center gap-4 rounded-3xl bg-white p-6 text-center" role="status">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-green-700 border-t-transparent" />
            <p className="text-2xl font-bold">Buscando a nota…</p>
            <p className="text-lg text-stone-600">Pode levar alguns segundos enquanto a Receita responde.</p>
          </div>
        ) : (
          <Scanner formats={['code_128', 'qr_code', 'itf']} onDetect={read} hint="Aponte para o código de barras do DANFE"
            accept={(v) => validKey(keyFrom(v))} />
        )}
        {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 text-lg text-red-800">{error}</p>}
        <form onSubmit={(e) => { e.preventDefault(); read(typed); }} className="flex flex-col gap-3 rounded-3xl bg-white p-4">
          <Field label="Ou digite a chave de acesso" inputMode="numeric" value={typed} maxLength={60}
            onChange={(e) => setTyped(e.target.value.replace(/[^\d ]/g, ''))} placeholder="44 números embaixo do código de barras" />
          <BigButton type="submit" disabled={busy || typed.replace(/\D/g, '').length !== 44}>Buscar nota</BigButton>
        </form>
      </div>
    </Shell>
  );
};

export default ReadScreen;
