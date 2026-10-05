import React, { useEffect, useState } from 'react';
import { Building2, CheckCircle2, FileText, Map as MapIcon, MinusCircle } from 'lucide-react';
import IndustryLayout, { useIndustry } from './IndustryLayout';
import { Card, PageHero, PanelTitle } from '../../components/flow/Flow';
import { FEATURE_LABEL, dateBr, industryService, type CoveragePlace, type Feature } from '../../services/industry.service';

const ALL: Feature[] = ['SELLOUT', 'PRECO', 'RUPTURA', 'PROMO', 'SELLIN', 'HORA', 'CATEGORIA', 'EXPORTACAO'];

const Account: React.FC = () => {
  const { me } = useIndustry();
  const [coverage, setCoverage] = useState<{ places: CoveragePlace[]; scopeUfs: string[]; scopeCities: string[] } | null>(null);

  useEffect(() => {
    if (me?.access) industryService.coverage().then(setCoverage).catch(() => setCoverage(null));
  }, [me?.access]);

  const c = me?.contract;
  const area = !c ? '' : c.scope_ufs.length === 0 && c.scope_cities.length === 0 ? 'todo o Brasil'
    : [c.scope_ufs.join(', '), c.scope_cities.length ? `${c.scope_cities.length} ${c.scope_cities.length === 1 ? 'cidade' : 'cidades'}` : ''].filter(Boolean).join(' e ');

  return (
    <>
      <PageHero
        title={c ? <>Contrato {c.number}, pacote <mark>{c.plan_name}</mark>, até {dateBr(c.ends_on)}.</> : <>Sua empresa <mark>ainda sem contrato.</mark></>}
        subtitle={me ? `${me.legal_name} · CNPJ ${me.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}` : undefined} />
      {c && (
        <div className="fx-split" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
          <Card>
            <PanelTitle icon={FileText} title="O que o contrato inclui" sub={`Área: ${area}. Até ${c.gtin_limit} produtos; ${me?.approvedProducts ?? 0} liberados.`} />
            <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 8 }}>
              {ALL.map((f) => {
                const on = c.features.includes(f);
                return (
                  <li key={f} style={{ display: 'flex', gap: 10, alignItems: 'center', color: on ? 'var(--fx-ink)' : 'var(--fx-muted)' }}>
                    {on ? <CheckCircle2 size={18} color="var(--fx-green)" aria-hidden="true" /> : <MinusCircle size={18} aria-hidden="true" />}
                    {FEATURE_LABEL[f]}<span className="sr-only">{on ? ' (incluído)' : ' (não incluído)'}</span>
                  </li>
                );
              })}
              {!c.allow_neighborhood && <li className="fx-muted">O contrato não inclui o detalhe por bairro.</li>}
            </ul>
          </Card>
          <Card>
            <PanelTitle icon={MapIcon} title="Onde o MercadoFlow tem lojas" sub="Lugares com lojas suficientes para publicar dados. Mostramos faixas, não o número exato de lojas." />
            {!coverage ? <p className="fx-muted" style={{ marginTop: 12 }}>Carregando…</p> : (
              <ul style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 6 }}>
                {coverage.places.map((p) => (
                  <li key={`${p.uf}-${p.city_code}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--fx-line)' }}>
                    <span>{p.level === 'UF' ? <b>Estado: {p.uf}</b> : `${p.city} (${p.uf})`}</span>
                    <span className="fx-muted">{p.storesRange} lojas</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
      {!c && (
        <Card><PanelTitle icon={Building2} title="Fale com o MercadoFlow" sub={me?.message ?? 'O contrato define a área, os recursos e quantos produtos você acompanha.'} /></Card>
      )}
    </>
  );
};

const IndustryAccount: React.FC = () => <IndustryLayout><Account /></IndustryLayout>;
export default IndustryAccount;
