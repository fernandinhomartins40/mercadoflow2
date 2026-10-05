import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Clock, Download, Map as MapIcon, Package, TrendingUp } from 'lucide-react';
import IndustryLayout, { ANON_EXPLAIN, Bars, useIndustry } from './IndustryLayout';
import { ActionHub, Card, ExplainStrip, Forest, PageHero, PanelTitle, Thumb, brl } from '../../components/flow/Flow';
import { errorText, industryService, num, pct, dateBr, type Overview, type ProductDetail } from '../../services/industry.service';

const Home: React.FC = () => {
  const { me } = useIndustry();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gtin, setGtin] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [hours, setHours] = useState<{ hour: string; units: number }[] | null>(null);

  useEffect(() => {
    industryService.overview().then((o) => {
      setData(o);
      setGtin(o.products[0]?.gtin ?? null);
      if (o.features.includes('HORA')) industryService.hourly().then((h) => setHours(h.hours)).catch(() => setHours([]));
    }).catch((e) => setError(errorText(e, 'Não foi possível carregar o resumo.')));
  }, []);

  useEffect(() => {
    if (!gtin) return;
    setDetail(null);
    industryService.product(gtin, { days: 28 }).then(setDetail).catch(() => setDetail(null));
  }, [gtin]);

  if (error) return <Card role="alert">{error}</Card>;
  if (!data) return <p className="fx-muted">Carregando o resumo…</p>;

  const g = data.weekGrowthPercent;
  const selected = data.products.find((p) => p.gtin === gtin);
  const exportable = data.features.includes('EXPORTACAO');

  return (
    <>
      <PageHero
        title={<>Seus produtos venderam <mark>{num(data.week.units)} unidades</mark> nos últimos 7 dias{g != null ? `, ${pct(g)} sobre a semana anterior.` : '.'}</>}
        subtitle={<>Faturamento de {brl(data.week.revenue)} em {data.cities} {data.cities === 1 ? 'cidade' : 'cidades'} com dados publicados.
          {data.last24h ? ` Nas últimas 24 horas: ${num(data.last24h.units)} unidades.` : ''}</>}
        side={<ActionHub icon={TrendingUp} actions={[
          { label: 'Ver no mapa', icon: MapIcon, to: '/industria/mapa' },
          { label: 'Todos os produtos', icon: Package, to: '/industria/produtos' },
          ...(exportable ? [{ label: 'Exportar 30 dias', icon: Download, href: industryService.exportUrl('CIDADE', 30) }] : []),
        ]} />} />

      {data.products.length === 0 ? (
        <Card>
          <PanelTitle icon={Package} title="Ainda sem venda publicada" sub="Os produtos aprovados aparecem aqui assim que houver lojas suficientes vendendo na área do contrato." />
        </Card>
      ) : (
        <div className="fx-split">
          <Card aria-label="Seus produtos">
            <PanelTitle icon={Package} title="Seus produtos" sub="Últimos 7 dias, do que mais vende ao que menos vende" />
            <ul className="fx-stack" style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, gap: 8 }}>
              {data.products.map((p) => (
                <li key={p.gtin}>
                  <button type="button" className={`fx-row ${p.gtin === gtin ? 'selected' : ''}`} aria-current={p.gtin === gtin || undefined}
                    onClick={() => { setGtin(p.gtin); if (window.innerWidth < 1100) requestAnimationFrame(() => document.getElementById('produto')?.scrollIntoView({ behavior: 'smooth' })); }}>
                    <Thumb name={p.name ?? p.gtin} size={44} />
                    <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                      <b style={{ display: 'block', fontSize: 15 }}>{p.name ?? p.gtin}</b>
                      <span className="fx-muted" style={{ fontSize: 13 }}>{p.gtin}</span>
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      <b className="fx-num" style={{ display: 'block' }}>{num(p.units)} un.</b>
                      {p.growthPercent != null && <span className={`fx-chip ${p.growthPercent >= 0 ? 'green' : 'red'}`} style={{ fontSize: 12, padding: '1px 8px' }}>{pct(p.growthPercent)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <div id="produto" style={{ minWidth: 0, scrollMarginTop: 80 }}>
            <Forest as="aside" aria-label="Produto aberto">
              <PanelTitle icon={Package} title={selected?.name ?? gtin ?? ''} sub={`GTIN ${gtin ?? ''}`} />
              <div className="fx-kpis" style={{ marginTop: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                <div className="fx-kpi"><span>Unidades em 7 dias</span><b style={{ fontSize: 22 }}>{num(selected?.units)}</b>
                  {selected?.growthPercent != null && <small>{pct(selected.growthPercent)} sobre a semana anterior</small>}</div>
                <div className="fx-kpi"><span>Faturamento em 7 dias</span><b style={{ fontSize: 22 }}>{brl(selected?.revenue)}</b></div>
              </div>
              <div className="fx-white" style={{ marginTop: 14, color: 'var(--fx-green)' }}>
                <h3 style={{ marginBottom: 10 }}>Unidades por dia, últimos 28 dias</h3>
                {detail ? <Bars label="Unidades vendidas por dia" points={detail.series.map((s) => ({ label: dateBr(s.period), value: Number(s.units) }))} />
                  : <p className="fx-muted">Carregando…</p>}
              </div>
              {detail && detail.cities.length > 0 && (
                <div className="fx-white" style={{ marginTop: 14 }}>
                  <h3>Onde mais vendeu nos últimos 28 dias</h3>
                  <ol style={{ margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.9 }}>
                    {detail.cities.slice(0, 5).map((c) => (
                      <li key={c.city_code}>{c.city} ({c.uf}): <b>{num(c.units)} un.</b>
                        {c.min_price != null && <span className="fx-muted"> · {c.min_price === c.max_price ? brl(c.min_price) : `de ${brl(c.min_price)} a ${brl(c.max_price)}`}</span>}</li>
                    ))}
                  </ol>
                </div>
              )}
              <div style={{ marginTop: 20 }}>
                <ActionHub icon={Package} onForest label="O que fazer com este produto" actions={[
                  { label: 'Ver o histórico completo', icon: TrendingUp, to: `/industria/produtos?gtin=${gtin}` },
                  { label: 'Ver no mapa', icon: MapIcon, to: `/industria/mapa?gtin=${gtin}` },
                ]} />
              </div>
            </Forest>
          </div>
        </div>
      )}

      <div className="fx-split" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <Card>
          <PanelTitle icon={ArrowUpRight} title="Onde subiu" sub="Cidades com mais venda que na semana anterior" />
          <CityList rows={data.citiesUp} empty="Nenhuma cidade subiu nesta semana." />
        </Card>
        <Card>
          <PanelTitle icon={ArrowDownRight} title="Onde caiu" sub="Cidades com menos venda que na semana anterior" />
          <CityList rows={data.citiesDown} empty="Nenhuma cidade caiu nesta semana." />
        </Card>
      </div>

      {data.alerts && (
        <Card>
          <PanelTitle icon={AlertTriangle} title="Possível ruptura" sub="Lojas que vendiam o produto nas 4 semanas anteriores e não venderam na última semana fechada" />
          {data.alerts.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nenhum sinal de ruptura na última semana fechada.</p> : (
            <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 8 }}>
              {data.alerts.map((a) => (
                <li key={`${a.gtin}-${a.city}`} className="fx-row" style={{ cursor: 'default' }}>
                  <span className="fx-icon-tile" style={{ width: 40, height: 40, background: '#FDECEC', color: 'var(--fx-red)' }}><AlertTriangle size={18} aria-hidden="true" /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ display: 'block' }}>{a.name ?? a.gtin}</b>
                    <span className="fx-muted" style={{ fontSize: 13 }}>{a.city} ({a.uf}) · semana de {dateBr(a.week_start)}</span>
                  </span>
                  <span style={{ textAlign: 'right' }}><b>{a.stores_stopped} de {a.stores_before}</b><br /><small className="fx-muted">lojas pararam</small></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {hours && (
        <Card>
          <PanelTitle icon={Clock} title="Venda por hora" sub={`Últimas 48 horas. Os dados chegam com até ${Math.round(data.publishDelayMinutes / 60)} h de atraso, para proteger o anonimato.`} />
          <div style={{ marginTop: 14, color: 'var(--fx-green)' }}>
            <Bars label="Unidades por hora" height={120} points={hours.map((h) => ({ label: new Date(h.hour).toLocaleString('pt-BR', { day: '2-digit', hour: '2-digit' }) + 'h', value: Number(h.units) }))} />
          </div>
        </Card>
      )}

      <ExplainStrip items={ANON_EXPLAIN} />
      {me?.contract && <p className="fx-muted" style={{ fontSize: 13 }}>Contrato {me.contract.number} · pacote {me.contract.plan_name}</p>}
    </>
  );
};

const CityList: React.FC<{ rows: Overview['citiesUp']; empty: string }> = ({ rows, empty }) =>
  rows.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>{empty}</p> : (
    <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 6 }}>
      {rows.map((c) => (
        <li key={c.city_code} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--fx-line)' }}>
          <span>{c.city} ({c.uf})</span>
          <span><b className="fx-num">{num(c.units)} un.</b> <span className={`fx-chip ${Number(c.growthPercent) >= 0 ? 'green' : 'red'}`} style={{ fontSize: 12, padding: '1px 8px' }}>{pct(c.growthPercent)}</span></span>
        </li>
      ))}
    </ul>
  );

const IndustryHome: React.FC = () => <IndustryLayout><Home /></IndustryLayout>;
export default IndustryHome;
