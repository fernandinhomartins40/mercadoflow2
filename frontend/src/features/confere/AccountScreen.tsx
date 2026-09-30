import React, { useState } from 'react';
import { Factory, FileText, FileUp, KeyRound, LogOut, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { ConfereStatus } from '../../types/confere.types';
import { maskCnpj } from '../../utils/formMasks';
import { Group, Row, TabHeader } from './ui';
import InstallApp from './InstallApp';

/** Conta: o mercado, o certificado, importação, parceria com fabricantes, termos e sair. */
const AccountScreen: React.FC<{ status: ConfereStatus }> = ({ status }) => {
  const { logout, email } = useAuth();
  const [terms, setTerms] = useState(false);
  const cert = status.certificate;
  const certDetail = !cert ? 'Leitura grátis e ilimitada' : cert.expired ? 'Vencido: envie o novo'
    : `Ativo até ${new Date(cert.notAfter).toLocaleDateString('pt-BR')}`;

  return (
    <>
      <TabHeader title="Conta" />
      <div className="flex flex-col gap-6 px-4 pt-1">
        <section className="flex items-center gap-4 rounded-3xl p-4 lg-card">
          <span className="cf-wallet flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-extrabold text-white" aria-hidden="true">
            {status.marketName.trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-lg font-extrabold">{status.marketName}</span>
            {status.marketCnpj && <span className="block text-sm text-[#5B6B62]">CNPJ {maskCnpj(status.marketCnpj)}</span>}
            {email && <span className="block truncate text-sm text-[#5B6B62]">{email}</span>}
          </span>
        </section>

        <Group label="Notas">
          <Row to="/confere/certificado" icon={cert && !cert.expired ? <ShieldCheck className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
            tone={cert?.expired ? 'red' : 'green'} title="Certificado A1" detail={certDetail} />
          <Row to="/confere/importar" icon={<FileUp className="h-5 w-5" />} title="Importar XML" detail="Nota recebida por e-mail ou WhatsApp" />
        </Group>

        <Group label="Parcerias">
          <Row to="/confere/fabricantes" icon={<Factory className="h-5 w-5" />} tone={status.manufacturerVisibility ? 'green' : 'stone'} title="Fabricantes"
            detail={status.manufacturerVisibility ? 'Você aparece para os fabricantes' : 'Receber ofertas personalizadas'} />
        </Group>

        <InstallApp />

        <Group label="Sobre">
          <Row onClick={() => setTerms(true)} icon={<FileText className="h-5 w-5" />} tone="stone" title="Termos do Confere" detail={`Versão ${status.termsVersion}`} />
          <Row onClick={() => logout()} icon={<LogOut className="h-5 w-5" />} tone="red" title="Sair" trailing={<span />} />
        </Group>
      </div>

      {terms && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40" onClick={() => setTerms(false)}>
          <div role="dialog" aria-modal="true" aria-label="Termos do Confere" onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85dvh] w-full max-w-xl flex-col gap-3 overflow-auto rounded-t-3xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold">Termos do Confere</h2>
              <button type="button" onClick={() => setTerms(false)} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100"><X className="h-5 w-5" /></button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-base text-[#34443B]">{status.termsText}</pre>
          </div>
        </div>
      )}
    </>
  );
};

export default AccountScreen;
