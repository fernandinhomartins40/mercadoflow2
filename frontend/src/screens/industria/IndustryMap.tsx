import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building, Building2, Map as MapIcon, MapPin, Package, TrendingUp } from 'lucide-react';
import IndustryLayout, { ANON_EXPLAIN, useIndustry } from './IndustryLayout';
import { ActionHub, Card, ExplainStrip, Forest, PageHero, PanelTitle, PillTabs, brl } from '../../components/flow/Flow';
import { errorText, industryService, num, pct, type MapResult, type Place, type PortfolioItem } from '../../services/industry.service';

type Level = 'UF' | 'CIDADE' | 'BAIRRO';
const placeName = (p: Place, level: Level) =>
  level === 'UF' ? p.uf : level === 'CIDADE' ? `${p.city} (${p.uf})` : `${p.neighborhood}, ${p.city}`;

const MapPage: React.FC = () => {
  const { me } = useIndustry();
  const [params, setParams] = useSearchParams();
  const [level, setLevel] = useState<Level>((params.get('level') as Level) || 'CIDADE');
  const [days, setDays] = useState(Number(params.get('days')) || 28);
  const [gtin, setGtin] = useState(params.get('gtin') ?? '');
  const [products, setProducts] = useState<PortfolioItem[]>([]);
  const [data, setData] = useState<MapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => { industryService.portfolio().then((p) => setProducts(p.filter((x) => x.status === 'APROVADO'))).catch(() => {}); }, []);
  useEffect(() => {
    setData(null);
    setError(null);
    setParams({ level, days: String(days), ...(gtin ? { gtin } : {}) }, { replace: true });
    industryService.map({ level, days, gtin: gtin || undefined })
      .then((r) => { setData(r); setSelected(r.places[0] ? key(r.places[0]) : null); })
      .catch((e) => setError(errorText(e, 'Não foi possível carregar o mapa.')));
  }, [level, days, gtin]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = (p: Place) => `${p.uf}|${p.city_code}|${p.neighborhood ?? ''}`;
  const place = data?.places.find((p) => key(p) === selected) ?? null;
  const total = useMemo(() => (data?.places ?? []).reduce((s, p) => s + Number(p.units), 0), [data]);
  const product = products.find((p) => p.gtin === gtin);
  const neighborhoodBlocked = me?.contract && !me.contract.allow_neighborhood;

  return (
    <>
      <PageHero
        title={data && data.places[0]
          ? <>{product ? product.product_name : 'Seus produtos'} vendem mais em <mark>{placeName(data.places[0], level)}.</mark></>
          : <>Onde seus produtos <mark>vendem.</mark></>}
        subtitle={`${level === 'UF' ? 'Estados' : level === 'CIDADE' ? 'Cidades' : 'Bairros'} com dados publicados nos últimos ${days} dias, comparados com os ${days} dias anteriores.`}
        side={<ActionHub icon={MapIcon} actions={[{ label: 'Voltar ao resumo', icon: TrendingUp, to: '/industria' }, { label: 'Produtos', icon: Package, to: '/industria/produtos' }]} />} />

      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
          <PillTabs<Level> label="Nível do mapa" value={level} onChange={setLevel} tabs={[
            { key: 'UF', label: 'Estados', icon: MapIcon },
            { key: 'CIDADE', label: 'Cidades', icon: Building2 },
            ...(neighborhoodBlocked ? [] : [{ key: 'BAIRRO' as Level, label: 'Bairros', icon: MapPin }]),
          ]} />
          <label className="fx-field" style={{ minWidth: 220 }}>
            Produto
            <select value={gtin} onChange={(e) => setGtin(e.target.value)}>
              <option value="">Todos os seus produtos</option>
              {products.map((p) => <option key={p.gtin} value={p.gtin}>{p.product_name ?? p.gtin}</option>)}
            </select>
          </label>
          <label className="fx-field">
            Período
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Últimos 7 dias</option>
              <option value={28}>Últimos 28 dias</option>
              <option value={90}>Últimos 90 dias</option>
              <option value={365}>Últimos 12 meses</option>
            </select>
          </label>
        </div>
      </Card>

      {error && <Card role="alert">{error}</Card>}
      {!data && !error && <p className="fx-muted">Carregando o mapa…</p>}
      {data && data.places.length === 0 && (
        <Card><PanelTitle icon={MapPin} title="Nada publicado neste recorte" sub="Quando poucas lojas vendem o produto num lugar, o número fica escondido para não revelar qual mercado vendeu. Tente um nível maior ou um período mais longo." /></Card>
      )}
      {data && data.places.length > 0 && (
        <div className="fx-split">
          <Card aria-label="Lugares">
            <PanelTitle icon={level === 'UF' ? MapIcon : level === 'CIDADE' ? Building2 : MapPin} title={`${data.places.length} ${data.places.length === 1 ? (level === 'UF' ? 'estado' : level === 'CIDADE' ? 'cidade' : 'bairro') : (level === 'UF' ? 'estados' : level === 'CIDADE' ? 'cidades' : 'bairros')}`}
              sub={`${num(total)} unidades no período`} />
            <ul className="fx-stack" style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, gap: 8 }}>
              {data.places.map((p) => {
                const share = total > 0 ? (Number(p.units) / total) * 100 : 0;
                return (
                  <li key={key(p)}>
                    <button type="button" className={`fx-row ${key(p) === selected ? 'selected' : ''}`} aria-current={key(p) === selected || undefined}
                      onClick={() => { setSelected(key(p)); if (window.innerWidth < 1100) requestAnimationFrame(() => document.getElementById('lugar')?.scrollIntoView({ behavior: 'smooth' })); }}>
                      <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                        <b style={{ display: 'block', fontSize: 15 }}>{placeName(p, level)}</b>
                        <span aria-hidden="true" style={{ display: 'block', height: 6, borderRadius: 4, background: 'var(--fx-line)', marginTop: 6 }}>
                          <span style={{ display: 'block', height: 6, borderRadius: 4, width: `${Math.max(2, share)}%`, background: 'var(--fx-green)' }} />
                        </span>
                      </span>
                      <span style={{ textAlign: 'right' }}>
                        <b className="fx-num" style={{ display: 'block' }}>{num(p.units)} un.</b>
                        {p.growthPercent != null && <span className={`fx-chip ${p.growthPercent >= 0 ? 'green' : 'red'}`} style={{ fontSize: 12, padding: '1px 8px' }}>{pct(p.growthPercent)}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
          <div id="lugar" style={{ minWidth: 0, scrollMarginTop: 80 }}>
            {place && (
              <Forest as="aside" aria-label="Lugar aberto">
                <PanelTitle icon={MapPin} title={placeName(place, level)} sub={`Últimos ${days} dias${product ? ` · ${product.product_name}` : ''}`} />
                <div className="fx-kpis" style={{ marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                  <div className="fx-kpi"><span>Unidades</span><b style={{ fontSize: 22 }}>{num(place.units)}</b>{place.growthPercent != null && <small>{pct(place.growthPercent)} sobre o período anterior</small>}</div>
                  <div className="fx-kpi"><span>Faturamento</span><b style={{ fontSize: 22 }}>{brl(place.revenue)}</b></div>
                  {place.distributionPercent != null && <div className="fx-kpi"><span>Distribuição</span><b style={{ fontSize: 22 }}>{place.distributionPercent}%</b><small>das lojas da região vendem, em média por dia</small></div>}
                </div>
                <div className="fx-white" style={{ marginTop: 14 }}>
                  <h3>Preço praticado</h3>
                  {place.avgPrice != null
                    ? <p style={{ margin: '8px 0 0' }}>Médio de <b>{brl(place.avgPrice)}</b>{place.min_price !== place.max_price ? `, entre ${brl(place.min_price)} e ${brl(place.max_price)}` : ''}.</p>
                    : <p className="fx-muted" style={{ margin: '8px 0 0' }}>O preço praticado faz parte de outro pacote.</p>}
                  {place.promoSharePercent != null && <p style={{ margin: '8px 0 0' }}>{Number(place.promoSharePercent).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% das unidades saíram com desconto.</p>}
                  <p className="fx-muted" style={{ margin: '8px 0 0', fontSize: 13 }}>Publicado em {place.days_published} dos {days} dias; dias com poucas lojas ficam fora da soma.</p>
                </div>
                {level !== 'BAIRRO' && !neighborhoodBlocked && (
                  <div style={{ marginTop: 20 }}>
                    <ActionHub icon={Building} onForest label="Aprofundar" actions={[
                      { label: level === 'UF' ? 'Ver as cidades' : 'Ver os bairros', icon: MapPin, onClick: () => setLevel(level === 'UF' ? 'CIDADE' : 'BAIRRO') },
                    ]} />
                  </div>
                )}
              </Forest>
            )}
          </div>
        </div>
      )}
      <ExplainStrip items={ANON_EXPLAIN} />
    </>
  );
};

const IndustryMap: React.FC = () => <IndustryLayout><MapPage /></IndustryLayout>;
export default IndustryMap;
