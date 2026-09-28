import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Footprints, RotateCcw } from 'lucide-react';
import type { DepartmentsReport, Fixture } from '../../../types/storeMap.types';
import { DEPT_BY_KEY, deptLabel, fixtureName } from '../model';
import { HEIGHTS } from './IsoView';
import { mix, shade } from './color';
import { type Aisle, longestAisle } from './aisles';

/**
 * Andar no corredor: as duas prateleiras de frente uma para a outra em CSS 3D
 * (perspective + preserve-3d). São só dois planos com caixinhas de produto
 * desenhadas por cima — nada de WebGL; o navegador compõe cada plano uma vez.
 * Os produtos são os mais vendidos de cada setor, tirados das notas.
 */

const EYE = 1.5;
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-700)]';

interface Segment { dept: string; start: number; end: number }

/** Trechos de cada setor do móvel, em metros a partir do começo da caminhada. */
function segments(f: Fixture | null, aisle: Aisle): Segment[] {
  if (!f || !f.departments.length) return [];
  const a1 = aisle.vertical ? f.y : f.x;
  const len = aisle.vertical ? f.h : f.w;
  const n = f.departments.length;
  return f.departments.map((dept, i) => {
    const p1 = Math.max(aisle.from, a1 + (len / n) * i);
    const p2 = Math.min(aisle.to, a1 + (len / n) * (i + 1));
    // Em pé anda-se da frente (y maior) para o fundo; deitado, da esquerda para a direita.
    const d1 = aisle.vertical ? aisle.to - p2 : p1 - aisle.from;
    const d2 = aisle.vertical ? aisle.to - p1 : p2 - aisle.from;
    return { dept, start: d1, end: d2 };
  }).filter((s) => s.end - s.start > 0.05).sort((a, b) => a.start - b.start);
}

const rowsFor = (type: string) => ({ gondola: 5, geladeira: 5, ponta: 4, balcao: 2, freezer: 2, ilha: 2, banca: 2 }[type] ?? 4);

/** Uma parede de prateleiras, desenhada chapada; o 3D é só a rotação do plano. */
const ShelfFace: React.FC<{
  f: Fixture | null; segs: Segment[]; length: number; k: number; report: DepartmentsReport | null; mirrored: boolean;
}> = ({ f, segs, length, k, report, mirrored }) => {
  const height = f ? HEIGHTS[f.type] ?? 1.8 : 2.6;
  if (!f) {
    return <div style={{ width: length * k, height: height * k, background: 'linear-gradient(#e4e9e3, #d3dbd3)' }} />;
  }
  const rows = rowsFor(f.type);
  const header = Math.min(0.24, height * 0.14);
  const rowH = (height - header - 0.12) / rows;
  const cold = f.type === 'geladeira' || f.type === 'freezer' || f.type === 'balcao';
  const facing = 0.32;
  const products = (dept: string) => report?.departments.find((d) => d.key === dept)?.topProducts ?? [];
  const ordered = mirrored ? [...segs].reverse().map((s) => ({ ...s, start: length - s.end, end: length - s.start })) : segs;

  return (
    <div style={{ position: 'relative', width: length * k, height: height * k, background: '#c8d0c9' }}>
      {ordered.map((s) => {
        const color = DEPT_BY_KEY[s.dept]?.color ?? '#94a3b8';
        const list = products(s.dept);
        const n = Math.max(1, Math.floor((s.end - s.start) / facing));
        return (
          <div key={s.dept + s.start} style={{
            position: 'absolute', left: s.start * k, width: (s.end - s.start) * k, top: 0, bottom: 0,
            display: 'flex', flexDirection: 'column', borderLeft: `${0.02 * k}px solid #9aa59c`, background: '#eef1ee',
          }}>
            <div style={{
              height: header * k, background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: header * k * 0.5, letterSpacing: 0.2, whiteSpace: 'nowrap', overflow: 'hidden',
            }}>
              {deptLabel(s.dept)}
            </div>
            {Array.from({ length: rows }).map((_, r) => (
              <div key={r} style={{
                height: rowH * k, display: 'flex', alignItems: 'flex-end', gap: 0.02 * k, padding: `0 ${0.02 * k}px`,
                borderBottom: `${0.035 * k}px solid ${cold ? '#94a3b8' : '#a3ada5'}`, background: cold ? '#e0f2fe' : '#f3f5f2',
              }}>
                {Array.from({ length: n }).map((__, i) => {
                  const p = list.length ? list[(i + r * 3) % list.length] : null;
                  const tone = mix(color, '#ffffff', 0.25 + ((i * 7 + r * 3) % 5) * 0.12);
                  const h = rowH * (0.62 + ((i * 5 + r) % 4) * 0.08);
                  return (
                    <div key={i} style={{
                      flex: 1, height: h * k, background: tone, borderRadius: 0.015 * k,
                      boxShadow: `inset 0 ${-0.02 * k}px 0 ${shade(tone, 0.85)}`,
                      color: '#1f2a24', fontSize: Math.max(4, 0.04 * k), lineHeight: 1.1, padding: 0.012 * k, overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
                    }}>
                      {p && i % 2 === 0 ? p.name : ''}
                    </div>
                  );
                })}
              </div>
            ))}
            {cold && <div style={{ position: 'absolute', inset: 0, top: header * k, background: 'linear-gradient(100deg, rgba(255,255,255,0.35), rgba(255,255,255,0.05) 40%, rgba(255,255,255,0.3))', pointerEvents: 'none' }} />}
          </div>
        );
      })}
    </div>
  );
};

