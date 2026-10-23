import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Download, KeyRound } from 'lucide-react';
import { Container, LANDING, SectionTitle } from './theme';

/*
 * "Como funciona": três passos do PDV ao painel.
 * O passo 02 segue o fluxo real de ativação (ConnectCashierSteps): o programa do
 * caixa mostra um código de 8 letras e números e a pessoa digita esse código no site.
 */
const STEPS: Array<{ num: string; title: string; text: string; icon: React.ElementType }> = [
  {
    num: '01',
    title: 'Instale o agente',
    text: 'Baixe e instale o agente do MercadoFlow no computador do seu PDV, com Windows 10 ou 11. É rápido e seguro.',
    icon: Download,
  },
  {
    num: '02',
    title: 'Conecte os dados',
    text: 'O programa mostra um código. Digite esse código no site e pronto: o agente passa a enviar os dados do seu PDV de forma automática e segura.',
    icon: KeyRound,
  },
  {
    num: '03',
    title: 'Acompanhe e decida',
    text: 'Acesse o painel e comece a tomar decisões de compra, preço e estoque com base em dados reais da sua loja.',
    icon: BarChart3,
  },
];

const HowItWorks: React.FC = () => (
  <section id="como-funciona" className="scroll-mt-20 py-16 sm:py-20" style={{ background: LANDING.soft }}>
    <Container>
      <SectionTitle
        badge="Como funciona"
        title="Do PDV ao painel em 5 minutos."
        subtitle="Sem trocar de sistema. Sem TI. Sem complicação."
      />

      <ol className="mt-12 grid list-none gap-10 p-0 md:grid-cols-3 md:gap-8">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.num} className="relative">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white"
                  style={{ background: LANDING.green600, boxShadow: '0 4px 14px rgba(22,163,74,0.30)' }}
                  aria-hidden="true"
                >
                  {step.num}
                </span>
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: LANDING.green50, color: LANDING.green600 }}
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" />
                </span>
                {i < STEPS.length - 1 && (
                  <span className="ml-2 hidden min-w-0 flex-1 items-center md:flex" aria-hidden="true">
                    <span className="h-px flex-1" style={{ background: LANDING.line }} />
                    <ArrowRight className="-ml-1 h-4 w-4 shrink-0" style={{ color: '#cbd5e1' }} />
                  </span>
                )}
              </div>
              <h3 className="mt-4 text-base font-bold" style={{ color: LANDING.ink }}>
                <span className="sr-only">Passo {step.num}: </span>
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: LANDING.muted }}>
                {step.text}
              </p>
            </li>
          );
        })}
      </ol>

      <div className="mt-12 text-center">
        <Link
          to="/register"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-7 py-3 text-sm font-bold text-white no-underline transition hover:opacity-90"
          style={{ background: LANDING.green900, boxShadow: LANDING.shadow }}
        >
          Começar grátis agora <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </Container>
  </section>
);

export default HowItWorks;
