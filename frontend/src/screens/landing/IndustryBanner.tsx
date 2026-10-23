import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Container, LANDING } from './theme';

/** Verde da faixa um pouco mais claro que o green900, para o degradê. */
const BANNER_GRADIENT = `linear-gradient(115deg, ${LANDING.green900} 0%, #0b5a43 55%, #0f6b4f 100%)`;
const BANNER_TEXT = '#d1fae5';

/** Linhas de gráfico ao fundo, só decoração. */
const ChartLines: React.FC = () => (
  <svg
    aria-hidden
    focusable="false"
    className="pointer-events-none absolute inset-y-0 right-0 h-full w-full md:w-2/3"
    viewBox="0 0 600 200"
    preserveAspectRatio="none"
  >
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <polyline
        points="0,170 60,160 120,150 180,158 240,130 300,120 360,128 420,96 480,80 540,58 600,30"
        stroke="rgba(217,249,157,0.18)"
        strokeWidth="2"
      />
      <polyline
        points="0,190 70,182 140,176 210,180 280,160 350,150 420,140 490,118 560,104 600,92"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="2"
      />
    </g>
    <g fill="rgba(217,249,157,0.07)">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const h = 40 + i * 18;
        return <rect key={i} x={380 + i * 30} y={200 - h} width="18" height={h} rx="3" />;
      })}
    </g>
  </svg>
);

const IndustryBanner: React.FC = () => (
  <section aria-labelledby="industria-titulo" className="py-6 sm:py-8">
    <Container>
      <div
        className="relative overflow-hidden rounded-2xl px-4 py-5 sm:rounded-3xl sm:px-8 sm:py-9 lg:px-10"
        style={{ background: BANNER_GRADIENT, boxShadow: '0 24px 48px -24px rgba(6,78,59,0.55)' }}
      >
        <ChartLines />

        <div className="relative flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
            {/* Símbolo 3D da marca num quadro claro (some no celular para a faixa ficar curta). */}
            <span
              aria-hidden
              className="hidden h-20 w-24 shrink-0 items-center justify-center rounded-2xl sm:flex"
              style={{ background: 'rgba(255,255,255,0.94)', boxShadow: '0 10px 24px -12px rgba(0,0,0,0.45)' }}
            >
              <img
                src="/landing/simbolo-3d.webp"
                srcSet="/landing/simbolo-3d.webp 480w, /landing/simbolo-3d@2x.webp 960w"
                sizes="80px"
                width={480}
                height={241}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-auto w-20"
              />
            </span>
            <div className="min-w-0">
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
                style={{ background: LANDING.lime, color: LANDING.green900 }}
              >
                Para indústria
              </span>
              <h2
                id="industria-titulo"
                className="mt-3 max-w-xl text-xl font-extrabold leading-tight tracking-tight text-white sm:text-[1.75rem]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                É fabricante? Veja o giro real dos seus produtos na gôndola.
              </h2>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed sm:mt-3 sm:text-base" style={{ color: BANNER_TEXT }}>
                Acompanhe o desempenho dos seus produtos no varejo e identifique oportunidades de sell-out com dados
                reais do PDV, anônimos e sem identificar nenhuma loja.
              </p>
            </div>
          </div>

          <Link
            to="/para-industria"
            className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 self-stretch rounded-full px-5 text-center text-sm font-semibold sm:px-6 sm:text-base no-underline shadow-sm transition-transform hover:-translate-y-0.5 sm:self-start lg:self-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9f99d]"
            style={{ background: LANDING.lime, color: LANDING.green900 }}
          >
            Conhecer MercadoFlow Indústria <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </Container>
  </section>
);

export default IndustryBanner;