interface Props {
  aisles: Aisle[];
  aisleId: string | null;
  onAisle: (id: string) => void;
  report: DepartmentsReport | null;
  className?: string;
}

const AisleWalk: React.FC<Props> = ({ aisles, aisleId, onAisle, report, className }) => {
  const aisle = aisles.find((a) => a.id === aisleId) ?? longestAisle(aisles);
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 440 });
  const [walk, setWalk] = useState(0);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setWalk(0); }, [aisle?.id]);

  const leftSegs = useMemo(() => (aisle ? segments(aisle.left, aisle) : []), [aisle]);
  const rightSegs = useMemo(() => (aisle ? segments(aisle.right, aisle) : []), [aisle]);

  if (!aisle) {
    return (
      <div className={`flex items-center justify-center p-6 text-center text-sm ${className ?? ''}`} style={{ background: 'var(--surface-soft)', color: 'var(--text-muted)' }}>
        Nenhum corredor com setor marcado ainda. Marque o que tem nas gôndolas no modo Montar e volte aqui.
      </div>
    );
  }

  const L = Math.max(1, aisle.length);
  const A = aisle.width;
  // Escala: a prateleira ocupa uns 3/4 da altura da tela no começo do corredor,
  // sem deixar o corredor mais largo que a tela.
  const k = Math.max(80, Math.min(size.h / 2.4, size.w / Math.max(A, 1.2)));
  const p = k * 1.6;
  const maxWalk = Math.max(0, L - 1);
  const pos = Math.min(walk, maxWalk);
  const hL = aisle.left ? HEIGHTS[aisle.left.type] ?? 1.8 : 2.6;
  const hR = aisle.right ? HEIGHTS[aisle.right.type] ?? 1.8 : 2.6;
  const step = (d: number) => setWalk((w) => Math.max(0, Math.min(maxWalk, w + d)));
  const idx = aisles.findIndex((a) => a.id === aisle.id);

  return (
    <div className={`flex flex-col ${className ?? ''}`}>
      <div
        ref={boxRef}
        tabIndex={0}
        role="img"
        aria-label={`${aisle.name}. À esquerda: ${aisle.left?.departments.map(deptLabel).join(', ') || 'parede'}. À direita: ${aisle.right?.departments.map(deptLabel).join(', ') || 'parede'}.`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); step(0.5); }
          if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); step(-0.5); }
        }}
        className={`relative min-h-0 flex-1 overflow-hidden ${FOCUS}`}
        style={{ perspective: `${p}px`, perspectiveOrigin: '50% 50%', background: 'linear-gradient(#f4f6f3 0%, #e8ece7 50%, #c9d1c8 50%, #dde3dc 100%)' }}
      >
        <div className="aisle-world" style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, transformStyle: 'preserve-3d', transform: `translateZ(${pos * k}px)` }}>
          {/* Piso */}
          <div style={{
            position: 'absolute', width: A * k, height: L * k, transformOrigin: '0 0',
            transform: `translate3d(${-A * k / 2}px, ${EYE * k}px, 0) rotateX(90deg)`,
            background: `repeating-linear-gradient(0deg, #e6eae4 0 ${0.6 * k - 2}px, #d5dbd3 ${0.6 * k - 2}px ${0.6 * k}px), #e6eae4`,
          }} />
          {/* Esquerda: plano virado para o corredor, indo para o fundo */}
          <div style={{ position: 'absolute', transformOrigin: '0 0', transform: `translate3d(${-A * k / 2}px, ${(EYE - hL) * k}px, 0) rotateY(90deg)` }}>
            <ShelfFace f={aisle.left} segs={leftSegs} length={L} k={k} report={report} mirrored={false} />
          </div>
          {/* Direita: começa no fundo e vem para perto */}
          <div style={{ position: 'absolute', transformOrigin: '0 0', transform: `translate3d(${A * k / 2}px, ${(EYE - hR) * k}px, ${-L * k}px) rotateY(-90deg)` }}>
            <ShelfFace f={aisle.right} segs={rightSegs} length={L} k={k} report={report} mirrored />
          </div>
          {/* Fim do corredor */}
          <div style={{
            position: 'absolute', width: A * k * 1.6, height: 2.6 * k, transform: `translate3d(${-A * k * 0.8}px, ${(EYE - 2.6) * k}px, ${-L * k - 0.6 * k}px)`,
            background: 'linear-gradient(#f4f6f3, #e3e8e2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#6b7a72', fontSize: 0.1 * k, fontWeight: 600,
          }}>
            {aisle.vertical ? 'Fundo da loja' : 'Fim do corredor'}
          </div>
        </div>

        <div className="pointer-events-none absolute left-3 top-3 max-w-[70%] rounded-lg px-2.5 py-1.5 text-xs font-medium" style={{ background: 'rgba(255,255,255,0.92)', color: 'var(--text-primary)' }}>
          {aisle.name}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t p-2 sm:p-3" style={{ borderColor: 'var(--border-soft)', background: 'var(--surface-base)' }}>
        <label htmlFor="aisle-pick" className="sr-only">Corredor</label>
        <select id="aisle-pick" value={aisle.id} onChange={(e) => onAisle(e.target.value)}
          className={`h-10 min-w-0 max-w-full flex-1 rounded-lg px-2 text-sm sm:max-w-[16rem] ${FOCUS}`}
          style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}>
          {aisles.map((a, i) => <option key={a.id} value={a.id}>{`${i + 1}. ${a.name}`}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} disabled={pos <= 0} aria-label="Voltar 1 metro"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-lg disabled:opacity-40 ${FOCUS}`} style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => step(1)} disabled={pos >= maxWalk}
            className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-40 ${FOCUS}`} style={{ background: 'var(--brand-700)' }}>
            <Footprints className="h-4 w-4" aria-hidden="true" /> Andar
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setWalk(0)} disabled={pos <= 0} aria-label="Voltar ao começo do corredor" title="Voltar ao começo"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-lg disabled:opacity-40 ${FOCUS}`} style={{ border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <input type="range" min={0} max={maxWalk} step={0.25} value={pos} onChange={(e) => setWalk(Number(e.target.value))}
          aria-label="Posição no corredor" className="h-10 min-w-[8rem] flex-1 accent-[var(--brand-700)]" />
        <span className="text-xs" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          {pos.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} de {L.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m
        </span>
        {aisles.length > 1 && (
          <span className="sr-only" aria-live="polite">{`Corredor ${idx + 1} de ${aisles.length}`}</span>
        )}
      </div>
    </div>
  );
};

export const describeSide = (f: Fixture | null) => (f ? `${fixtureName(f)}: ${f.departments.map(deptLabel).join(', ') || 'sem setor'}` : 'Parede');

export default AisleWalk;
