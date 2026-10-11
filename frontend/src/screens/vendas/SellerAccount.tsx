import React, { useEffect, useState } from 'react';
import { Building2, Receipt, Save } from 'lucide-react';
import SellerLayout, { useSeller } from './SellerLayout';
import { Card, PageHero, PanelTitle } from '../../components/flow/Flow';
import { brlCents, cnpjLabel, sellerService } from '../../services/commerce.service';
import { field, grid, splitList, useAction } from './ui';

const Account: React.FC = () => {
  const { me, reload } = useSeller();
  const act = useAction();
  const [v, setV] = useState({ serviceUfs: '', serviceCities: '', minOrder: '', paymentTerms: '', deliveryTerms: '', contactName: '', contactEmail: '', contactPhone: '' });
  useEffect(() => {
    if (!me) return;
    setV({
      serviceUfs: me.service_ufs.join(', '), serviceCities: me.service_cities.join(', '), minOrder: me.min_order_cents ? String(me.min_order_cents / 100).replace('.', ',') : '',
      paymentTerms: me.payment_terms ?? '', deliveryTerms: me.delivery_terms ?? '', contactName: me.contact_name ?? '', contactEmail: me.contact_email ?? '', contactPhone: me.contact_phone ?? '',
    });
  }, [me]);
  if (!me) return null;

  return (
    <>
      <PageHero title={<>{me.name}</>} subtitle={`${me.legal_name} · CNPJ ${cnpjLabel(me.cnpj)} · ${me.kind === 'INDUSTRIA' ? 'Indústria' : 'Distribuidor'}`} />
      <Card>
        <PanelTitle icon={Building2} title="Onde e como você vende" sub="As lojas veem estas condições no seu catálogo e em cada pedido." />
        <form style={{ display: 'grid', gap: 12, marginTop: 14 }} onSubmit={async (e) => {
          e.preventDefault();
          const r = await act.run(() => sellerService.saveProfile({
            serviceUfs: splitList(v.serviceUfs), serviceCities: splitList(v.serviceCities),
            minOrderCents: v.minOrder ? Math.round(Number(v.minOrder.replace(/\./g, '').replace(',', '.')) * 100) : 0,
            paymentTerms: v.paymentTerms, deliveryTerms: v.deliveryTerms, contactName: v.contactName, contactEmail: v.contactEmail, contactPhone: v.contactPhone,
          }), 'Dados salvos.');
          if (r) await reload();
        }}>
          <div style={grid(200)}>
            {field('UFs onde entrega', <input value={v.serviceUfs} onChange={(e) => setV({ ...v, serviceUfs: e.target.value })} placeholder="SP, MG" />, 'Em branco (e sem cidades): todo o Brasil.')}
            {field('Cidades onde entrega (código IBGE)', <input value={v.serviceCities} onChange={(e) => setV({ ...v, serviceCities: e.target.value })} />)}
            {field('Pedido mínimo (R$)', <input value={v.minOrder} onChange={(e) => setV({ ...v, minOrder: e.target.value })} inputMode="decimal" />)}
          </div>
          <div style={grid(260)}>
            {field('Condições de pagamento', <input value={v.paymentTerms} onChange={(e) => setV({ ...v, paymentTerms: e.target.value })} placeholder="Ex.: boleto 28 dias" />)}
            {field('Prazo de entrega', <input value={v.deliveryTerms} onChange={(e) => setV({ ...v, deliveryTerms: e.target.value })} placeholder="Ex.: até 3 dias úteis" />)}
          </div>
          <div style={grid(200)}>
            {field('Contato comercial', <input value={v.contactName} onChange={(e) => setV({ ...v, contactName: e.target.value })} />)}
            {field('E-mail', <input type="email" value={v.contactEmail} onChange={(e) => setV({ ...v, contactEmail: e.target.value })} />)}
            {field('Telefone', <input value={v.contactPhone} onChange={(e) => setV({ ...v, contactPhone: e.target.value })} />)}
          </div>
          <button type="submit" className="fx-btn primary" disabled={act.busy} style={{ justifySelf: 'start' }}><Save aria-hidden="true" />Salvar</button>
          {act.msg}
        </form>
      </Card>
      <Card>
        <PanelTitle icon={Receipt} title="Seu plano no MercadoFlow" />
        <p style={{ margin: '12px 0 0' }}>Mensalidade: <b>{brlCents(me.monthly_fee_cents)}</b> · Taxa sobre pedido entregue: <b>{Number(me.order_fee_pct).toLocaleString('pt-BR')}%</b></p>
        <p className="fx-muted" style={{ margin: '6px 0 0' }}>A taxa é calculada sobre o valor confirmado de cada pedido entregue. Pagamento e prazo do pedido são combinados entre você e a loja.</p>
      </Card>
    </>
  );
};

const SellerAccount: React.FC = () => <SellerLayout><Account /></SellerLayout>;
export default SellerAccount;
