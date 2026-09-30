import React from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, ChevronRight, Clock3, Hourglass } from 'lucide-react';
import type { DocumentSummary } from '../../types/confere.types';

/** Uma nota na lista: fornecedor com iniciais, número, itens, data e a situação em destaque. */

const money = (v: number | null) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

const initials = (name: string | null) =>
  (name ?? 'F').replace(/\b(LTDA|ME|EPP|S\/?A|EIRELI|DISTRIBUIDORA|COMERCIO|DE|DA|DO|E)\b/gi, '').trim()
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'F';

export const docState = (d: DocumentSummary): 'DONE' | 'TODO' | 'WAIT' =>
  d.completeness !== 'FULL' ? 'WAIT' : d.checkStatus === 'DONE' ? 'DONE' : 'TODO';

const STATE = {
  TODO: { label: 'A conferir', cls: 'bg-amber-100 text-amber-900', icon: Clock3 },
  DONE: { label: 'Conferida', cls: 'bg-[#E3F4EA] text-[#0A7A3D]', icon: BadgeCheck },
  WAIT: { label: 'Aguardando Sefaz', cls: 'bg-stone-100 text-stone-600', icon: Hourglass },
};

const DocCard: React.FC<{ d: DocumentSummary }> = ({ d }) => {
  const state = docState(d);
  const s = STATE[state];
  const Icon = s.icon;
  const date = d.issuedAt ? new Date(d.issuedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : null;
  const body = (
    <>
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-base font-extrabold ${state === 'DONE' ? 'bg-[#E3F4EA] text-[#0A7A3D]' : 'bg-[#0F1A14] text-white'}`} aria-hidden="true">
        {initials(d.emitterName)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold">{d.emitterName ?? 'Fornecedor'}</span>
        <span className="block truncate text-sm text-[#5B6B62]">
          NF {d.number ?? d.accessKey.slice(25, 34)}{d.itemsCount ? `, ${d.itemsCount} itens` : ''}{d.totalValue ? `, ${money(d.totalValue)}` : ''}
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${s.cls}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />{s.label}
          </span>
          {date && <span className="text-xs font-semibold text-[#8A978F]">{date}</span>}
        </span>
      </span>
      {state !== 'WAIT' && <ChevronRight className="h-5 w-5 shrink-0 text-stone-300" aria-hidden="true" />}
    </>
  );
  const cls = 'flex items-center gap-3 rounded-3xl bg-white p-3.5 ring-1 ring-[#DCE5DF] active:scale-[0.99] transition';
  return (
    <li>
      {state === 'WAIT'
        ? <div className={`${cls} opacity-80`}>{body}</div>
        : <Link to={`/confere/nota/${d.id}`} className={cls}>{body}</Link>}
    </li>
  );
};

export default DocCard;
