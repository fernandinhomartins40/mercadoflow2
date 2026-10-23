import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  ChevronDown,
  CreditCard,
  Database,
  LayoutDashboard,
  Monitor,
  Package,
  Play,
  Settings,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Container, LANDING } from './theme';
import { FOCUS_RING, scrollToSection } from './Header';

// ── Card de demonstração (todos os números abaixo são fictícios) ─────────────

const KPIS = [
  { label: 'Faturamento', value: 'R$ 24.380', change: '+12%' },
  { label: 'Lucro', value: 'R$ 4.870', change: '+8%' },
  { label: 'Transações', value: '279', change: '+5%' },
];

/** Faturamento diário em milhares de reais, escala de 0 a 8 mil. Fictício. */
const DAYS: { day: string; value: number }[] = [
  { day: 'Seg', value: 3.1 },
  { day: 'Ter', value: 4.3 },
  { day: 'Qua', value: 4.6 },
  { day: 'Qui', value: 4.9 },
  { day: 'Sex', value: 7.2 },
  { day: 'Sáb', value: 3.9 },
  { day: 'Dom', value: 3.6 },
];
const CHART_MAX = 8;

const ALERTS = [
  {
    icon: TrendingDown,
    color: LANDING.red,
    bg: '#fef2f2',
    title: 'Refrigerante cola 2L com venda 18% abaixo da média',
    hint: 'Rever preço ou reforçar exposição.',
    when: 'há 2h',
  },
  {
    icon: AlertTriangle,
    color: '#c2410c',
    bg: '#fff7ed',
    title: 'Queijo muçarela com estoque baixo',
    hint: 'Estoque atual para 3 dias.',
    when: 'há 5h',
  },
  {
    icon: TrendingUp,
    color: '#1d4ed8',
    bg: '#eff6ff',
    title: 'Cerveja lata 350 ml com aumento de 32% nas vendas',
    hint: 'Considerar reposição antecipada.',
    when: 'há 1 dia',
  },
];

const SIDEBAR = [LayoutDashboard, Package, ShoppingCart, Bell, BarChart3, Settings];

