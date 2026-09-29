import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, ChevronRight, CreditCard, FileUp, KeyRound, LogOut, ScanBarcode } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { confereService } from '../../services/confere.service';
import type { ConfereStatus, DocumentSummary } from '../../types/confere.types';
import { Shell } from './ui';
import InstallApp from './InstallApp';

/** Início: saldo, botão grande de ler nota e as notas que chegaram (inclusive pela Sefaz). */

const BalanceChip: React.FC<{ status: ConfereStatus }> = ({ status }) => (
  status.certificate && !status.certificate.expired
    ? <span className="rounded-full bg-green-100 px-3 py-1 text-base font-bold text-green-800">Ilimitado (certificado A1)</span>
    : <span className={`rounded-full px-3 py-1 text-base font-bold ${status.balance > 0 ? 'bg-yellow-100 text-yellow-900' : 'bg-red-100 text-red-800'}`}>
        {status.balance} {status.balance === 1 ? 'leitura' : 'leituras'}
      </span>
);

const DocRow: React.FC<{ d: DocumentSummary }> = ({ d }) => (
  <li>
    <Link to={d.completeness === 'FULL' ? `/confere/nota/${d.id}` : '#'} onClick={(e) => { if (d.completeness !== 'FULL') e.preventDefault(); }}
      className="flex items-center gap-3 rounded-2xl bg-white p-4">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-bold">{d.emitterName ?? 'Fornecedor'}</span>
        <span className="block text-base text-stone-600">
          NF {d.number ?? d.accessKey.slice(25, 34)}{d.itemsCount ? `, ${d.itemsCount} itens` : ''}{d.issuedAt ? `, ${new Date(d.issuedAt).toLocaleDateString('pt-BR')}` : ''}
        </span>
        {d.completeness !== 'FULL' && <span className="block text-sm font-semibold text-amber-800">Aguardando a Sefaz liberar os produtos</span>}
      </span>
      {d.checkStatus === 'DONE' ? <BadgeCheck className="h-7 w-7 text-green-700" aria-label="Conferida" /> : <ChevronRight className="h-7 w-7 text-stone-400" aria-hidden="true" />}
    </Link>
  </li>
);

const Home: React.FC<{ status: ConfereStatus; marketId: string }> = ({ status, marketId }) => {
  const { logout } = useAuth();
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  useEffect(() => { confereService.documents(marketId).then(setDocs).catch(() => setDocs([])); }, [marketId]);
  const toCheck = (docs ?? []).filter((d) => d.checkStatus !== 'DONE');
  const checked = (docs ?? []).filter((d) => d.checkStatus === 'DONE');

  return (
    <Shell>
      <div className="flex flex-col gap-5 px-4 pb-10 pt-5">
        <header className="flex items-center gap-3">
          <img src="/api/v1/public/confere/icon/icon192" alt="" className="h-12 w-12 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{status.marketName}</p>
            <BalanceChip status={status} />
          </div>
          <button type="button" onClick={() => logout()} aria-label="Sair" className="flex h-12 w-12 items-center justify-center rounded-full bg-white"><LogOut className="h-6 w-6" /></button>
        </header>

        <Link to="/confere/ler" className="flex h-36 flex-col items-center justify-center gap-2 rounded-3xl bg-green-700 text-white shadow-lg active:bg-green-800">
          <ScanBarcode className="h-12 w-12" aria-hidden="true" />
          <span className="text-3xl font-extrabold">Ler nota</span>
        </Link>

        <InstallApp />

        {!status.certificate && (
          <Link to="/confere/certificado" className="flex items-center gap-3 rounded-3xl border-2 border-green-700 bg-white p-4">
            <KeyRound className="h-8 w-8 shrink-0 text-green-700" aria-hidden="true" />
            <span className="flex-1">
              <span className="block text-lg font-bold">Leitura grátis e ilimitada</span>
              <span className="block text-base text-stone-700">Cadastre o certificado A1: as notas chegam sozinhas, antes do caminhão.</span>
            </span>
            <ChevronRight className="h-6 w-6 text-stone-400" aria-hidden="true" />
          </Link>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-extrabold">Notas para conferir</h2>
          {docs === null ? <p className="text-lg text-stone-600">Carregando…</p>
            : toCheck.length === 0 ? <p className="rounded-2xl bg-white p-4 text-lg text-stone-700">Nenhuma nota esperando. Toque em <strong>Ler nota</strong> quando a mercadoria chegar.</p>
            : <ul className="flex flex-col gap-2">{toCheck.slice(0, 20).map((d) => <DocRow key={d.id} d={d} />)}</ul>}
        </section>
        {checked.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xl font-extrabold">Conferidas</h2>
            <ul className="flex flex-col gap-2">{checked.slice(0, 10).map((d) => <DocRow key={d.id} d={d} />)}</ul>
          </section>
        )}

        <nav className="grid grid-cols-3 gap-2" aria-label="Mais opções">
          <Link to="/confere/creditos" className="flex flex-col items-center gap-1 rounded-2xl bg-white p-4 text-base font-semibold"><CreditCard className="h-7 w-7 text-green-700" aria-hidden="true" />Créditos</Link>
          <Link to="/confere/certificado" className="flex flex-col items-center gap-1 rounded-2xl bg-white p-4 text-base font-semibold"><KeyRound className="h-7 w-7 text-green-700" aria-hidden="true" />Certificado</Link>
          <Link to="/confere/importar" className="flex flex-col items-center gap-1 rounded-2xl bg-white p-4 text-base font-semibold"><FileUp className="h-7 w-7 text-green-700" aria-hidden="true" />Importar XML</Link>
        </nav>

        <a href="/app" className="rounded-3xl bg-stone-900 p-5 text-white">
          <span className="block text-sm font-semibold text-yellow-300">MercadoFlow</span>
          <span className="mt-1 block text-xl font-bold">Você confere o que entra. E o que sai?</span>
          <span className="mt-1 block text-base text-stone-300">Ligue o caixa ao MercadoFlow e saiba o que vende, o que está parado e quanto comprar de cada produto.</span>
        </a>
      </div>
    </Shell>
  );
};

export default Home;
