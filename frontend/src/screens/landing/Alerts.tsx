import React from 'react';
import { CheckCircle2, Package, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { Container, LANDING, SectionBadge } from './theme';

/**
 * O que o lojista recebe de fato: o motor de oportunidades roda toda madrugada
 * (OpportunityDetectionJob, 03:30 de Brasília) e alimenta as telas Hoje e
 * Decidir. Os alertas de hora em hora (AlertGenerationJob) estão desligados em
 * produção desde jul/2026 (app.alerts.generation-enabled=false), por isso não
 * são prometidos aqui. Se um tipo de oportunidade entrar ou sair, atualize a lista.
 */
const DETECTORS = [
  'Dinheiro parado em estoque',
  'Hora de comprar antes de faltar',
  'Produtos que puxam clientes para a loja',
  'Promoções que dão resultado',
  'Vendas fora do normal',
  'Preço acima do praticado no mercado',
  'Combos de produtos que vendem juntos',
];

type ExampleAlert = {
  icon: LucideIcon;
  color: string;
  label: string;
  time: string;
  title: string;
  hint: string;
};

const EXAMPLES: ExampleAlert[] = [
  {
    icon: TrendingDown,
    color: LANDING.red,
    label: 'Vendas',
    time: 'hoje',
    title: 'Refrigerante cola 2L com venda 18% abaixo da média',
    hint: 'Rever preço ou reforçar exposição.',
  },
  {
    icon: Package,
    color: LANDING.amber,
    label: 'Estoque',
    time: 'hoje',
    title: 'Queijo muçarela com estoque baixo',
    hint: 'Estoque atual para 3 dias. Considerar reposição.',
  },
  {
    icon: TrendingUp,
    color: LANDING.blue,
    label: 'Oportunidade',
    time: 'ontem',
    title: 'Cerveja lata 350 ml com aumento de 32% nas vendas',
    hint: 'Considerar reposição antecipada.',
  },
];

const Alerts: React.FC = () => (
  <section className="py-16 sm:py-20" style={{ background: LANDING.navy }} aria-labelledby="alertas-titulo">
    <Container>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="min-w-0">
          <SectionBadge dark>Oportunidades do dia</SectionBadge>
          <h2
            id="alertas-titulo"
            className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Todo dia uma lista. Dados reais. Ação imediata.
          </h2>
          <p className="mt-4 text-base leading-relaxed" style={{ color: '#cbd5e1' }}>
            Toda madrugada o MercadoFlow analisa as vendas do seu PDV e monta a lista do que fazer hoje: o que comprar,
            o que promover e onde há dinheiro parado.
          </p>
          <ul className="mt-6 space-y-2.5">
            {DETECTORS.map((d) => (
              <li key={d} className="flex items-start gap-3 text-sm sm:text-[15px]" style={{ color: '#e2e8f0' }}>
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: LANDING.green500 }} aria-hidden="true" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
            Exemplos
          </p>
          <ul className="space-y-4">
            {EXAMPLES.map(({ icon: Icon, color, label, time, title, hint }) => (
              <li
                key={title}
                className="flex items-start gap-4 rounded-2xl p-4 sm:p-5"
                style={{
                  background: LANDING.navy800,
                  border: '1px solid #334155',
                  borderLeft: `4px solid ${color}`,
                }}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `${color}26` }}
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" style={{ color }} strokeWidth={2.4} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                      style={{ background: '#ffffff', color: LANDING.navy }}
                    >
                      {label}
                    </span>
                    <span className="text-xs" style={{ color: '#94a3b8' }}>
                      {time}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold leading-snug text-white sm:text-[15px]">{title}</h3>
                  <p className="mt-1 text-[13px]" style={{ color: '#cbd5e1' }}>
                    {hint}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Container>
  </section>
);

export default Alerts;
