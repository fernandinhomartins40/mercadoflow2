import React, { useEffect, useState } from 'react';
import type { ThemeStyle } from '../../types/art.types';
import { ensureStyleFonts } from './assets';
import { FONTS, LOOKS, applyLook, fontOption, fontStack, resolveStyle } from './style';

/**
 * Estilo do tema no criador (superadmin): fontes, etiqueta de preço, cartão,
 * nome do produto e rodapé. Cada mudança vai para a prévia na hora e é salva
 * sozinha pela tela de temas.
 */

type Group = keyof ThemeStyle;
type Tab = 'layout' | 'fonts' | 'tag' | 'card' | 'name' | 'footer';
const TABS: Array<[Tab, string]> = [['layout', 'Layout'], ['fonts', 'Fontes'], ['tag', 'Preço'], ['card', 'Cartão'], ['name', 'Nome'], ['footer', 'Rodapé']];

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="flex items-center justify-between gap-3 text-sm text-slate-700"><span className="shrink-0">{label}</span>{children}</label>
);

const Choice = <T extends string | number | null>({ value, options, onChange, label }: {
  value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string;
}) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
    {options.map(([v, text]) => (
      <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
        className={`rounded-md border px-2 py-1 text-xs font-medium transition ${value === v ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
        {text}
      </button>
    ))}
  </div>
);

const Range: React.FC<{ value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; suffix?: string; scale?: number }> = ({
  value, min, max, step = 1, onChange, label, suffix = '%', scale = 100,
}) => (
  <Row label={`${label} ${Math.round(value * scale)}${suffix}`}>
    <input type="range" min={min} max={max} step={step} value={Math.round(value * scale)} aria-label={label}
      onChange={(e) => onChange(Number(e.target.value) / scale)} className="w-36 accent-green-600" />
  </Row>
);

const ColorOrNone: React.FC<{ value: string | null; fallback: string; onChange: (v: string | null) => void; label: string; noneLabel: string }> = ({
  value, fallback, onChange, label, noneLabel,
}) => (
  <Row label={label}>
    <span className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-xs text-slate-500">
        <input type="checkbox" checked={value === null} onChange={(e) => onChange(e.target.checked ? null : fallback)} className="h-3.5 w-3.5 accent-green-600" />
        {noneLabel}
      </label>
      {value !== null && <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="h-7 w-9 cursor-pointer rounded border border-slate-300 bg-white p-0.5" />}
    </span>
  </Row>
);

const WEIGHTS: Array<[number, string]> = [[400, 'Normal'], [500, 'Médio'], [600, 'Semi'], [700, 'Negrito'], [800, 'Extra'], [900, 'Black']];
const CASES: Array<['upper' | 'title' | 'none', string]> = [['upper', 'MAIÚSCULAS'], ['title', 'Primeira Maiúscula'], ['none', 'Como digitado']];

const StyleEditor: React.FC<{ style: ThemeStyle; onChange: (next: ThemeStyle) => void }> = ({ style, onChange }) => {
  const [tab, setTab] = useState<Tab>('layout');
  const st = resolveStyle(style);
  useEffect(() => { if (tab === 'fonts') void ensureStyleFonts(FONTS); }, [tab]);

  // Guarda só o que foi mexido; o resto segue o padrão.
  const set = <G extends Group>(group: G, patch: NonNullable<ThemeStyle[G]>) =>
    onChange({ ...style, [group]: { ...(style[group] ?? {}), ...patch } });
  const reset = (group: Group) => { const next = { ...style }; delete next[group]; onChange(next); };

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Partes do encarte" className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" type="button" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`rounded-md px-2.5 py-1 text-sm font-medium transition ${tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'layout' && (
        <div className="flex flex-col gap-2.5">
          <span className="text-sm font-medium text-slate-800">Visuais prontos</span>
          <div className="grid grid-cols-2 gap-1.5">
            {LOOKS.map((look) => (
              <button key={look.key} type="button" onClick={() => onChange(applyLook(style, look.key))} title={look.hint}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-left transition hover:border-green-500 hover:bg-green-50">
                <span className="block text-sm font-medium text-slate-900">{look.label}</span>
                <span className="block text-[11px] leading-tight text-slate-500">{look.hint}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">O visual pronto troca a grade, o cartão, a etiqueta e o selo de desconto. Depois ajuste o que quiser.</p>
          <span className="text-sm text-slate-700">Grade dos produtos</span>
          <Choice label="Grade dos produtos" value={st.grid.layout} onChange={(v) => set('grid', { layout: v })}
            options={[['auto', 'Automática'], ['uniform', 'Todos iguais'], ['hero', '1º em destaque'], ['list', 'Lista'], ['mosaic', 'Mosaico']]} />
          <Range label="Espaço entre cartões" value={st.grid.gap} min={30} max={250} step={10} onChange={(v) => set('grid', { gap: v })} />
          <span className="text-sm text-slate-700">Montagem do cartão</span>
          <Choice label="Montagem do cartão" value={st.card.layout} onChange={(v) => set('card', { layout: v })}
            options={[['auto', 'Automática'], ['classic', 'Foto em cima'], ['name-top', 'Nome em cima'], ['price-top', 'Preço em cima'], ['side', 'Lado a lado'], ['photo', 'Foto grande']]} />
          <span className="text-sm text-slate-700">Fundo da foto</span>
          <Choice label="Fundo da foto" value={st.card.photoBg} onChange={(v) => set('card', { photoBg: v })}
            options={[['none', 'Nenhum'], ['circle', 'Círculo'], ['blob', 'Mancha'], ['rays', 'Raios']]} />
          <Row label="Sombra do produto no chão"><input type="checkbox" checked={st.card.photoShadow} onChange={(e) => set('card', { photoShadow: e.target.checked })} className="h-4 w-4 accent-green-600" /></Row>
          <span className="text-sm text-slate-700">Variação entre cartões</span>
          <Choice label="Variação entre cartões" value={st.card.vary} onChange={(v) => set('card', { vary: v })}
            options={[['none', 'Nenhuma'], ['tilt', 'Inclinar alternado'], ['alternate', 'Cores alternadas']]} />
          <Row label="Selo de desconto (-20%)"><input type="checkbox" checked={st.badge.show} onChange={(e) => set('badge', { show: e.target.checked })} className="h-4 w-4 accent-green-600" /></Row>
          {st.badge.show && (
            <>
              <Choice label="Formato do selo de desconto" value={st.badge.shape} onChange={(v) => set('badge', { shape: v })}
                options={[['circle', 'Círculo'], ['burst', 'Explosão'], ['tag', 'Etiqueta']]} />
              <Choice label="Canto do selo de desconto" value={st.badge.position} onChange={(v) => set('badge', { position: v })}
                options={[['left', 'Canto esquerdo'], ['right', 'Canto direito']]} />
              <p className="text-xs text-slate-500">Aparece só nos produtos com preço antigo. A cor é a da faixa de destaque.</p>
            </>
          )}
          <button type="button" onClick={() => onChange((({ grid: _g, badge: _b, ...rest }) => rest)(style))} className="self-start text-xs font-medium text-slate-500 hover:underline">Voltar ao padrão</button>
        </div>
      )}

      {tab === 'fonts' && (
        <div className="flex flex-col gap-3">
          {([['price', 'Preço', '59,90'], ['name', 'Nome do produto', 'PICANHA BOVINA'], ['text', 'Rodapé', 'Rua das Flores, 120 · (11) 98888-7777']] as const).map(([key, label, sample]) => {
            const current = st.fonts[key];
            return (
              <div key={key} className="flex flex-col gap-1">
                <Row label={label}>
                  <select value={current.key} onChange={(e) => set('fonts', { [key]: e.target.value })} aria-label={`Fonte do ${label.toLowerCase()}`}
                    className="h-8 w-44 rounded-md border border-slate-300 bg-white px-2 text-sm">
                    {(['impacto', 'condensada', 'texto', 'divertida'] as const).map((kind) => (
                      <optgroup key={kind} label={kind[0].toUpperCase() + kind.slice(1)}>
                        {FONTS.filter((f) => f.kind === kind).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </Row>
                <span className="truncate rounded-md bg-slate-50 px-2 py-1 text-lg text-slate-900" style={{ fontFamily: fontStack(fontOption(current.key, current.key)) }}>{sample}</span>
              </div>
            );
          })}
          <button type="button" onClick={() => reset('fonts')} className="self-start text-xs font-medium text-slate-500 hover:underline">Voltar às fontes padrão</button>
        </div>
      )}

      {tab === 'tag' && (
        <div className="flex flex-col gap-2.5">
          <span className="text-sm text-slate-700">Formato</span>
          <Choice label="Formato da etiqueta" value={st.tag.shape} onChange={(v) => set('tag', { shape: v })}
            options={[['rounded', 'Arredondada'], ['pill', 'Pílula'], ['square', 'Reta'], ['burst', 'Explosão'], ['ribbon', 'Faixa'], ['circle', 'Círculo'], ['hang', 'Pendurada']]} />
          <Row label="Degradê (brilho em cima)"><input type="checkbox" checked={st.tag.gradient} onChange={(e) => set('tag', { gradient: e.target.checked })} className="h-4 w-4 accent-green-600" /></Row>
          <span className="text-sm text-slate-700">Posição no cartão</span>
          <Choice label="Posição da etiqueta" value={st.tag.align} onChange={(v) => set('tag', { align: v })}
            options={[['auto', 'Automática'], ['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']]} />
          <Range label="Inclinação" value={st.tag.tilt} min={-15} max={15} scale={1} suffix="°" onChange={(v) => set('tag', { tilt: v })} />
          <Range label="Tamanho" value={st.tag.size} min={50} max={100} onChange={(v) => set('tag', { size: v })} />
          <span className="text-sm text-slate-700">Centavos</span>
          <Choice label="Centavos" value={st.tag.cents} onChange={(v) => set('tag', { cents: v })} options={[['super', 'No alto (,⁹⁰)'], ['inline', 'Na linha (,90)']]} />
          <Row label="Mostrar R$"><input type="checkbox" checked={st.tag.currency} onChange={(e) => set('tag', { currency: e.target.checked })} className="h-4 w-4 accent-green-600" /></Row>
          <Row label="Sombra"><input type="checkbox" checked={st.tag.shadow} onChange={(e) => set('tag', { shadow: e.target.checked })} className="h-4 w-4 accent-green-600" /></Row>
          <ColorOrNone label="Borda" noneLabel="Sem borda" value={st.tag.border} fallback="#ffffff" onChange={(v) => set('tag', { border: v })} />
          {st.tag.border && <Range label="Espessura da borda" value={st.tag.borderWidth} min={1} max={15} onChange={(v) => set('tag', { borderWidth: v })} />}
          <Row label="Mostrar preço antigo (De R$…)"><input type="checkbox" checked={st.oldPrice.show} onChange={(e) => set('oldPrice', { show: e.target.checked })} className="h-4 w-4 accent-green-600" /></Row>
          <p className="text-xs text-slate-500">As cores da etiqueta ficam em &quot;Cores da etiqueta&quot;.</p>
          <button type="button" onClick={() => { reset('tag'); }} className="self-start text-xs font-medium text-slate-500 hover:underline">Voltar ao padrão</button>
        </div>
      )}

      {tab === 'card' && (
        <div className="flex flex-col gap-2.5">
          <span className="text-sm text-slate-700">Cartão do produto</span>
          <Choice label="Estilo do cartão" value={st.card.style} onChange={(v) => set('card', { style: v })}
            options={[['solid', 'Cheio'], ['outline', 'Só contorno'], ['none', 'Sem cartão']]} />
          <span className="text-sm text-slate-700">Formato</span>
          <Choice label="Formato do cartão" value={st.card.shape} onChange={(v) => set('card', { shape: v })}
            options={[['rect', 'Retângulo'], ['ticket', 'Cupom com picote'], ['cut', 'Cantos cortados'], ['arch', 'Arco']]} />
          {st.card.style === 'solid' && (
            <>
              <span className="text-sm text-slate-700">Preenchimento</span>
              <Choice label="Preenchimento do cartão" value={st.card.fill} onChange={(v) => set('card', { fill: v })}
                options={[['flat', 'Cor lisa'], ['gradient', 'Degradê'], ['glass', 'Vidro fosco']]} />
            </>
          )}
          <Range label="Cantos arredondados" value={st.card.radius} min={0} max={30} onChange={(v) => set('card', { radius: v })} />
          {st.card.style === 'solid' && <Range label="Opacidade" value={st.card.opacity} min={10} max={100} onChange={(v) => set('card', { opacity: v })} />}
          {st.card.style === 'solid' && <Row label="Sombra"><input type="checkbox" checked={st.card.shadow} onChange={(e) => set('card', { shadow: e.target.checked })} className="h-4 w-4 accent-green-600" /></Row>}
          <ColorOrNone label="Borda" noneLabel={st.card.style === 'outline' ? 'Cor do cartão' : 'Sem borda'} value={st.card.border} fallback="#e3161f" onChange={(v) => set('card', { border: v })} />
          {(st.card.border || st.card.style === 'outline') && <Range label="Espessura da borda" value={st.card.borderWidth} min={0} max={6} step={0.2} onChange={(v) => set('card', { borderWidth: v })} />}
          <button type="button" onClick={() => reset('card')} className="self-start text-xs font-medium text-slate-500 hover:underline">Voltar ao padrão</button>
        </div>
      )}

      {tab === 'name' && (
        <div className="flex flex-col gap-2.5">
          <span className="text-sm text-slate-700">Letras</span>
          <Choice label="Maiúsculas" value={st.name.case} onChange={(v) => set('name', { case: v })} options={CASES} />
          <span className="text-sm text-slate-700">Peso</span>
          <Choice label="Peso da fonte do nome" value={st.name.weight} onChange={(v) => set('name', { weight: v })} options={WEIGHTS} />
          <span className="text-sm text-slate-700">Quebra de linha (máximo de linhas)</span>
          <Choice label="Máximo de linhas" value={st.name.maxLines} onChange={(v) => set('name', { maxLines: v })}
            options={[[null, 'Automático'], [1, '1'], [2, '2'], [3, '3'], [4, '4']]} />
          <span className="text-sm text-slate-700">Alinhamento</span>
          <Choice label="Alinhamento do nome" value={st.name.align} onChange={(v) => set('name', { align: v })}
            options={[['auto', 'Automático'], ['left', 'Esquerda'], ['center', 'Centro']]} />
          <Range label="Tamanho" value={st.name.size} min={60} max={140} onChange={(v) => set('name', { size: v })} />
          <ColorOrNone label="Cor do nome" noneLabel="Automática" value={st.name.color} fallback="#1c1917" onChange={(v) => set('name', { color: v })} />
          <ColorOrNone label="Contorno das letras" noneLabel="Sem contorno" value={st.name.stroke} fallback="#ffffff" onChange={(v) => set('name', { stroke: v })} />
          <button type="button" onClick={() => reset('name')} className="self-start text-xs font-medium text-slate-500 hover:underline">Voltar ao padrão</button>
        </div>
      )}

      {tab === 'footer' && (
        <div className="flex flex-col gap-2.5">
          <ColorOrNone label="Cor do texto" noneLabel="Automática" value={st.footer.color} fallback="#ffffff" onChange={(v) => set('footer', { color: v })} />
          <ColorOrNone label="Faixa atrás do texto" noneLabel="Sem faixa" value={st.footer.band} fallback="#1c1917" onChange={(v) => set('footer', { band: v })} />
          {st.footer.band && <Range label="Opacidade da faixa" value={st.footer.bandOpacity} min={10} max={100} onChange={(v) => set('footer', { bandOpacity: v })} />}
          <span className="text-sm text-slate-700">Alinhamento</span>
          <Choice label="Alinhamento do rodapé" value={st.footer.align} onChange={(v) => set('footer', { align: v })}
            options={[['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']]} />
          <span className="text-sm text-slate-700">Letras</span>
          <Choice label="Maiúsculas no rodapé" value={st.footer.case} onChange={(v) => set('footer', { case: v })} options={CASES} />
          <span className="text-sm text-slate-700">Peso da primeira linha</span>
          <Choice label="Peso do rodapé" value={st.footer.weight} onChange={(v) => set('footer', { weight: v })} options={WEIGHTS} />
          <Range label="Tamanho" value={st.footer.size} min={50} max={140} onChange={(v) => set('footer', { size: v })} />
          {!st.footer.band && <Row label="Sombra para ler sobre o fundo"><input type="checkbox" checked={st.footer.shadow} onChange={(e) => set('footer', { shadow: e.target.checked })} className="h-4 w-4 accent-green-600" /></Row>}
          <button type="button" onClick={() => reset('footer')} className="self-start text-xs font-medium text-slate-500 hover:underline">Voltar ao padrão</button>
        </div>
      )}

      {JSON.stringify(style) !== '{}' && (
        <button type="button" onClick={() => onChange({})} className="self-start text-xs font-medium text-red-700 hover:underline">
          Voltar tudo ao visual padrão
        </button>
      )}
    </div>
  );
};

export default StyleEditor;
