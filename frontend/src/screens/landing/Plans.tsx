import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import subscriptionService, { PlanDescriptor, featureText, formatPrice } from '../../services/subscription.service';
import { Container, LANDING, SectionTitle } from './theme';

/** Quantos itens o plano mostra no celular antes do "Ver mais" (do tablet em diante, todos). */
const MOBILE_ITEMS = 4;

/** Texto do botão de cada plano: o mesmo da Landing anterior. */
const planCta = (p: PlanDescriptor) => {
  if (p.free || p.monthlyPriceCents === 0) return 'Começar grátis';
  if (p.custom || p.monthlyPriceCents < 0) return 'Falar com vendas';
  return `Escolher ${p.name}`;
};

/**
 * Seção "Planos". Nome, preço, limites e recursos vêm sempre da API pública
 * (GET /api/v1/plans), nunca de valores fixos aqui. Se a API falhar, os cards
 * somem e fica só o "Ver planos" levando ao cadastro.
 */
const Plans: React.FC = () => {
  const [plans, setPlans] = useState<PlanDescriptor[] | null>(null);
  const [plansFailed, setPlansFailed] = useState(false);
  // No celular cada plano mostra só os primeiros itens; "Ver mais" abre a lista toda.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    subscriptionService
      .getPublicPlans()
      .then((list) => {
        if (cancelled) return;
        if (list.length) setPlans(list);
        else setPlansFailed(true);
      })
      .catch(() => {
        if (!cancelled) setPlansFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loading = !plans && !plansFailed;
  // Computador: 4 colunas. Tablet: 2 colunas. Celular: um plano por linha.
  const grid = plans && plans.length >= 4 ? 'md:grid-cols-2 lg:grid-cols-4 lg:gap-4' : 'md:grid-cols-2 lg:grid-cols-3';

  return (
    <section id="planos" className="scroll-mt-20 py-12 sm:py-16" style={{ background: LANDING.surface }}>
      <Container>
        <SectionTitle
          badge="Planos"
          title="Escolha o plano ideal para a sua loja."
          subtitle="Comece grátis e evolua conforme a sua necessidade."
        />

        <div className="mt-8 sm:mt-10" aria-busy={loading}>
          {loading && (
            <p className="text-center text-sm" style={{ color: LANDING.muted }} role="status">
              Carregando planos...
            </p>
          )}

          {plansFailed && (
            <div className="flex justify-center">
              <Link
                to="/register"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-7 text-sm font-semibold text-white no-underline transition-opacity hover:opacity-90"
                style={{ background: LANDING.green900 }}
              >
                Ver planos <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          )}

          {plans && (
            <div className={`grid grid-cols-1 gap-4 pt-3 md:gap-5 ${grid}`}>
              {plans.map((p) => {
                const highlight = p.code === 'PROFISSIONAL';
                const items = [
                  ...(p.highlights || []),
                  ...(p.features || []).filter((f) => f.enabled).map(featureText),
                ];
                const paid = p.monthlyPriceCents > 0;
                const open = !!expanded[p.code];
                const hiddenCount = open ? 0 : Math.max(0, items.length - MOBILE_ITEMS);
                return (
                  <article
                    key={p.code}
                    // Abaixo de 768 px o card vira linha: nome e preço no topo, itens no meio e botão embaixo
                    // (de 640 a 767 px: nome | itens | preço e botão). Do tablet em diante, card em coluna.
                    className={`relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 rounded-2xl p-4 sm:grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_auto] sm:items-start md:flex md:flex-col md:items-stretch md:gap-0 md:p-6 lg:p-5 xl:p-6 ${
                      highlight ? 'bg-[#f0fdf4] md:bg-white' : 'bg-white'
                    }`}
                    style={
                      highlight
                        ? {
                            border: `2px solid ${LANDING.green600}`,
                            boxShadow: '0 0 0 4px rgba(22,163,74,0.08), 0 12px 32px rgba(15,23,42,0.08)',
                          }
                        : { border: `1px solid ${LANDING.line}`, boxShadow: LANDING.shadow }
                    }
                  >
                    {highlight && (
                      <span
                        className="absolute -top-3 left-4 whitespace-nowrap rounded-full px-4 py-1 text-xs font-bold text-white md:left-1/2 md:-translate-x-1/2"
                        style={{ background: LANDING.green700 }}
                      >
                        Recomendado
                      </span>
                    )}
                    <div className="col-start-1 row-start-1 min-w-0">
                      <h3 className="text-base font-bold" style={{ color: LANDING.ink }}>
                        {p.name}
                      </h3>
                      {p.description && (
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: LANDING.muted }}>
                          {p.description}
                        </p>
                      )}
                    </div>
                    <div className="col-start-2 row-start-1 flex flex-col items-end gap-0 text-right sm:col-start-3 md:mt-5 md:flex-row md:flex-wrap md:items-baseline md:gap-1 md:text-left">
                      <span
                        className="whitespace-nowrap text-xl font-extrabold tracking-tight md:text-3xl lg:text-[1.65rem] xl:text-3xl"
                        style={{ color: LANDING.ink, fontFamily: 'var(--font-display)' }}
                      >
                        {formatPrice(p.monthlyPriceCents)}
                      </span>
                      {paid && (
                        <span className="text-xs md:text-sm" style={{ color: LANDING.muted }}>
                          /mês
                        </span>
                      )}
                    </div>
                    <ul
                      className="col-span-2 row-start-2 flex flex-col gap-1.5 sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1 md:mt-5 md:gap-2.5"
                      aria-label={`O que o plano ${p.name} inclui`}
                    >
                      {items.map((f, i) => (
                        <li
                          key={f}
                          className={`items-start gap-2 text-[13px] md:flex md:text-sm ${hiddenCount > 0 && i >= MOBILE_ITEMS ? 'hidden' : 'flex'}`}
                          style={{ color: LANDING.text }}
                        >
                          <span
                            className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                            style={{ background: LANDING.green100 }}
                            aria-hidden
                          >
                            <Check className="h-3 w-3" strokeWidth={3} style={{ color: LANDING.green700 }} />
                          </span>
                          <span className="min-w-0 break-words">{f}</span>
                        </li>
                      ))}
                      {hiddenCount > 0 && (
                        <li className="md:hidden">
                          <button
                            type="button"
                            onClick={() => setExpanded((prev) => ({ ...prev, [p.code]: true }))}
                            className="min-h-[32px] text-[13px] font-semibold underline-offset-2 hover:underline"
                            style={{ color: LANDING.green700 }}
                          >
                            Ver mais {hiddenCount} {hiddenCount === 1 ? 'recurso' : 'recursos'}
                          </button>
                        </li>
                      )}
                    </ul>
                    <div className="col-span-2 row-start-3 sm:col-span-1 sm:col-start-3 sm:row-start-2 md:mt-auto md:pt-6">
                      <Link
                        to="/register"
                        className="inline-flex min-h-[44px] w-full items-center justify-center whitespace-nowrap rounded-full px-5 text-center text-sm font-semibold no-underline transition-colors lg:px-3 lg:text-[13px] xl:px-5 xl:text-sm"
                        style={
                          highlight
                            ? { background: LANDING.green900, color: '#ffffff', border: `1px solid ${LANDING.green900}` }
                            : { background: LANDING.surface, color: LANDING.ink, border: `1px solid ${LANDING.line}` }
                        }
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = highlight ? LANDING.green800 : LANDING.green50;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = highlight ? LANDING.green900 : LANDING.surface;
                        }}
                      >
                        {planCta(p)}
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </Container>
    </section>
  );
};

export default Plans;
