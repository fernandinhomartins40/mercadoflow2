import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileUp, Search, SearchX } from 'lucide-react';
import { TabHeader } from './ui';
import DocCard, { docState } from './DocCard';
import { useDocuments } from './useDocuments';

/** Todas as notas: filtro por situação e busca por fornecedor ou número. */

type Filter = 'TODO' | 'DONE' | 'ALL';
const FILTERS: Array<[Filter, string]> = [['TODO', 'A conferir'], ['DONE', 'Conferidas'], ['ALL', 'Todas']];

const NotesScreen: React.FC<{ marketId: string }> = ({ marketId }) => {
  const docs = useDocuments(marketId);
  const [filter, setFilter] = useState<Filter>('TODO');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (docs ?? []).filter((d) => {
      const st = docState(d);
      if (filter === 'TODO' && st === 'DONE') return false;
      if (filter === 'DONE' && st !== 'DONE') return false;
      if (!term) return true;
      return (d.emitterName ?? '').toLowerCase().includes(term) || (d.number ?? '').includes(term) || d.accessKey.includes(term);
    });
  }, [docs, filter, q]);

  const count = (f: Filter) => (docs ?? []).filter((d) => (f === 'ALL' ? true : f === 'DONE' ? docState(d) === 'DONE' : docState(d) !== 'DONE')).length;

  return (
    <>
      <TabHeader title="Notas" action={
        <Link to="/confere/importar" aria-label="Importar XML" className="flex h-11 w-11 items-center justify-center rounded-full shadow-sm lg-card"><FileUp className="h-5 w-5 text-[#157A3D]" /></Link>
      } />
      <div className="flex flex-col gap-4 px-4 pt-1">
        <label className="flex h-12 items-center gap-2 rounded-2xl px-4 lg-card focus-within:ring-2 focus-within:ring-[#157A3D]/40">
          <Search className="h-5 w-5 text-[#8A978F]" aria-hidden="true" />
          <span className="sr-only">Buscar nota</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Fornecedor ou número da nota" className="min-w-0 flex-1 bg-transparent text-base outline-none" />
        </label>
        <div className="grid grid-cols-3 lg-glass rounded-full p-1" role="tablist" aria-label="Situação">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
              className={`flex h-10 items-center justify-center gap-1 rounded-full text-sm font-bold transition ${filter === k ? 'lg-tab-on' : 'text-[#5F7067]'}`}>
              {label}{docs && <span className={`tabular-nums ${filter === k ? 'text-[#157A3D]' : ''}`}>{count(k)}</span>}
            </button>
          ))}
        </div>
        {docs === null ? (
          <ul className="flex flex-col gap-2">{[0, 1, 2].map((i) => <li key={i} className="h-[84px] animate-pulse rounded-3xl bg-white/70" />)}</ul>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <SearchX className="h-10 w-10 text-[#8A978F]" aria-hidden="true" />
            <p className="text-lg font-bold">{q ? 'Nenhuma nota com esse nome ou número' : filter === 'DONE' ? 'Nenhuma nota conferida ainda' : 'Nada para conferir'}</p>
            <p className="text-base text-[#5F7067]">Toque em <strong>Conferir</strong> para ler uma nota nova.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">{list.map((d) => <DocCard key={d.id} d={d} />)}</ul>
        )}
      </div>
    </>
  );
};

export default NotesScreen;
