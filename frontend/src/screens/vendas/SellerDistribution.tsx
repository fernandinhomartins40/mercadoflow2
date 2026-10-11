import React, { useState } from 'react';
import { Building2, FileSignature, Network, Plus, Save, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import SellerLayout, { useSeller } from './SellerLayout';
import { Card, Chip, Forest, PageHero, PanelTitle } from '../../components/flow/Flow';
import { confirmDialog } from '../../components/common/Dialogs';
import { cnpjLabel, sellerService, type Agreement, type SalesMode } from '../../services/commerce.service';
import { Drawer, dateOnly, field, grid, splitList, tableStyle, tdStyle, thStyle, useAction, useLoad } from './ui';

const MODE: Record<SalesMode, { title: string; text: string }> = {
  DIRETO: { title: 'Vendo direto', text: 'A sua empresa vende direto ao supermercado em toda a sua área de entrega.' },
  MISTO: { title: 'Direto e por distribuidor', text: 'Direto onde não houver distribuidor exclusivo; nas áreas exclusivas, pelo distribuidor.' },
  DISTRIBUIDOR: { title: 'Só por distribuidor', text: 'Nada sai direto: cada pedido e campanha vai pelo distribuidor que atende a loja (salvo as contas diretas).' },
};

interface Draft {
  id: string | null; distributorCnpj: string; distributorName: string; exclusivity: 'EXCLUSIVO' | 'NAO_EXCLUSIVO'; blockOtherSellers: boolean;
  scopeUfs: string; scopeCities: string; scopeBrands: string; scopeGtins: string; startsOn: string; endsOn: string;
  contactName: string; contactEmail: string; contactPhone: string; notes: string;
}

const toDraft = (a?: Agreement): Draft => ({
  id: a?.id ?? null, distributorCnpj: a?.distributor_cnpj ?? '', distributorName: a?.distributor_name ?? '', exclusivity: a?.exclusivity ?? 'EXCLUSIVO',
  blockOtherSellers: a?.block_other_sellers ?? false, scopeUfs: a?.scope_ufs.join(', ') ?? '', scopeCities: a?.scope_cities.join(', ') ?? '',
  scopeBrands: a?.scope_brands.join(', ') ?? '', scopeGtins: a?.scope_gtins.join(', ') ?? '', startsOn: a?.starts_on?.slice(0, 10) ?? '',
  endsOn: a?.ends_on?.slice(0, 10) ?? '', contactName: a?.contact_name ?? '', contactEmail: a?.contact_email ?? '', contactPhone: a?.contact_phone ?? '', notes: a?.notes ?? '',
});

const Distribution: React.FC = () => {
  const { me } = useSeller();
  const dist = useLoad(() => sellerService.distribution());
  const [mode, setMode] = useState<SalesMode | null>(null);
  const [accept, setAccept] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [account, setAccount] = useState({ cnpj: '', label: '' });
  const act = useAction();
  const d = dist.data;
  if (me?.kind !== 'INDUSTRIA') return <Card><p>Os acordos de distribuição são declarados pela indústria.</p></Card>;
  if (!d) return <p className="fx-muted">Carregando…</p>;
  const chosen = mode ?? d.salesMode;

  return (
    <>
      <PageHero title={<>Como a sua indústria chega à loja</>}
        subtitle="Declare a forma de venda, os seus distribuidores e as contas que você atende direto. O MercadoFlow aplica essas regras a cada preço, campanha e pedido, e confere com as notas de entrada das lojas." />

      <Forest aria-label="Forma de venda">
        <PanelTitle icon={FileSignature} title="Forma de venda e termo de responsabilidade" />
        <div style={{ ...grid(220), marginTop: 14 }}>
          {(Object.keys(MODE) as SalesMode[]).map((m) => (
            <label key={m} className="fx-white" style={{ display: 'flex', gap: 10, cursor: 'pointer', outline: chosen === m ? '3px solid var(--fx-lime)' : undefined }}>
              <input type="radio" name="modo" checked={chosen === m} onChange={() => setMode(m)} />
              <span><b>{MODE[m].title}</b><br /><small className="fx-muted">{MODE[m].text}</small></span>
            </label>
          ))}
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14 }}>
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          <span>Declaro que os acordos de distribuição informados aqui são verdadeiros e que a minha empresa responde por respeitá-los (termo {d.termsVersion}).</span>
        </label>
        <button type="button" className="fx-btn lime" style={{ marginTop: 12 }} disabled={act.busy || !accept}
          onClick={async () => { const r = await act.run(() => sellerService.salesMode(chosen, accept), 'Forma de venda registrada.'); if (r) { dist.setData(r); setMode(null); setAccept(false); } }}>
          <ShieldCheck aria-hidden="true" />Confirmar
        </button>
        {d.attestedAt && <p style={{ margin: '10px 0 0', opacity: 0.85 }}>Termo aceito em {dateOnly(d.attestedAt)} por {d.attestedBy}.</p>}
        {act.msg}
      </Forest>

      <Card>
        <PanelTitle icon={Network} title="Distribuidores" sub="Área e produtos em branco valem para tudo. Exclusivo: na área, a sua empresa não vende direto e as suas campanhas chegam pelo distribuidor."
          right={<button type="button" className="fx-btn primary small" disabled={!d.attestedAt} onClick={() => setDraft(toDraft())}><Plus aria-hidden="true" />Novo acordo</button>} />
        {!d.attestedAt && <p className="fx-muted" style={{ marginTop: 10 }}>Confirme a forma de venda e o termo antes de declarar acordos.</p>}
        {d.agreements.length === 0 ? <p className="fx-muted" style={{ marginTop: 12 }}>Nenhum distribuidor declarado.</p> : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={tableStyle}>
              <thead><tr><th style={thStyle}>Distribuidor</th><th style={thStyle}>Tipo</th><th style={thStyle}>Área</th><th style={thStyle}>Produtos</th><th style={thStyle}>Vigência</th><th style={thStyle} /></tr></thead>
              <tbody>
                {d.agreements.map((a) => (
                  <tr key={a.id} style={a.status === 'ENCERRADO' ? { opacity: 0.55 } : undefined}>
                    <td style={tdStyle}><b>{a.distributor_name}</b><br /><small className="fx-muted">{cnpjLabel(a.distributor_cnpj)}</small>
                      {a.distributor_seller_id ? <><br /><Chip tone="green">vende na plataforma</Chip></> : <><br /><small className="fx-muted">fora da plataforma</small></>}</td>
                    <td style={tdStyle}>{a.exclusivity === 'EXCLUSIVO' ? 'Exclusivo' : 'Não exclusivo'}{a.block_other_sellers && <><br /><small className="fx-muted">só ele vende na área</small></>}</td>
                    <td style={tdStyle}>{a.scope_ufs.length || a.scope_cities.length ? [a.scope_ufs.join(', '), a.scope_cities.length ? `${a.scope_cities.length} cidade(s)` : ''].filter(Boolean).join(' e ') : 'Brasil inteiro'}</td>
                    <td style={tdStyle}>{a.scope_brands.length || a.scope_gtins.length ? [a.scope_brands.join(', '), a.scope_gtins.length ? `${a.scope_gtins.length} código(s)` : ''].filter(Boolean).join(' e ') : 'Todos'}</td>
                    <td style={tdStyle}>{dateOnly(a.starts_on)} a {a.ends_on ? dateOnly(a.ends_on) : 'sem fim'}{a.status === 'ENCERRADO' && <><br /><Chip tone="gray">encerrado</Chip></>}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{a.status === 'ATIVO' && <>
                      <button type="button" className="fx-btn ghost small" onClick={() => setDraft(toDraft(a))}>Editar</button>{' '}
                      <button type="button" className="fx-btn ghost small" aria-label={`Encerrar acordo com ${a.distributor_name}`} onClick={async () => {
                        if (!(await confirmDialog(`Encerrar o acordo com ${a.distributor_name}? As regras dele deixam de valer hoje.`, { danger: true, confirmLabel: 'Encerrar' }))) return;
                        const r = await act.run(() => sellerService.endAgreement(a.id)); if (r) dist.setData(r);
                      }}><XCircle aria-hidden="true" /></button></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <PanelTitle icon={Building2} title="Contas atendidas direto" sub="Redes ou lojas que a sua empresa atende direto mesmo dentro de área exclusiva. Pelo CNPJ da loja ou da matriz da rede." />
        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 6 }}>
          {d.directAccounts.length === 0 && <li className="fx-muted">Nenhuma conta direta.</li>}
          {d.directAccounts.map((a) => (
            <li key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--fx-line)' }}>
              <span><b>{a.label ?? 'Conta'}</b> <span className="fx-muted">{cnpjLabel(a.cnpj)}</span></span>
              <button type="button" className="fx-btn ghost small" aria-label="Remover conta direta" onClick={async () => { const r = await act.run(() => sellerService.removeDirectAccount(a.id)); if (r) dist.setData(r); }}><Trash2 aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
        <form style={{ ...grid(200), marginTop: 12 }} onSubmit={async (e) => {
          e.preventDefault();
          const r = await act.run(() => sellerService.addDirectAccount(account), 'Conta direta incluída.');
          if (r) { dist.setData(r); setAccount({ cnpj: '', label: '' }); }
        }}>
          {field('CNPJ', <input value={account.cnpj} onChange={(e) => setAccount({ ...account, cnpj: e.target.value })} inputMode="numeric" required />)}
          {field('Nome', <input value={account.label} onChange={(e) => setAccount({ ...account, label: e.target.value })} placeholder="Ex.: Rede Bom Preço" />)}
          <button type="submit" className="fx-btn primary" disabled={act.busy || !d.attestedAt}><Plus aria-hidden="true" />Incluir</button>
        </form>
      </Card>

      {draft && (
        <Drawer title={draft.id ? 'Editar acordo' : 'Novo acordo de distribuição'} onClose={() => setDraft(null)} wide>
          <form style={{ display: 'grid', gap: 12 }} onSubmit={async (e) => {
            e.preventDefault();
            const body = { ...draft, scopeUfs: splitList(draft.scopeUfs), scopeCities: splitList(draft.scopeCities), scopeBrands: draft.scopeBrands.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
              scopeGtins: splitList(draft.scopeGtins), startsOn: draft.startsOn || undefined, endsOn: draft.endsOn || undefined };
            const r = await act.run(() => sellerService.saveAgreement(draft.id, body), 'Acordo salvo.');
            if (r) { dist.setData(r); setDraft(null); }
          }}>
            <div style={grid(200)}>
              {field('CNPJ do distribuidor', <input value={draft.distributorCnpj} onChange={(e) => setDraft({ ...draft, distributorCnpj: e.target.value })} inputMode="numeric" required />)}
              {field('Nome', <input value={draft.distributorName} onChange={(e) => setDraft({ ...draft, distributorName: e.target.value })} required />)}
              {field('Tipo', <select value={draft.exclusivity} onChange={(e) => setDraft({ ...draft, exclusivity: e.target.value as Draft['exclusivity'] })}>
                <option value="EXCLUSIVO">Exclusivo na área</option><option value="NAO_EXCLUSIVO">Não exclusivo</option>
              </select>)}
            </div>
            {draft.exclusivity === 'EXCLUSIVO' && (
              <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button type="button" role="switch" className="fx-switch" aria-checked={draft.blockOtherSellers} onClick={() => setDraft({ ...draft, blockOtherSellers: !draft.blockOtherSellers })} aria-label="Só este distribuidor vende" />
                Na área, só este distribuidor vende os meus produtos na plataforma
              </label>
            )}
            <div style={grid(200)}>
              {field('UFs', <input value={draft.scopeUfs} onChange={(e) => setDraft({ ...draft, scopeUfs: e.target.value })} placeholder="SP, MG" />)}
              {field('Cidades (código IBGE)', <input value={draft.scopeCities} onChange={(e) => setDraft({ ...draft, scopeCities: e.target.value })} />)}
            </div>
            <div style={grid(200)}>
              {field('Marcas', <input value={draft.scopeBrands} onChange={(e) => setDraft({ ...draft, scopeBrands: e.target.value })} placeholder="Em branco: todas" />)}
              {field('Códigos de barras', <input value={draft.scopeGtins} onChange={(e) => setDraft({ ...draft, scopeGtins: e.target.value })} placeholder="Em branco: todos" />)}
            </div>
            <div style={grid(170)}>
              {field('Início', <input type="date" value={draft.startsOn} onChange={(e) => setDraft({ ...draft, startsOn: e.target.value })} />)}
              {field('Fim', <input type="date" value={draft.endsOn} onChange={(e) => setDraft({ ...draft, endsOn: e.target.value })} />, 'Em branco: sem fim.')}
            </div>
            <div style={grid(170)}>
              {field('Contato', <input value={draft.contactName} onChange={(e) => setDraft({ ...draft, contactName: e.target.value })} />)}
              {field('E-mail', <input type="email" value={draft.contactEmail} onChange={(e) => setDraft({ ...draft, contactEmail: e.target.value })} />)}
              {field('Telefone', <input value={draft.contactPhone} onChange={(e) => setDraft({ ...draft, contactPhone: e.target.value })} />)}
            </div>
            {field('Observações', <textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />)}
            <button type="submit" className="fx-btn primary" disabled={act.busy} style={{ justifySelf: 'start' }}><Save aria-hidden="true" />Salvar acordo</button>
            {act.msg}
          </form>
        </Drawer>
      )}
    </>
  );
};

const SellerDistribution: React.FC = () => <SellerLayout><Distribution /></SellerLayout>;
export default SellerDistribution;
