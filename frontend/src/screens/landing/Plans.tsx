import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import subscriptionService, { PlanDescriptor, featureText, formatPrice } from '../../services/subscription.service';
import { Container, LANDING, SectionTitle } from './theme';

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
  const grid = plans && plans.length >= 4 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3';

  return (
    <section id="planos" className="scroll-mt-20 py-16 sm:py-20 lg:py-24" style={{ background: LANDING.surface }}>
      <Container>
        <SectionTitle
          badge="Planos"
          title="Escolha o plano ideal para a sua loja."
          subtitle="Comece grátis e evolua conforme a sua necessidade."
        />

        <div className="mt-12" aria-busy={loading}>
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
            <div className={`grid grid-cols-1 gap-5 pt-3 ${grid}`}>
              {plans.map((p) => {
                const highlight = p.code === 'PROFISSIONAL';
                const items = [
                  ...(p.highlights || []),
                  ...(p.features || []).filter((f) => f.enabled).map(featureText),
                ];
                const paid = p.monthlyPriceCents > 0;
                return (
                  <article
                    key={p.code}
                    className="relative flex min-w-0 flex-col rounded-2xl p-6"
                    style={
                      highlight
                        ? {
                            background: LANDING.surface,
                            border: `2px solid ${LANDING.green600}`,
                            boxShadow: '0 0 0 4px rgba(22,163,74,0.08), 0 12px 32px rgba(15,23,42,0.08)',
                          }
                        : { background: LANDING.surface, border: `1px solid ${LANDING.line}`, boxShadow: LANDING.shadow }
                    }
                  >
                    {highlight && (
                      <span
                        className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1 text-xs font-bold text-white"
                        style={{ background: LANDING.green700 }}
                      >
                        Recomendado
                      </span>
                    )}
                    <h3 className="text-base font-bold" style={{ color: LANDING.ink }}>
                      {p.name}
                    </h3>
                    {p.description && (
                      <p className="mt-1 text-xs leading-relaxed" style={{ color: LANDING.muted }}>
                        {p.description}
                      </p>
                    )}
                    <div className="mt-5 flex flex-wrap items-baseline gap-1">
                      <span
                        className="text-3xl font-extrabold tracking-tight"
                        style={{ color: LANDING.ink, fontFamily: 'var(--font-display)' }}
                      >
                        {formatPrice(p.monthlyPriceCents)}
                      </span>
                      {paid && (
                        <span className="text-sm" style={{ color: LANDING.muted }}>
                          /mês
                        </span>
                      )}
                    </div>
                    <ul className="mt-5 flex flex-col gap-2.5" aria-label={`O que o plano ${p.name} inclui`}>
                      {items.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm" style={{ color: LANDING.text }}>
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
                    </ul>
                    <div className="mt-auto pt-6">
                      <Link
                        to="/register"
                        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-5 text-center text-sm font-semibold no-underline transition-colors"
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
