import React, { useState } from 'react';
import { Ban, Eye, Megaphone, ShieldCheck, Store, Undo2 } from 'lucide-react';
import Layout from '../../components/layout/Layout';
import { Card, Chip, ExplainStrip, PageHero, PanelTitle } from '../../components/flow/Flow';
import { useAuth } from '../../context/AuthContext';
import { marketCommerceService as svc, type MarketPreferences } from '../../services/commerce.service';
import { dateOnly, useAction, useLoad } from '../vendas/ui';

/**
 * O que a loja decide sobre indústrias e distribuidores: receber campanhas ou
 * não, autorizar um vendedor a vê-la pelo nome, ou bloqueá-lo. A matriz de uma
 * rede pode aplicar a escolha a todas as filiais.
 */
const SellerPrivacyPage: React.FC = () => {
  const { marketId } = useAuth();
  const prefs = useLoad(() => (marketId ? svc.preferences(marketId) : Promise.resolve(null)), [marketId]);
  const sellers = useLoad(() => (marketId ? svc.sellers(marketId) : Promise.resolve([])), [marketId]);
  const [network, setNetwork] = useState(false);
  const act = useAction();
  if (!marketId) return null;
  const p = prefs.data;
  const set = (r?: MarketPreferences) => { if (r) { prefs.setData(r); void sellers.reload(); } };
  const consentOf = (id: string) => p?.consents.find((c) => c.seller_id === id)?.status ?? null;
  const known = new Map<string, { id: string; name: string; kind: string }>();
  (sellers.data ?? []).forEach((s) => known.set(s.id, { id: s.id, name: s.name, kind: s.kind }));
  p?.consents.forEach((c) => known.set(c.seller_id, { id: c.seller_id, name: c.seller_name, kind: c.seller_kind }));

  return (
    <>
      <PageHero title="Escolha quais fornecedores podem ver a sua loja e mandar ofertas." 
        subtitle="Você decide quem fala com a sua loja. Sem autorização, ninguém sabe o nome da loja: as campanhas chegam sem identificar quem recebeu." />
      <Card>
        <PanelTitle icon={Megaphone} title="Campanhas" sub="Condições especiais que indústrias e distribuidores enviam para um público de lojas." />
        <label style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 14 }}>
          <button type="button" role="switch" className="fx-switch" aria-checked={p?.receiveCampaigns ?? true} disabled={!p || act.busy}
            onClick={async () => set(await act.run(() => svc.setReceive(marketId, !(p?.receiveCampaigns ?? true), network)))} aria-label="Receber campanhas" />
          <span><b>{p?.receiveCampaigns === false ? 'Não recebo campanhas' : 'Recebo campanhas'}</b><br /><small className="fx-muted">Você pode bloquear um vendedor específico abaixo.</small></span>
        </label>
        {(p?.stores ?? 0) > 0 && (
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
            <input type="checkbox" checked={network} onChange={(e) => setNetwork(e.target.checked)} />
            Aplicar as minhas escolhas também às {p?.stores} filiais da rede
          </label>
        )}
        {act.msg}
      </Card>

      <Card>
        <PanelTitle icon={Store} title="Vendedores" sub="Autorizar deixa o vendedor ver o nome da sua loja e mandar condições só para ela. Bloquear tira tudo dele da sua loja." />
        {known.size === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nenhum vendedor atende a sua região ainda.</p> : (
          <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 8 }}>
            {[...known.values()].map((s) => {
              const st = consentOf(s.id);
              const changed = p?.consents.find((c) => c.seller_id === s.id)?.changed_at;
              return (
                <li key={s.id} className="fx-row" style={{ cursor: 'default', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 200 }}>
                    <b style={{ display: 'block' }}>{s.name}</b>
                    <small className="fx-muted">{s.kind === 'INDUSTRIA' ? 'Indústria' : 'Distribuidor'}{changed ? ` · desde ${dateOnly(changed)}` : ''}</small>
                  </span>
                  {st === 'AUTORIZADA' && <Chip tone="green" icon={ShieldCheck}>autorizado</Chip>}
                  {st === 'BLOQUEADA' && <Chip tone="red" icon={Ban}>bloqueado</Chip>}
                  <span style={{ display: 'flex', gap: 6 }}>
                    {st !== 'AUTORIZADA' && <button type="button" className="fx-btn ghost small" disabled={act.busy}
                      onClick={async () => set(await act.run(() => svc.setConsent(marketId, s.id, 'AUTORIZADA', network)))}><Eye aria-hidden="true" />Autorizar</button>}
                    {st !== 'BLOQUEADA' && <button type="button" className="fx-btn ghost small" disabled={act.busy}
                      onClick={async () => set(await act.run(() => svc.setConsent(marketId, s.id, 'BLOQUEADA', network)))}><Ban aria-hidden="true" />Bloquear</button>}
                    {st && <button type="button" className="fx-btn ghost small" disabled={act.busy} aria-label={`Voltar ao padrão para ${s.name}`}
                      onClick={async () => set(await act.run(() => svc.setConsent(marketId, s.id, null, network)))}><Undo2 aria-hidden="true" /></button>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ExplainStrip items={[
        { icon: ShieldCheck, title: 'Anônima por padrão', text: 'Sem autorização, os vendedores não sabem o nome da sua loja. Os números de venda que a indústria vê somam várias lojas.' },
        { icon: Eye, title: 'Autorizou, aparece', text: 'O vendedor autorizado vê a sua loja pelo nome e pode mandar tabela e campanha só para ela. Você retira quando quiser.' },
        { icon: Store, title: 'Pediu, se identificou', text: 'Ao fazer um pedido, a sua loja se identifica para quem vai atender, como em qualquer compra.' },
      ]} />
    </>
  );
};

const SellerPrivacy: React.FC = () => <Layout><SellerPrivacyPage /></Layout>;
export default SellerPrivacy;
