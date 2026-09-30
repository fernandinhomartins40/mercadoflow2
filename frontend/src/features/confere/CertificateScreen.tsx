import React, { useState } from 'react';
import { RefreshCw, ShieldCheck, Upload } from 'lucide-react';
import { confereService } from '../../services/confere.service';
import type { ConfereStatus } from '../../types/confere.types';
import { maskCnpj } from '../../utils/formMasks';
import { BigButton, Field, TopBar, errorText } from './ui';

/** Certificado A1: com ele as notas vêm da Sefaz, grátis e sem limite. */
const CertificateScreen: React.FC<{ status: ConfereStatus; marketId: string; refresh: () => void }> = ({ status, marketId, refresh }) => {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [uf, setUf] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cert = status.certificate;

  const syncNow = async () => {
    setBusy('sync');
    try {
      setMsg({ ok: true, text: await confereService.sync(marketId) });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, 'A Sefaz não respondeu agora; tentamos de novo sozinhos.') });
    }
    setBusy(null);
    refresh();
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setBusy('save');
    setMsg(null);
    try {
      await confereService.saveCertificate(marketId, file, password, uf);
      setMsg({ ok: true, text: 'Certificado guardado. Buscando as notas na Sefaz…' });
      setFile(null);
      refresh();
      await syncNow();
    } catch (err) {
      setMsg({ ok: false, text: errorText(err, 'Não foi possível abrir o certificado.') });
    } finally {
      setBusy(null);
      setPassword('');
    }
  };

  const remove = async () => {
    if (!window.confirm('Remover o certificado? As notas deixam de chegar sozinhas.')) return;
    await confereService.removeCertificate(marketId);
    refresh();
  };

  return (
    <>
      <TopBar title="Certificado A1" back="/confere/conta" />
      <div className="flex flex-col gap-4 px-4 pb-6 pt-1">
        <p className="text-lg text-stone-700">
          Com o certificado digital A1 do mercado, o Confere baixa da Sefaz, de graça, todas as notas emitidas contra o seu CNPJ
          e registra a &quot;ciência da operação&quot; para liberar os produtos. Ele fica guardado cifrado e só é usado para isso.
        </p>
        {cert && (
          <section className="flex flex-col gap-2 rounded-3xl bg-white p-5 ring-1 ring-[#DCE5DF]">
            <p className="flex items-center gap-2 text-xl font-bold text-[#0A7A3D]"><ShieldCheck className="h-6 w-6" aria-hidden="true" />Certificado ativo</p>
            <p className="text-lg">{cert.holder}</p>
            <p className="text-base text-stone-600">CNPJ {maskCnpj(cert.cnpj)}, vence em {new Date(cert.notAfter).toLocaleDateString('pt-BR')}</p>
            {cert.expired && <p className="text-lg font-semibold text-red-700">Vencido: envie o certificado novo.</p>}
            <p className="text-base text-stone-600">{cert.lastSyncAt ? `Última busca: ${new Date(cert.lastSyncAt).toLocaleString('pt-BR')}. ` : ''}{cert.lastStatus ?? ''}</p>
            <div className="flex gap-2">
              <BigButton tone="white" className="h-14 text-lg" disabled={!!busy} onClick={syncNow}>
                <RefreshCw className={`h-5 w-5 ${busy === 'sync' ? 'animate-spin' : ''}`} aria-hidden="true" />Buscar agora
              </BigButton>
              <BigButton tone="white" className="h-14 text-lg text-red-700" disabled={!!busy} onClick={remove}>Remover</BigButton>
            </div>
          </section>
        )}
        {msg && <p role="status" className={`rounded-2xl p-4 text-lg ${msg.ok ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-800'}`}>{msg.text}</p>}
        <form onSubmit={save} className="flex flex-col gap-4 rounded-3xl bg-white p-5 ring-1 ring-[#DCE5DF]">
          <h2 className="text-xl font-extrabold">{cert ? 'Trocar o certificado' : 'Enviar o certificado'}</h2>
          <label className="flex h-20 cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-stone-300 text-lg font-semibold">
            <Upload className="h-6 w-6 text-[#0A7A3D]" aria-hidden="true" />{file ? file.name : 'Escolher arquivo .pfx ou .p12'}
            <input type="file" accept=".pfx,.p12,application/x-pkcs12" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <Field label="Senha do certificado" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Field label="UF do mercado (se não estiver no cadastro)" value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} placeholder="SP" />
          <BigButton type="submit" disabled={!file || !!busy}>{busy === 'save' ? 'Guardando…' : 'Guardar certificado'}</BigButton>
        </form>
      </div>
    </>
  );
};

export default CertificateScreen;
