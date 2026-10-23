import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Container, LANDING } from './theme';

/** Chamado final em faixa azul-marinho, antes do rodapé. */
const FinalCta: React.FC = () => (
  <section
    className="relative overflow-hidden py-16 sm:py-20"
    style={{ background: LANDING.navy }}
    aria-labelledby="cta-final-titulo"
  >
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ background: 'radial-gradient(60% 80% at 50% 0%, rgba(34,197,94,0.14), transparent 70%)' }}
    />
    <Container className="relative text-center">
      <span
        className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
        style={{ background: LANDING.green500, color: LANDING.navy }}
      >
        Vamos juntos
      </span>
      <h2
        id="cta-final-titulo"
        className="mx-auto mt-4 max-w-2xl text-2xl font-extrabold tracking-tight text-white sm:text-3xl lg:text-4xl"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Pronto para decidir com dados, não com achismo?
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-base" style={{ color: '#cbd5e1' }}>
        Transforme os dados do seu PDV em decisões de compra, preço e estoque.
      </p>
      <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        <Link
          to="/register"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold no-underline transition-opacity hover:opacity-90"
          style={{ background: LANDING.green500, color: LANDING.navy }}
        >
          Começar grátis agora <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <a
          href="#como-funciona"
          className="inline-flex min-h-[48px] items-center justify-center rounded-full px-7 text-sm font-semibold text-white no-underline transition-colors hover:bg-white/10"
          style={{ border: '1px solid rgba(255,255,255,0.55)' }}
        >
          Ver como funciona
        </a>
      </div>
    </Container>
  </section>
);

export default FinalCta;
