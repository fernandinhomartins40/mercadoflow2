import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, Package, Plus, Send, Truck, XCircle } from 'lucide-react';
import IndustryLayout, { Bars, useIndustry } from './IndustryLayout';
import { Card, Chip, Forest, PageHero, PanelTitle, PillTabs, Thumb, brl } from '../../components/flow/Flow';
import { dateBr, errorText, industryService, num, type PortfolioItem, type ProductDetail } from '../../services/industry.service';

const STATUS: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'gray' }> = {
  APROVADO: { label: 'Liberado', tone: 'green' },
  PEDIDO: { label: 'Em análise', tone: 'amber' },
  NEGADO: { label: 'Não liberado', tone: 'red' },
  REVOGADO: { label: 'Retirado', tone: 'gray' },
};

const Products: React.FC = () => {
  const { me, reload } = useIndustry();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<PortfolioItem[] | null>(null);
  const [gtin, setGtin] = useState<string | null>(params.get('gtin'));
  const [grain, setGrain] = useState<'week' | 'day'>('week');
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [codes, setCodes] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const load = () => industryService.portfolio().then((p) => {
    setItems(p);
    setGtin((g) => g ?? p.find((x) => x.status === 'APROVADO')?.gtin ?? null);
  }).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  const current = items?.find((p) => p.gtin === gtin);
  useEffect(() => {
    setDetail(null);
    setDetailError(null);
    if (!gtin || !me?.access || current?.status !== 'APROVADO') return;
    setParams({ gtin }, { replace: true });
    industryService.product(gtin, { grain, days: grain === 'week' ? 364 : 90 })
      .then(setDetail).catch((e) => setDetailError(errorText(e)));
  }, [gtin, grain, me?.access, current?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const list = codes.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return;
    setSending(true);
    setSent(null);
    try {
      const r = await industryService.request(list);
      setSent(`${r.received} ${r.received === 1 ? 'código enviado' : 'códigos enviados'} para análise.${r.invalid.length ? ` Não reconhecidos: ${r.invalid.join(', ')}.` : ''}`);
      setCodes('');
      await load();
      await reload();
    } catch (err) {
      setSent(errorText(err));
    } finally {
      setSending(false);
    }
  };

  const approved = items?.filter((p) => p.status === 'APROVADO').length ?? 0;
  const pending = items?.filter((p) => p.status === 'PEDIDO').length ?? 0;
  const sellIn = detail?.sellIn && detail.sellIn.length > 0;

  return (
    <>
      <PageHero
        title={<><mark>{approved} {approved === 1 ? 'produto liberado' : 'produtos liberados'}</mark>{pending > 0 ? ` e ${pending} em análise.` : '.'}</>}
        subtitle="Só os produtos liberados na sua carteira aparecem nos dados. Cada pedido é conferido pelo MercadoFlow com o prefixo GS1 e a marca da sua empresa." />

      <div className="fx-split">
        <Card aria-label="Carteira">
          <PanelTitle icon={Package} title="Sua carteira" sub="Toque num produto liberado para ver o histórico" />
          {!items ? <p className="fx-muted" style={{ marginTop: 12 }}>Carregando…</p> : items.length === 0 ? (
            <p className="fx-muted" style={{ marginTop: 12 }}>Nenhum produto ainda. Peça os seus no formulário ao lado.</p>
          ) : (
            <ul className="fx-stack" style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, gap: 8 }}>
              {items.map((p) => {
                const s = STATUS[p.status] ?? STATUS.PEDIDO;
                return (
                  <li key={p.gtin}>
                    <button type="button" className={`fx-row ${p.gtin === gtin ? 'selected' : ''}`} aria-current={p.gtin === gtin || undefined} onClick={() => setGtin(p.gtin)}>
                      <Thumb name={p.product_name ?? p.gtin} size={40} />
                      <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                        <b style={{ display: 'block', fontSize: 14.5 }}>{p.product_name ?? 'Produto sem nome no catálogo'}</b>
                        <span className="fx-muted" style={{ fontSize: 13 }}>{p.gtin}{p.brand ? ` · ${p.brand}` : ''}</span>
                      </span>
                      <Chip tone={s.tone} icon={p.status === 'APROVADO' ? CheckCircle2 : p.status === 'PEDIDO' ? Clock : XCircle}>{s.label}</Chip>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {current && current.status === 'APROVADO' && me?.access && (
            <Forest as="aside" aria-label="Histórico do produto">
              <PanelTitle icon={Package} title={current.product_name ?? current.gtin} sub={`GTIN ${current.gtin}`}
                right={<PillTabs<'week' | 'day'> label="Agrupar por" value={grain} onChange={setGrain} tabs={[{ key: 'week', label: 'Semanas' }, { key: 'day', label: 'Dias' }]} />} />
              {detailError && <p role="alert">{detailError}</p>}
              {!detail && !detailError && <p style={{ opacity: 0.8 }}>Carregando…</p>}
              {detail && (
                <>
                  <div className="fx-white" style={{ marginTop: 16, color: 'var(--fx-green)' }}>
                    <h3 style={{ marginBottom: 10 }}>Unidades por {grain === 'week' ? 'semana, último ano' : 'dia, últimos 90 dias'}</h3>
                    <Bars label="Unidades vendidas" points={detail.series.map((s) => ({ label: dateBr(s.period), value: Number(s.units) }))} />
                  </div>
                  {detail.series.some((s) => s.avgPrice != null) && (
                    <div className="fx-white" style={{ marginTop: 14 }}>
                      <h3>Preço praticado no último período</h3>
                      {(() => {
                        const last = detail.series[detail.series.length - 1];
                        return <p style={{ margin: '8px 0 0' }}>Médio de <b>{brl(last.avgPrice)}</b>, entre {brl(last.min_price)} e {brl(last.max_price)}
                          {last.promoSharePercent != null ? `; ${Number(last.promoSharePercent).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% das unidades com desconto` : ''}.</p>;
                      })()}
                    </div>
                  )}
                  {detail.cities.length > 0 && (
                    <div className="fx-white" style={{ marginTop: 14 }}>
                      <h3>Cidades, últimos {grain === 'week' ? '12 meses' : '90 dias'}</h3>
                      <table style={{ width: '100%', marginTop: 8, fontSize: 14, borderCollapse: 'collapse' }}>
                        <thead><tr style={{ textAlign: 'left', color: 'var(--fx-muted)' }}><th scope="col">Cidade</th><th scope="col" style={{ textAlign: 'right' }}>Unidades</th><th scope="col" style={{ textAlign: 'right' }}>Faturamento</th></tr></thead>
                        <tbody>{detail.cities.slice(0, 12).map((c) => (
                          <tr key={c.city_code} style={{ borderTop: '1px solid var(--fx-line)' }}><td style={{ padding: '6px 0' }}>{c.city} ({c.uf})</td><td style={{ textAlign: 'right' }}>{num(c.units)}</td><td style={{ textAlign: 'right' }}>{brl(c.revenue)}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                  {sellIn && (
                    <div className="fx-white" style={{ marginTop: 14, color: 'var(--fx-green)' }}>
                      <h3 style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}><Truck size={18} aria-hidden="true" />Entradas nas lojas (sell-in) por semana</h3>
                      <Bars label="Unidades que entraram nas lojas" height={110} points={detail.sellIn!.map((s) => ({ label: dateBr(s.period), value: Number(s.units) }))} />
                    </div>
                  )}
                </>
              )}
            </Forest>
          )}
          {current && current.status !== 'APROVADO' && (
            <Card>
              <PanelTitle icon={STATUS[current.status]?.tone === 'red' ? XCircle : Clock} title={current.product_name ?? current.gtin}
                sub={current.status === 'PEDIDO' ? `Pedido em ${dateBr(current.requested_at)}. O MercadoFlow confere a titularidade antes de liberar.`
                  : `${STATUS[current.status]?.label} em ${dateBr(current.decided_at)}.${current.decision_note ? ` ${current.decision_note}` : ''}`} />
            </Card>
          )}

          <Card as="section" aria-label="Pedir produtos">
            <PanelTitle icon={Plus} title="Pedir a liberação de produtos" sub="Cole os códigos de barras (GTIN/EAN) dos seus produtos, um por linha ou separados por vírgula." />
            <form onSubmit={send} style={{ marginTop: 14, display: 'grid', gap: 10 }}>
              <label className="fx-field" htmlFor="ind-codes">
                Códigos de barras
                <textarea id="ind-codes" className="fx-input" rows={4} value={codes} onChange={(e) => setCodes(e.target.value)} placeholder="7891234000019&#10;7891234000026" />
              </label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="submit" className="fx-btn primary" disabled={sending || !codes.trim() || me?.status !== 'ATIVA'}><Send aria-hidden="true" />{sending ? 'Enviando…' : 'Enviar para análise'}</button>
                {me?.status !== 'ATIVA' && <span className="fx-muted">Disponível depois que o cadastro da empresa for aprovado.</span>}
              </div>
              {sent && <p role="status" style={{ margin: 0 }}>{sent}</p>}
            </form>
          </Card>
        </div>
      </div>
    </>
  );
};

const IndustryProducts: React.FC = () => <IndustryLayout><Products /></IndustryLayout>;
export default IndustryProducts;