const DemoDashboard: React.FC = () => (
  <figure
    className="relative m-0 flex w-full overflow-hidden rounded-2xl bg-white"
    style={{ border: `1px solid ${LANDING.line}`, boxShadow: '0 2px 4px rgba(15,23,42,0.04), 0 24px 60px -12px rgba(15,23,42,0.18)' }}
  >
    {/* Barra lateral de ícones */}
    <div
      aria-hidden
      className="hidden w-14 shrink-0 flex-col items-center gap-3 py-4 sm:flex"
      style={{ borderRight: `1px solid ${LANDING.line}`, background: LANDING.soft }}
    >
      <img src="/logomercadoflow-color.png" alt="" className="mb-1 h-5 w-9 object-cover object-left" />
      {SIDEBAR.map((Icon, i) => (
        <span
          key={i}
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={i === 0 ? { background: LANDING.green900, color: '#ffffff' } : { color: '#94a3b8' }}
        >
          <Icon className="h-4 w-4" />
        </span>
      ))}
    </div>

    <div className="min-w-0 flex-1 p-3 sm:p-4">
      {/* Topo */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[11px] font-medium" style={{ color: LANDING.muted }}>
          Demonstração <span aria-hidden>·</span> Dados fictícios
        </p>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ background: '#fef3c7', color: '#92400e' }}
        >
          Exemplo ilustrativo
        </span>
      </div>

      {/* KPIs */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {KPIS.map((k) => (
          <div key={k.label} className="min-w-0 rounded-xl p-2 sm:p-3" style={{ border: `1px solid ${LANDING.line}` }}>
            <div className="flex items-start justify-between gap-1">
              <p className="m-0 truncate text-[10px] font-medium sm:text-[11px]" style={{ color: LANDING.muted }}>
                {k.label}
              </p>
              <span
                aria-hidden
                className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md md:flex"
                style={{ background: LANDING.green50, color: LANDING.green600 }}
              >
                <BarChart3 className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="m-0 mt-1 whitespace-nowrap text-[12px] font-extrabold tabular-nums min-[360px]:text-[13px] sm:text-base" style={{ color: LANDING.green800 }}>
              {k.value}
            </p>
            <p className="m-0 mt-0.5 break-words text-[10px] font-semibold leading-snug" style={{ color: LANDING.green700 }}>
              {k.change}
              <span className="hidden font-normal xl:inline" style={{ color: LANDING.muted }}> vs. período anterior</span>
            </p>
          </div>
        ))}
      </div>

      {/* Gráfico de barras feito com divs */}
      <div className="mt-3 rounded-xl p-3" style={{ border: `1px solid ${LANDING.line}` }}>
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-xs font-bold" style={{ color: LANDING.ink }}>Faturamento diário</p>
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium"
            style={{ border: `1px solid ${LANDING.line}`, color: LANDING.muted }}
          >
            Últimos 7 dias <ChevronDown className="h-3 w-3" aria-hidden />
          </span>
        </div>
        <div
          role="img"
          aria-label={`Gráfico fictício de faturamento diário: ${DAYS.map((d) => `${d.day} ${d.value.toLocaleString('pt-BR')} mil`).join(', ')}.`}
          className="mt-2 flex gap-2"
        >
          {/* Eixo Y */}
          <div aria-hidden className="flex h-28 flex-col justify-between pb-5 text-right text-[9px] sm:h-32" style={{ color: '#94a3b8' }}>
            <span>8 mil</span>
            <span>6 mil</span>
            <span>4 mil</span>
            <span>2 mil</span>
            <span>0</span>
          </div>
          <div aria-hidden className="relative flex h-28 flex-1 items-end gap-1.5 pb-5 sm:h-32 sm:gap-2.5">
            {/* Linhas de grade */}
            <div className="pointer-events-none absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="block h-px w-full" style={{ background: i === 4 ? LANDING.line : '#f1f5f9' }} />
              ))}
            </div>
            {DAYS.map((d) => (
              <div key={d.day} className="relative flex h-full flex-1 flex-col items-center justify-end">
                <span
                  className="block w-full max-w-[26px] rounded-t-[4px]"
                  style={{ height: `${(d.value / CHART_MAX) * 100}%`, background: LANDING.green500 }}
                />
                <span className="absolute -bottom-5 text-[9px]" style={{ color: LANDING.muted }}>{d.day}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alertas */}
      <div className="mt-3 rounded-xl p-3" style={{ border: `1px solid ${LANDING.line}` }}>
        <div className="flex items-center justify-between">
          <p className="m-0 text-xs font-bold" style={{ color: LANDING.ink }}>Alertas e oportunidades</p>
          <span className="text-[10px] font-semibold" style={{ color: LANDING.green700 }}>Ver todos</span>
        </div>
        <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
          {ALERTS.map((a) => (
            <li key={a.title} className="flex items-start gap-2.5 py-1">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: a.bg, color: a.color }}>
                <a.icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[11px] font-semibold leading-snug" style={{ color: LANDING.ink }}>{a.title}</p>
                <p className="m-0 text-[10px] leading-snug" style={{ color: LANDING.muted }}>{a.hint}</p>
              </div>
              <span className="shrink-0 text-[10px]" style={{ color: LANDING.muted }}>{a.when}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
    <figcaption className="sr-only">
      Exemplo do painel do MercadoFlow com dados fictícios, apenas para demonstração.
    </figcaption>
  </figure>
);

// ── Hero ──────────────────────────────────────────────────────────────────────

const TRUST = [
  { icon: Monitor, label: 'Sem trocar de sistema' },
  { icon: CreditCard, label: 'Sem cartão de crédito' },
  { icon: Database, label: 'Sem ERP' },
];

const Hero: React.FC = () => (
  <section
    id="inicio"
    aria-labelledby="hero-titulo"
    className="relative overflow-hidden pb-12 pt-8 sm:pt-12 lg:pb-16 lg:pt-14"
    style={{ background: `linear-gradient(180deg, ${LANDING.green50} 0%, #ffffff 70%)` }}
  >
    {/* Brilho verde sutil, só decoração */}
    <div
      aria-hidden
      className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full blur-3xl"
      style={{ background: 'rgba(34,197,94,0.10)' }}
    />

    <Container className="relative">
      <div className="grid items-center gap-10 xl:grid-cols-[1fr_1.08fr] xl:gap-12">
        {/* Texto */}
        <div className="min-w-0">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: LANDING.green50, color: LANDING.green700, border: `1px solid ${LANDING.green100}` }}
          >
            Dados do seu PDV em decisões reais
          </span>

          <h1
            id="hero-titulo"
            className="mt-5 text-[2.25rem] font-extrabold leading-[1.08] tracking-tight sm:text-5xl xl:text-[3.4rem]"
            style={{ color: LANDING.ink, fontFamily: 'var(--font-display)' }}
          >
            Inteligência de verdade <span style={{ color: LANDING.green600 }}>para o seu supermercado</span>
          </h1>

          <p className="mt-5 max-w-md text-base leading-relaxed sm:text-lg" style={{ color: LANDING.text }}>
            Transforme dados do seu PDV em decisões de compra, preço e estoque.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to="/register"
              className={`inline-flex min-h-[48px] items-center justify-center gap-2 whitespace-nowrap rounded-full px-7 text-base font-semibold text-white no-underline shadow-sm transition-colors hover:bg-[#065f46] ${FOCUS_RING}`}
              style={{ background: LANDING.green900 }}
            >
              Começar grátis <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <a
              href="#como-funciona"
              onClick={(e) => scrollToSection(e, '#como-funciona')}
              className={`inline-flex min-h-[48px] items-center justify-center gap-2.5 whitespace-nowrap rounded-full bg-white px-6 text-base font-semibold no-underline transition-colors hover:bg-slate-50 ${FOCUS_RING}`}
              style={{ color: LANDING.ink, border: `1px solid ${LANDING.line}` }}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: LANDING.green600 }} aria-hidden>
                <Play className="ml-0.5 h-3 w-3 fill-white text-white" />
              </span>
              Ver como funciona
            </a>
          </div>

          <ul className="m-0 mt-8 flex list-none flex-col gap-3 p-0 sm:flex-row sm:flex-wrap sm:gap-x-7">
            {TRUST.map((t) => (
              <li key={t.label} className="flex items-center gap-2 text-sm font-medium" style={{ color: LANDING.text }}>
                <t.icon className="h-5 w-5 shrink-0" style={{ color: LANDING.green600 }} aria-hidden />
                {t.label}
              </li>
            ))}
          </ul>
        </div>

        {/* Card de demonstração */}
        <div className="mx-auto w-full min-w-0 max-w-2xl xl:max-w-none">
          <DemoDashboard />
        </div>
      </div>
    </Container>
  </section>
);

export default Hero;
