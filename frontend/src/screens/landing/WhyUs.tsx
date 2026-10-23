import React from 'react';
import { BarChart3, CheckCircle2, Percent, Receipt, ShoppingCart } from 'lucide-react';
import { Container, LANDING, SectionBadge } from './theme';

const BENEFITS = [
  'Funciona com o seu PDV atual',
  'Instalação rápida e sem complicação',
  'Interface simples e fácil de usar',
  'Suporte em português',
  'Desenvolvido para a realidade do varejo brasileiro',
];

/* Números de demonstração (fictícios), apresentados como exemplo de tela. */
const KPIS: Array<{ label: string; value: string; delta: string; icon: React.ElementType; color: string; bg: string }> = [
  { label: 'Faturamento do dia', value: 'R$ 24.380', delta: '+12%', icon: BarChart3, color: LANDING.green600, bg: LANDING.green50 },
  { label: 'Transações', value: '279', delta: '+5%', icon: ShoppingCart, color: LANDING.red, bg: '#fef2f2' },
  { label: 'Lucro', value: 'R$ 5.120', delta: '+8%', icon: Percent, color: LANDING.green700, bg: LANDING.green50 },
  { label: 'Ticket médio', value: 'R$ 87,40', delta: '+3%', icon: Receipt, color: LANDING.orange, bg: '#fff7ed' },
];

const WhyUs: React.FC = () => (
  <section id="por-que-mercadoflow" className="scroll-mt-20 py-16 sm:py-20" style={{ background: LANDING.surface }}>
    <Container>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="min-w-0">
          <SectionBadge>Por que MercadoFlow</SectionBadge>
          <h2
            className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl"
            style={{ color: LANDING.ink, fontFamily: 'var(--font-display)' }}
          >
            Feito para o supermercadista brasileiro
          </h2>
          <p className="mt-4 text-base leading-relaxed" style={{ color: LANDING.muted }}>
            Uma solução simples e prática, que entende a realidade do varejo alimentar no Brasil e transforma os dados
            do seu PDV em decisões do dia a dia.
          </p>
          <ul className="mt-6 flex list-none flex-col gap-3 p-0">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm font-medium" style={{ color: LANDING.text }}>
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" style={{ color: LANDING.green600 }} aria-hidden="true" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <figure className="m-0 min-w-0">
          <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4">
            {KPIS.map((k) => {
              const Icon = k.icon;
              return (
                <div
                  key={k.label}
                  className="flex min-w-0 items-start gap-3 rounded-2xl p-3 min-[360px]:flex-col min-[360px]:gap-2 sm:flex-row sm:gap-3 sm:p-5"
                  style={{ background: LANDING.surface, border: `1px solid ${LANDING.line}`, boxShadow: LANDING.shadow }}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10"
                    style={{ background: k.bg, color: k.color }}
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-xs font-medium" style={{ color: LANDING.muted }}>{k.label}</h3>
                    <p className="mt-1 whitespace-nowrap text-lg font-extrabold tracking-tight min-[414px]:text-xl sm:text-2xl" style={{ color: LANDING.ink }}>
                      {k.value}
                    </p>
                    <p className="mt-1 break-words text-[11px] font-semibold leading-snug sm:text-xs" style={{ color: LANDING.green600 }}>
                      {k.delta} <span className="font-normal" style={{ color: LANDING.muted }}>vs. período anterior</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <figcaption className="mt-3 text-center text-xs" style={{ color: '#94a3b8' }}>
            Exemplo com dados fictícios
          </figcaption>
        </figure>
      </div>
    </Container>
  </section>
);

export default WhyUs;
