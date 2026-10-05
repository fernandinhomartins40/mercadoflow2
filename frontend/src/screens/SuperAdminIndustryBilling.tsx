import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, ExternalLink, Factory, FileText, Receipt, ShieldCheck, XCircle } from 'lucide-react';
import SuperAdminLayout from '../components/layout/SuperAdminLayout';
import { ActionHub, Card, Chip, PageHero, PanelTitle } from '../components/flow/Flow';
import { confirmDialog } from '../components/common/Dialogs';
import { cents, dateBr, errorText, industryAdmin, type Bill, type IndustryInvoice } from '../services/industry.service';

/** Cobrança da indústria: o mês calculado por produto, as faturas e as renovações. */

const INVOICE_TONE: Record<string, 'green' | 'amber' | 'red' | 'gray'> = { PAGA: 'green', ABERTA: 'amber', VENCIDA: 'red', CANCELADA: 'gray' };
const INVOICE_LABEL: Record<string, string> = { PAGA: 'Paga', ABERTA: 'Em aberto', VENCIDA: 'Vencida', CANCELADA: 'Cancelada' };

const thisMonth = () => new Date().toISOString().slice(0, 7);

const SuperAdminIndustryBilling: React.FC = () => {
  const [month, setMonth] = useState(thisMonth());
  const [bills, setBills] = useState<{ month: string; totalCents: number; contracts: { bill: Bill; invoice: IndustryInvoice | null }[] } | null>(null);
  const [invoices, setInvoices] = useState<IndustryInvoice[]>([]);
  const [revenue, setRevenue] = useState<Awaited<ReturnType<typeof industryAdmin.revenue>> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [b, i, r] = await Promise.all([industryAdmin.billing(month), industryAdmin.invoices(), industryAdmin.revenue()]);
    setBills(b); setInvoices(i); setRevenue(r);
  }, [month]);
  useEffect(() => { load().catch((e) => setMsg(errorText(e))); }, [load]);

  const issue = async (b: Bill) => {
    if (!(await confirmDialog(`Emitir a fatura de ${month} para ${b.industry}: ${cents(b.amountCents)}?`, { confirmLabel: 'Emitir fatura' }))) return;
    try { const r = await industryAdmin.issue(b.contractId, month); setMsg(`Fatura emitida: ${r.note}.`); await load(); } catch (e) { setMsg(errorText(e)); }
  };
  const paid = async (i: IndustryInvoice) => {
    if (!(await confirmDialog(`Dar baixa manual na fatura de ${dateBr(i.month).slice(3)} (${cents(i.amount_cents)})?`, { confirmLabel: 'Dar baixa' }))) return;
    try { await industryAdmin.paid(i.id); await load(); } catch (e) { setMsg(errorText(e)); }
  };
  const cancel = async (i: IndustryInvoice) => {
    if (!(await confirmDialog('Cancelar esta fatura?', { danger: true, confirmLabel: 'Cancelar fatura', cancelLabel: 'Voltar' }))) return;
    try { await industryAdmin.cancel(i.id); await load(); } catch (e) { setMsg(errorText(e)); }
  };

  const overdue = revenue?.invoices.find((x) => x.status === 'VENCIDA');
  return (
    <SuperAdminLayout>
      <PageHero
        title={<>A indústria rende <mark>{cents(revenue?.monthlyRecurringCents ?? 0)} por mês</mark> com {revenue?.billedGtins ?? 0} produtos.</>}
        subtitle={overdue ? `${overdue.n} ${overdue.n === 1 ? 'fatura vencida' : 'faturas vencidas'} somando ${cents(overdue.cents)}. Contrato com fatura vencida há mais de 7 dias é suspenso sozinho.`
          : 'Nenhuma fatura vencida. As faturas do mês que passou saem sozinhas entre os dias 1 e 5.'}
        side={<ActionHub icon={Receipt} actions={[
          { label: 'Indústrias', icon: Factory, to: '/super-admin/industria' },
          { label: 'Privacidade e dados', icon: ShieldCheck, to: '/super-admin/industria/dados' },
        ]} />} />
      {msg && <Card role="status">{msg}</Card>}

      <Card as="section" aria-label="Mês">
        <PanelTitle icon={FileText} title={`Cobrança de ${month}`} sub="Taxa base mais o preço de cada produto liberado em algum dia do mês, com desconto por volume. Mês incompleto paga a parte."
          right={<label className="fx-field">Mês<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>} />
        {!bills ? <p className="fx-muted">Carregando…</p> : bills.contracts.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nenhum contrato valeu neste mês.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--fx-muted)' }}>
                <th scope="col">Indústria</th><th scope="col" style={{ textAlign: 'right' }}>Produtos</th><th scope="col" style={{ textAlign: 'right' }}>Base</th>
                <th scope="col" style={{ textAlign: 'right' }}>Produtos (R$)</th><th scope="col" style={{ textAlign: 'right' }}>Desconto</th><th scope="col" style={{ textAlign: 'right' }}>Total</th><th scope="col">Fatura</th>
              </tr></thead>
              <tbody>{bills.contracts.map(({ bill: b, invoice }) => (
                <tr key={b.contractId} style={{ borderTop: '1px solid var(--fx-line)' }}>
                  <td style={{ padding: '8px 0' }}><b>{b.industry}</b><br /><span className="fx-muted">{b.number}{b.activeFraction < 1 ? ` · ${Math.round(b.activeFraction * 100)}% do mês` : ''}</span></td>
                  <td style={{ textAlign: 'right' }}>{b.gtins}</td><td style={{ textAlign: 'right' }}>{cents(b.baseCents)}</td><td style={{ textAlign: 'right' }}>{cents(b.gtinCents)}</td>
                  <td style={{ textAlign: 'right' }}>{b.discountCents ? `−${cents(b.discountCents)}` : '—'}</td><td style={{ textAlign: 'right' }}><b>{cents(b.amountCents)}</b></td>
                  <td>{invoice ? <Chip tone={INVOICE_TONE[invoice.status]}>{INVOICE_LABEL[invoice.status]}</Chip>
                    : <button type="button" className="fx-btn primary small" onClick={() => issue(b)}>Emitir</button>}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr style={{ borderTop: '2px solid var(--fx-line-2)' }}><td colSpan={5} style={{ padding: '8px 0' }}><b>Total do mês</b></td><td style={{ textAlign: 'right' }}><b>{cents(bills.totalCents)}</b></td><td /></tr></tfoot>
            </table>
          </div>
        )}
      </Card>

      <div className="fx-split" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <Card as="section" aria-label="Faturas">
          <PanelTitle icon={Receipt} title="Faturas" sub="Com o Asaas ligado, o pagamento dá baixa sozinho." />
          <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 8 }}>
            {invoices.length === 0 && <li className="fx-muted">Nenhuma fatura emitida.</li>}
            {invoices.map((i) => (
              <li key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', borderBottom: '1px solid var(--fx-line)', padding: '8px 0' }}>
                <span><b>{i.number}</b> · {dateBr(i.month).slice(3)} · {cents(i.amount_cents)}<br /><span className="fx-muted" style={{ fontSize: 13 }}>vence {dateBr(i.due_date)}{i.paid_at ? ` · paga em ${dateBr(i.paid_at)}` : ''}</span></span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Chip tone={INVOICE_TONE[i.status]}>{INVOICE_LABEL[i.status]}</Chip>
                  {i.invoice_url && <a className="fx-btn ghost small" href={i.invoice_url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Abrir</a>}
                  {(i.status === 'ABERTA' || i.status === 'VENCIDA') && <>
                    <button type="button" className="fx-btn ghost small" onClick={() => paid(i)}><CheckCircle2 aria-hidden="true" />Baixa</button>
                    <button type="button" className="fx-btn ghost small" onClick={() => cancel(i)}><XCircle aria-hidden="true" />Cancelar</button>
                  </>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card as="section" aria-label="Renovações">
          <PanelTitle icon={CalendarClock} title="Renovações nos próximos 60 dias" />
          <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 6 }}>
            {(revenue?.renewals ?? []).length === 0 && <li className="fx-muted">Nenhum contrato vence nos próximos 60 dias.</li>}
            {revenue?.renewals.map((r) => <li key={r.id}><b>{r.industry}</b> · {r.number} · vence em {dateBr(r.ends_on)}</li>)}
          </ul>
        </Card>
      </div>
    </SuperAdminLayout>
  );
};

export default SuperAdminIndustryBilling;
