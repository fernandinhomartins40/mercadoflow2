import React, { useEffect, useState } from 'react';
import { Lock, PieChart, ShieldCheck } from 'lucide-react';
import IndustryLayout, { useIndustry } from './IndustryLayout';
import { Card, ExplainStrip, PageHero, PanelTitle } from '../../components/flow/Flow';
import { dateBr, errorText, industryService, type CategoryPlace } from '../../services/industry.service';

const Category: React.FC = () => {
  const { me } = useIndustry();
  const allowed = me?.contract?.features.includes('CATEGORIA');
  const [places, setPlaces] = useState<CategoryPlace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    industryService.category().then((r) => setPlaces(r.places)).catch((e) => setError(errorText(e)));
  }, [allowed]);

  if (!allowed) {
    return (
      <>
        <PageHero title={<>Sua parte na <mark>categoria.</mark></>} subtitle="Quanto dos produtos da categoria vendidos numa cidade são seus." />
        <Card><PanelTitle icon={Lock} title="Faz parte do pacote Nacional" sub="Fale com o MercadoFlow para incluir a participação na categoria no seu contrato." /></Card>
      </>
    );
  }

  const top = places?.filter((p) => p.level === 'UF').sort((a, b) => b.sharePercent - a.sharePercent)[0];
  return (
    <>
      <PageHero
        title={top ? <>Você tem <mark>{top.sharePercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% de {top.category.toLowerCase()}</mark> em {top.uf}.</> : <>Sua parte na <mark>categoria.</mark></>}
        subtitle={places?.[0] ? `Última semana fechada: ${dateBr(places[0].week_start)}. Só a sua parte aparece; nenhum concorrente é nomeado.` : undefined} />
      {error && <Card role="alert">{error}</Card>}
      {!places && !error && <p className="fx-muted">Carregando…</p>}
      {places && places.length === 0 && (
        <Card><PanelTitle icon={PieChart} title="Nada publicado ainda" sub="A participação só aparece quando a categoria tem marcas suficientes na cidade e nenhuma marca domina sozinha." /></Card>
      )}
      {places && places.length > 0 && (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {places.map((p) => (
            <Card key={`${p.category}-${p.uf}-${p.city}`}>
              <PanelTitle icon={PieChart} title={p.category} sub={p.level === 'UF' ? `Estado: ${p.uf}` : `${p.city} (${p.uf})`} />
              <p style={{ margin: '14px 0 6px', fontSize: 30, fontWeight: 800 }}>{p.sharePercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</p>
              <span aria-hidden="true" style={{ display: 'block', height: 8, borderRadius: 6, background: 'var(--fx-line)' }}>
                <span style={{ display: 'block', height: 8, borderRadius: 6, width: `${Math.min(100, p.sharePercent)}%`, background: 'var(--fx-green)' }} />
              </span>
              <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.8 }}>
                {p.products.slice(0, 5).map((x) => <li key={x.gtin}>{x.name}: {Number(x.sharePercent).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</li>)}
              </ul>
            </Card>
          ))}
        </div>
      )}
      <ExplainStrip items={[
        { icon: ShieldCheck, title: 'Concorrente sem nome', text: 'Mostramos só a sua parte do total, nunca a de outra marca.' },
        { icon: PieChart, title: 'Só com mercado disputado', text: 'A participação aparece quando a categoria tem várias marcas e nenhuma domina sozinha.' },
      ]} />
    </>
  );
};

const IndustryCategory: React.FC = () => <IndustryLayout><Category /></IndustryLayout>;
export default IndustryCategory;
