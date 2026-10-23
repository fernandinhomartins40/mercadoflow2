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
  <section id="como-funciona" className="scroll-mt-20 py-12 sm:py-16" style={{ background: LANDING.soft }}>
    <Container>
      <SectionTitle
        badge="Como funciona"
        title="Do PDV ao painel em 5 minutos."
        subtitle="Sem trocar de sistema. Sem TI. Sem complicação."
      />

      {/* Celular: lista vertical (número, ícone e texto na mesma linha). Do tablet em diante: 3 colunas com seta. */}
      <ol className="mt-8 grid list-none gap-5 p-0 sm:mt-12 md:grid-cols-3 md:gap-8">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.num} className="relative flex items-start gap-3 md:block">
              <div className="flex shrink-0 items-center gap-2 md:gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white"
                  style={{ background: LANDING.green600, boxShadow: '0 4px 14px rgba(22,163,74,0.30)' }}
                  aria-hidden="true"
                >
                  {step.num}
                </span>
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl md:h-11 md:w-11"
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
              <div className="min-w-0">
              <h3 className="mt-1 text-base font-bold md:mt-4" style={{ color: LANDING.ink }}>
                <span className="sr-only">Passo {step.num}: </span>
                {step.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed md:mt-2" style={{ color: LANDING.muted }}>
                {step.text}
              </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 text-center sm:mt-12">
        <Link
          to="/register"
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-7 py-3 sm:inline-flex sm:w-auto text-sm font-bold text-white no-underline transition hover:opacity-90"
          style={{ background: LANDING.green900, boxShadow: LANDING.shadow }}
        >
          Começar grátis agora <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </Container>
  </section>
);

export default HowItWorks;
