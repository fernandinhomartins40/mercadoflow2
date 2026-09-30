import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Infinity as InfinityIcon, KeyRound, PackageOpen, Plus, ShieldCheck } from 'lucide-react';
import type { ConfereStatus } from '../../types/confere.types';
import { SectionTitle, TabHeader } from './ui';
import DocCard, { docState } from './DocCard';
import InstallApp from './InstallApp';
import { useDocuments } from './useDocuments';

/** Início: saldo em destaque, o que falta conferir e atalhos. */

const Wallet: React.FC<{ status: ConfereStatus }> = ({ status }) => {
  const a1 = !!status.certificate && !status.certificate.expired;
  return (
    <section className="cf-wallet relative overflow-hidden rounded-[28px] p-5 text-white shadow-[0_18px_40px_-18px_rgba(6,89,44,0.8)]" aria-label="Saldo">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white/75">{a1 ? 'Leitura pela Sefaz' : 'Leituras disponíveis'}</p>
          {a1 ? (
            <p className="mt-1 flex items-center gap-2 text-4xl font-extrabold tracking-tight"><InfinityIcon className="h-9 w-9" aria-hidden="true" />Ilimitado</p>
          ) : (
            <p className="mt-1 text-5xl font-extrabold tabular-nums tracking-tight">
              {status.balance} <span className="text-xl font-bold text-white/80">{status.balance === 1 ? 'leitura' : 'leituras'}</span>
            </p>
          )}
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${a1 ? 'bg-white/20' : 'bg-black/20'}`}>
          {a1 ? <><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />A1 ativo</> : <><KeyRound className="h-3.5 w-3.5" aria-hidden="true" />Sem A1</>}
        </span>
      </div>
      <div className="mt-5 flex gap-2">
        <Link to="/confere/creditos" className="flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl bg-white/95 text-base max-[360px]:text-sm font-bold text-[#06592C] active:scale-[0.98]">
          <Plus className="h-5 w-5" aria-hidden="true" />Comprar
        </Link>
        {!a1 && (
          <Link to="/confere/certificado" className="flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl bg-white/15 text-base max-[360px]:text-sm font-bold ring-1 ring-white/30 active:scale-[0.98]">
            Usar o A1 grátis
          </Link>
        )}
      </div>
    </section>
  );
};

const Home: React.FC<{ status: ConfereStatus; marketId: string }> = ({ status, marketId }) => {
  const docs = useDocuments(marketId);
  const all = docs ?? [];
  const toCheck = all.filter((d) => docState(d) === 'TODO');
  const counts = {
    todo: toCheck.length,
    done: all.filter((d) => docState(d) === 'DONE').length,
    wait: all.filter((d) => docState(d) === 'WAIT').length,
  };

  return (
    <>
      <TabHeader small subtitle="Olá," title={status.marketName}
        action={<img src="/api/v1/public/confere/icon/icon192" alt="" className="h-11 w-11 shrink-0 rounded-2xl shadow-sm lg-card" />} />
      <div className="flex flex-col gap-6 px-4 pt-2">
        <Wallet status={status} />

        <ul className="grid grid-cols-3 gap-2" aria-label="Resumo das notas">
          {([['A conferir', counts.todo, 'text-amber-700'], ['Conferidas', counts.done, 'text-[#0A7A3D]'], ['Na Sefaz', counts.wait, 'text-stone-600']] as const).map(([label, n, color]) => (
            <li key={label}>
              <Link to="/confere/notas" className="flex flex-col rounded-2xl px-3 py-3 lg-card">
                <span className={`text-2xl font-extrabold tabular-nums ${color}`}>{docs === null ? '–' : n}</span>
                <span className="text-sm font-semibold text-[#5B6B62]">{label}</span>
              </Link>
            </li>
          ))}
        </ul>

        <InstallApp />

        <section className="flex flex-col gap-3">
          <SectionTitle action={all.length > 0 && <Link to="/confere/notas" className="text-sm font-bold text-[#0A7A3D]">Ver todas</Link>}>
            Para conferir
          </SectionTitle>
          {docs === null ? (
            <ul className="flex flex-col gap-2" aria-label="Carregando">
              {[0, 1].map((i) => <li key={i} className="h-[84px] animate-pulse rounded-3xl bg-white/70" />)}
            </ul>
          ) : toCheck.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-[#CFDAD3] bg-white/60 px-6 py-8 text-center">
              <PackageOpen className="h-10 w-10 text-[#0A7A3D]" aria-hidden="true" />
              <p className="text-lg font-bold">Nenhuma nota esperando</p>
              <p className="text-base text-[#5B6B62]">Quando o caminhão chegar, toque em <strong>Conferir</strong> e aponte a câmera para o DANFE.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">{toCheck.slice(0, 5).map((d) => <DocCard key={d.id} d={d} />)}</ul>
          )}
        </section>

        <a href="/app" className="relative overflow-hidden rounded-3xl bg-[#0F1A14] p-5 text-white">
          <span className="flex items-center justify-between">
            <span className="text-sm font-bold text-[#B6F36A]">MercadoFlow</span>
            <ArrowUpRight className="h-5 w-5 text-white/60" aria-hidden="true" />
          </span>
          <span className="mt-2 block text-xl font-extrabold leading-snug">Você confere o que entra. E o que sai?</span>
          <span className="mt-1 block text-base text-white/70">Ligue o caixa ao MercadoFlow e saiba o que vende, o que está parado e quanto comprar de cada produto.</span>
        </a>
      </div>
    </>
  );
};

export default Home;
