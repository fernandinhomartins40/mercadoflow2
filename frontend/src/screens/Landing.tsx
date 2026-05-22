import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import ButtonLink from '../components/common/ButtonLink';
import {
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  Heart,
  Link2,
  Map,
  Megaphone,
  PackageSearch,
  Shield,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Tag,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
  Activity,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

// ── Reveal on scroll ──────────────────────────────────────────────────────────
const useReveal = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('rv-in'); }),
      { threshold: 0.08 },
    );
    el.querySelectorAll('.rv').forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, []);
  return ref;
};

// ── Data ──────────────────────────────────────────────────────────────────────

const features = [
  {
    icon: Activity,
    title: 'Painel do dia',
    text: 'KPIs de faturamento, ticket médio e transações ao vivo. Alertas automáticos do que pede atenção agora — tudo antes de abrir a primeira gaveta.',
    accent: '#16a34a',
    bg: '#f0fdf4',
  },
  {
    icon: PackageSearch,
    title: 'Catálogo inteligente',
    text: 'HealthScore 0–100 por produto, momentum EMA7/SMA28 e velocidade de giro. Saiba exatamente quais produtos crescem, estabilizam ou somem.',
    accent: '#2563eb',
    bg: '#eff6ff',
  },
  {
    icon: ShoppingCart,
    title: 'Pedido inteligente',
    text: 'Sugestões de reposição baseadas em tração real. Ao criar o pedido, o sistema exibe quais produtos evitar e calcula unidades por embalagem automaticamente.',
    accent: '#d97706',
    bg: '#fffbeb',
  },
  {
    icon: Bell,
    title: 'Alertas de desempenho',
    text: 'Oito detectores estatísticos (Z-score + momentum) identificam: produtos sem venda, pico de demanda, saúde crítica, oportunidade de promoção e combos com lift alto.',
    accent: '#dc2626',
    bg: '#fef2f2',
  },
  {
    icon: Megaphone,
    title: 'Promoções com resultado',
    text: 'Compare faturamento antes, durante e depois de cada campanha. Veja se a promoção gerou volume real ou só canibalização de margem.',
    accent: '#7c3aed',
    bg: '#f5f3ff',
  },
  {
    icon: Link2,
    title: 'Combos que vendem juntos',
    text: 'Análise de market basket com lift, confiança e suporte. Descubra quais produtos seus clientes levam juntos e crie combos com dados reais.',
    accent: '#0891b2',
    bg: '#ecfeff',
  },
  {
    icon: BarChart3,
    title: 'Previsão de demanda',
    text: 'Forecast por produto para os próximos 30 dias com intervalo de confiança e direção de tendência. Prepare estoque antes do pico, não depois.',
    accent: '#059669',
    bg: '#ecfdf5',
  },
  {
    icon: Map,
    title: 'Mapa da loja',
    text: 'Organize o layout visual da sua loja. Identifique setores de alto e baixo desempenho e reposicione produtos para maximizar a conversão.',
    accent: '#ea580c',
    bg: '#fff7ed',
  },
];

const steps = [
  {
    num: '01',
    title: 'Instale o agente em 5 min',
    text: 'Um pequeno programa roda no computador da loja, coleta os dados do seu sistema de PDV e os envia com segurança para a nuvem. Sem trocar nada no seu sistema atual.',
    icon: Store,
  },
  {
    num: '02',
    title: 'Dados organizados automaticamente',
    text: 'Vendas, preços, categorias e tendências são processados e transformados em indicadores prontos para uso — HealthScore, momentum, giro e alertas.',
    icon: Activity,
  },
  {
    num: '03',
    title: 'Decisões melhores a cada dia',
    text: 'Saiba o que comprar, o que promover e o que retirar da gôndola. Cada decisão baseada no que realmente acontece na sua loja, não no feeling.',
    icon: TrendingUp,
  },
];

const testimonials = [
  {
    name: 'Carlos Mendes',
    role: 'Proprietário — Supermercado Bom Preço',
    text: 'Antes eu decidia no feeling. Agora sei exatamente o que comprar e quanto. Reduzi o desperdício em 40% no primeiro mês e o pedido inteligente me economiza horas toda semana.',
    stars: 5,
    highlight: 'Redução de 40% no desperdício',
  },
  {
    name: 'Ana Paula Silva',
    role: 'Gerente Comercial — Rede Economia',
    text: 'A análise de combos mudou nosso jogo. Colocamos os produtos certos lado a lado e as vendas de fim de semana subiram 28%. O alerta de momentum nos avisou antes mesmo da queda acontecer.',
    stars: 5,
    highlight: '+28% nas vendas de fim de semana',
  },
  {
    name: 'Roberto Almeida',
    role: 'Comprador — Atacadão Central',
    text: 'A lista de compras inteligente acabou com o excesso de estoque. Economizamos R$ 12 mil por mês em produtos parados. O HealthScore nos ajuda a identificar o que tirar antes de virar prejuízo.',
    stars: 5,
    highlight: 'R$ 12 mil/mês economizados',
  },
];

const plans = [
  {
    name: 'Essencial',
    price: 'R$ 197',
    period: '/mês',
    desc: 'Para mercados que querem começar a decidir com dados',
    features: [
      'Painel do dia completo',
      'Até 2.000 produtos',
      'Pedido inteligente',
      'Alertas automáticos (5 tipos)',
      '1 PDV / 1 usuário',
    ],
    cta: 'Começar agora',
    highlight: false,
  },
  {
    name: 'Profissional',
    price: 'R$ 397',
    period: '/mês',
    desc: 'Para mercados que querem crescer com inteligência',
    features: [
      'Tudo do Essencial',
      'Produtos ilimitados',
      'Combos e mapa da loja',
      'Promoções com resultado',
      'Previsão de demanda 30 dias',
      'Alertas completos (8 tipos)',
      'Até 5 usuários',
    ],
    cta: 'Escolher Profissional',
    highlight: true,
  },
  {
    name: 'Rede',
    price: 'Sob consulta',
    period: '',
    desc: 'Para redes com múltiplas filiais',
    features: [
      'Tudo do Profissional',
      'Multi-loja centralizado',
      'Comparação entre filiais',
      'API de integração',
      'Suporte dedicado',
      'Usuários ilimitados',
    ],
    cta: 'Falar com vendas',
    highlight: false,
  },
];

// ── Fake dashboard mockup ─────────────────────────────────────────────────────

const MockKPI: React.FC<{ label: string; value: string; change: string; up?: boolean }> = ({ label, value, change, up = true }) => (
  <div className="rounded-xl p-3" style={{ background: up ? '#16a34a' : '#dc2626' }}>
    <p className="text-[10px] font-semibold uppercase tracking-widest text-green-100">{label}</p>
    <p className="mt-1 text-xl font-extrabold text-white">{value}</p>
    <p className="text-[10px] font-medium text-green-200">{change}</p>
  </div>
);

const MockAlert: React.FC<{ icon: React.ReactNode; title: string; badge: string; badgeColor: string; chip: string }> = ({ icon, title, badge, badgeColor, chip }) => (
  <div className="flex items-start gap-2 rounded-lg border-l-4 p-2.5" style={{ borderLeftColor: badgeColor, background: '#f8fafc', border: '1px solid #e2e8f0', borderLeftWidth: 4 }}>
    <span>{icon}</span>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="rounded-md px-1.5 py-0.5 text-[9px] font-bold" style={{ background: badgeColor + '22', color: badgeColor }}>{badge}</span>
        <span className="text-[10px] font-semibold text-slate-700">{title}</span>
      </div>
      <span className="mt-1 inline-block rounded-md px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: '#f1f5f9', color: '#64748b' }}>{chip}</span>
    </div>
  </div>
);

const MockProductRow: React.FC<{ name: string; velocity: string; trend: string; health: number; up?: boolean }> = ({ name, velocity, trend, health, up = true }) => (
  <div className="flex items-center gap-2 rounded-lg px-2 py-1.5" style={{ background: '#f8fafc' }}>
    <div className="h-6 w-6 shrink-0 rounded-md" style={{ background: '#e2e8f0' }} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-[10px] font-semibold text-slate-800">{name}</p>
      <p className="text-[9px] text-slate-400">{velocity} un./dia</p>
    </div>
    <div className="flex items-center gap-1">
      {up ? <TrendingUp className="h-3 w-3 text-green-500" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
      <span className={`text-[10px] font-bold ${up ? 'text-green-600' : 'text-red-500'}`}>{trend}</span>
    </div>
    <div className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: health > 60 ? '#16a34a' : health > 30 ? '#d97706' : '#dc2626' }}>
      {health}
    </div>
  </div>
);

const DashboardMockup: React.FC = () => (
  <div className="relative mx-auto w-full max-w-lg overflow-hidden rounded-2xl shadow-2xl shadow-slate-900/20" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
    {/* Window chrome */}
    <div className="flex items-center gap-1.5 border-b px-4 py-3" style={{ background: '#ffffff', borderColor: '#e2e8f0' }}>
      <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
      <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
      <span className="ml-3 text-[11px] font-medium text-slate-400">MercadoFlow — Painel do dia</span>
    </div>

    <div className="p-4 flex flex-col gap-3">
      {/* KPI row */}
      <div className="grid grid-cols-3 gap-2">
        <MockKPI label="Faturamento" value="R$ 24.380" change="+12% vs semana" up />
        <MockKPI label="Ticket médio" value="R$ 87,40" change="+3,2%" up />
        <MockKPI label="Transações" value="279" change="+8% hoje" up />
      </div>

      {/* Alerts */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Alertas de desempenho</p>
        <MockAlert
          icon={<XCircle className="h-3.5 w-3.5 text-red-500" />}
          title="Coca-Cola 2L sem venda há 9 dias"
          badge="Urgente"
          badgeColor="#dc2626"
          chip="9 dias silencioso · 48 transações anteriores"
        />
        <MockAlert
          icon={<Zap className="h-3.5 w-3.5 text-orange-500" />}
          title="Carvão 5kg — pico de demanda"
          badge="Reposição"
          badgeColor="#d97706"
          chip="Giro 3,2× acima da média · Momentum 1,41"
        />
        <MockAlert
          icon={<Tag className="h-3.5 w-3.5 text-violet-600" />}
          title="Azeite 500ml — preço 14% acima da base"
          badge="Promoção"
          badgeColor="#7c3aed"
          chip="Queda de receita −18% · Ação recomendada"
        />
      </div>

      {/* Product rows */}
      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Catálogo — HealthScore</p>
        <MockProductRow name="Leite Integral 1L" velocity="12,4" trend="+22%" health={88} up />
        <MockProductRow name="Pão de Forma 500g" velocity="8,1" trend="+7%" health={74} up />
        <MockProductRow name="Biscoito Maizena" velocity="1,3" trend="−31%" health={18} up={false} />
      </div>
    </div>
  </div>
);

// ── Section label ─────────────────────────────────────────────────────────────
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest" style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
    {children}
  </span>
);

// ── Component ─────────────────────────────────────────────────────────────────
const Landing: React.FC = () => {
  const containerRef = useReveal();

  return (
    <div ref={containerRef} className="min-h-screen" style={{ background: '#ffffff', color: '#0f172a' }}>
      <style>{`
        .rv { opacity: 0; transform: translateY(28px); transition: opacity 0.55s ease, transform 0.55s ease; }
        .rv.rv-in { opacity: 1; transform: translateY(0); }
        .rv-delay-1 { transition-delay: 0.08s; }
        .rv-delay-2 { transition-delay: 0.16s; }
        .rv-delay-3 { transition-delay: 0.24s; }
        .feature-card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(15,23,42,0.10); }
        .feature-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
      `}</style>

      {/* ══════ NAVBAR ══════ */}
      <header className="sticky top-0 z-50 backdrop-blur-xl" style={{ borderBottom: '1px solid #e2e8f0', background: 'rgba(255,255,255,0.92)' }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl text-xs font-extrabold text-white shadow-lg" style={{ background: '#16a34a', boxShadow: '0 4px 14px rgba(22,163,74,0.30)' }}>
              MF
            </span>
            <div>
              <p className="text-sm font-bold leading-tight" style={{ color: '#0f172a' }}>MercadoFlow</p>
              <p className="text-[11px] font-medium" style={{ color: '#94a3b8' }}>Inteligência para supermercados</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {[
              { href: '#funcionalidades', label: 'Funcionalidades' },
              { href: '#como-funciona', label: 'Como funciona' },
              { href: '#depoimentos', label: 'Resultados' },
              { href: '#planos', label: 'Planos' },
            ].map((n) => (
              <a key={n.href} href={n.href} className="text-sm font-medium no-underline transition-colors" style={{ color: '#64748b' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
              >
                {n.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link to="/login" className="hidden rounded-lg px-4 py-2 text-sm font-semibold no-underline transition sm:inline-flex" style={{ color: '#334155' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Entrar
            </Link>
            <ButtonLink to="/register" className="!h-9 !min-h-0 !max-h-none !text-sm !px-5">
              Teste grátis
            </ButtonLink>
          </div>
        </div>
      </header>

      {/* ══════ HERO ══════ */}
      <section className="relative overflow-hidden pb-20 pt-16 lg:pt-24" style={{ background: 'linear-gradient(160deg, #f0fdf4 0%, #ffffff 50%, #f8fafc 100%)' }}>
        {/* Background grid */}
        <div className="pointer-events-none absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #e2e8f0 1px, transparent 0)',
          backgroundSize: '32px 32px',
          opacity: 0.4,
        }} />
        {/* Green glow */}
        <div className="pointer-events-none absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full blur-3xl" style={{ background: 'rgba(22,163,74,0.08)' }} />
        <div className="pointer-events-none absolute -left-20 top-1/2 h-80 w-80 rounded-full blur-3xl" style={{ background: 'rgba(34,197,94,0.06)' }} />

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            {/* Left — copy */}
            <div>
              <div className="rv">
                <SectionLabel><Zap className="h-3 w-3" /> Novo: alertas com Z-score e momentum</SectionLabel>
              </div>

              <h1 className="rv rv-delay-1 mt-5 text-4xl font-extrabold leading-[1.12] tracking-tight sm:text-5xl lg:text-[3.25rem]" style={{ color: '#0f172a' }}>
                Inteligência de verdade{' '}
                <span style={{ background: 'linear-gradient(135deg, #16a34a, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  para o seu supermercado
                </span>
              </h1>

              <p className="rv rv-delay-2 mt-5 text-lg leading-relaxed" style={{ color: '#64748b' }}>
                Transforme os dados do seu PDV em decisões claras: quais produtos comprar, quais promover, quais retirar — com alertas automáticos e métricas reais, não achismo.
              </p>

              <div className="rv rv-delay-3 mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <ButtonLink to="/register" className="!h-12 !min-h-0 !max-h-none !px-7 !text-base">
                  Começar grátis por 14 dias <ArrowRight className="h-4 w-4" />
                </ButtonLink>
                <a href="#como-funciona" className="inline-flex items-center gap-1.5 text-sm font-semibold no-underline transition-colors" style={{ color: '#64748b' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#0f172a')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                >
                  Ver como funciona <ChevronRight className="h-4 w-4" />
                </a>
              </div>
              <p className="rv mt-3 text-xs" style={{ color: '#94a3b8' }}>Sem cartão de crédito. Cancele quando quiser.</p>

              {/* Trust badges */}
              <div className="rv mt-10 flex flex-wrap gap-5">
                {[
                  { val: '+32%', label: 'aumento de margem' },
                  { val: '−45%', label: 'menos ruptura' },
                  { val: '500+', label: 'supermercados' },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col">
                    <span className="text-2xl font-extrabold" style={{ color: '#16a34a' }}>{s.val}</span>
                    <span className="text-xs font-medium" style={{ color: '#64748b' }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — mockup */}
            <div className="rv">
              <DashboardMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ══════ SOCIAL PROOF BAR ══════ */}
      <section style={{ borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }} className="py-8">
        <div className="rv mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-10 px-6 sm:gap-16">
          {[
            { icon: Store, value: '500+', label: 'Supermercados ativos' },
            { icon: Users, value: '2.800+', label: 'Usuários' },
            { icon: PackageSearch, value: '12M+', label: 'Produtos analisados' },
            { icon: Heart, value: '98,5%', label: 'Satisfação' },
          ].map((t) => (
            <div key={t.label} className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: '#f0fdf4' }}>
                <t.icon className="h-4 w-4" style={{ color: '#16a34a' }} />
              </div>
              <div>
                <p className="text-base font-extrabold" style={{ color: '#0f172a' }}>{t.value}</p>
                <p className="text-xs" style={{ color: '#94a3b8' }}>{t.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════ FUNCIONALIDADES ══════ */}
      <section id="funcionalidades" className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="rv mx-auto max-w-2xl text-center">
            <SectionLabel>Funcionalidades</SectionLabel>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: '#0f172a' }}>
              Cada tela foi feita para o dia a dia do supermercadista
            </h2>
            <p className="mt-4 text-base leading-relaxed" style={{ color: '#64748b' }}>
              Do estoque à gôndola, do pedido à promoção. Oito módulos integrados, um único painel.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <article
                key={f.title}
                className={`rv feature-card rv-delay-${Math.min(i % 4 + 1, 3)} flex flex-col rounded-2xl p-6`}
                style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: f.bg }}>
                  <f.icon className="h-5 w-5" style={{ color: f.accent }} />
                </div>
                <h3 className="mt-4 text-sm font-bold" style={{ color: '#0f172a' }}>{f.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed" style={{ color: '#64748b' }}>{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ ALERT SHOWCASE ══════ */}
      <section style={{ background: '#0f172a' }} className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            {/* Left — copy */}
            <div className="rv">
              <SectionLabel><Bell className="h-3 w-3" /> Alertas automáticos</SectionLabel>
              <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Oito detectores. Dados reais. Ação imediata.
              </h2>
              <p className="mt-4 text-base leading-relaxed" style={{ color: '#94a3b8' }}>
                O sistema analisa o portfólio de produtos a cada hora usando Z-score e momentum (EMA7/SMA28). Quando algo sai do padrão, você recebe um alerta com os números que geraram o disparo e um botão para a ação certa.
              </p>
              <div className="mt-8 flex flex-col gap-3">
                {[
                  { icon: XCircle, color: '#dc2626', text: 'Produto sem venda — detecta silêncio mesmo com histórico ativo' },
                  { icon: Zap, color: '#d97706', text: 'Pico de demanda — avisa antes do estoque acabar' },
                  { icon: Heart, color: '#dc2626', text: 'HealthScore crítico — detecta deterioração em múltiplas dimensões' },
                  { icon: Tag, color: '#7c3aed', text: 'Oportunidade de promoção — preço acima da base + receita caindo' },
                  { icon: Link2, color: '#2563eb', text: 'Combo com alto lift — produto A cresce, produto B fica parado' },
                ].map((d) => (
                  <div key={d.text} className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: d.color + '22' }}>
                      <d.icon className="h-3.5 w-3.5" style={{ color: d.color }} />
                    </div>
                    <p className="pt-0.5 text-sm" style={{ color: '#cbd5e1' }}>{d.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — alert cards */}
            <div className="rv flex flex-col gap-3">
              {[
                {
                  icon: <XCircle className="h-4 w-4" style={{ color: '#dc2626' }} />,
                  border: '#dc2626',
                  badge: 'Urgente', badgeBg: '#fecaca', badgeColor: '#7f1d1d',
                  label: 'Sem vendas', labelBg: '#f1f5f9', labelColor: '#64748b',
                  product: 'Coca-Cola 2L',
                  title: 'Produto sem venda há 9 dias',
                  chips: [{ k: 'Dias silencioso', v: '9' }, { k: 'Trans. anteriores', v: '48' }],
                  ctas: ['Ver produto', 'Criar promoção'],
                },
                {
                  icon: <Zap className="h-4 w-4" style={{ color: '#d97706' }} />,
                  border: '#d97706',
                  badge: 'Alto', badgeBg: '#fed7aa', badgeColor: '#7c2d12',
                  label: 'Reposição', labelBg: '#f1f5f9', labelColor: '#64748b',
                  product: 'Carvão 5 kg',
                  title: 'Saída 3,2× acima da média — risco de ruptura',
                  chips: [{ k: 'Giro', v: '8,4 un./dia' }, { k: 'Momentum', v: '1,41' }],
                  ctas: ['Pedido urgente', 'Ver produto'],
                },
                {
                  icon: <TrendingDown className="h-4 w-4" style={{ color: '#dc2626' }} />,
                  border: '#ef4444',
                  badge: 'Alto', badgeBg: '#fee2e2', badgeColor: '#991b1b',
                  label: 'Giro baixo', labelBg: '#f1f5f9', labelColor: '#64748b',
                  product: 'Biscoito Maizena',
                  title: 'Queda de 31% em receita — produto em retração',
                  chips: [{ k: 'Tendência', v: '−31%' }, { k: 'Health', v: '18/100' }, { k: 'Giro vs. média', v: '22%' }],
                  ctas: ['Ver produto', 'Criar promoção'],
                },
              ].map((a) => (
                <div key={a.title} className="rounded-xl p-3" style={{ background: '#1e293b', border: '1px solid #334155', borderLeft: `4px solid ${a.border}` }}>
                  <div className="flex items-start gap-2.5">
                    <span>{a.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md px-2 py-0.5 text-[10px] font-bold" style={{ background: a.badgeBg, color: a.badgeColor }}>{a.badge}</span>
                        <span className="rounded-md px-2 py-0.5 text-[10px] font-semibold" style={{ background: a.labelBg, color: a.labelColor }}>{a.label}</span>
                      </div>
                      <p className="mt-1 text-[11px] font-semibold" style={{ color: '#94a3b8' }}>{a.product}</p>
                      <p className="mt-0.5 text-sm font-semibold leading-snug text-white">{a.title}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {a.chips.map((c) => (
                          <span key={c.k} className="rounded-md px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#334155', color: '#94a3b8' }}>
                            <span style={{ color: '#64748b', fontWeight: 400 }}>{c.k} </span>{c.v}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {a.ctas.map((cta) => (
                          <span key={cta} className="inline-flex cursor-default items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold" style={{ background: '#334155', color: '#e2e8f0' }}>
                            {cta} <ArrowRight className="h-3 w-3" />
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════ COMO FUNCIONA ══════ */}
      <section id="como-funciona" className="py-20 lg:py-28" style={{ background: '#f8fafc' }}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="rv mx-auto max-w-2xl text-center">
            <SectionLabel>Como funciona</SectionLabel>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: '#0f172a' }}>
              Do PDV ao painel em 5 minutos
            </h2>
            <p className="mt-4 text-base" style={{ color: '#64748b' }}>
              Sem trocar seu sistema. Sem TI. Sem complicação.
            </p>
          </div>

          <div className="rv mt-16 grid gap-8 lg:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.num} className="relative flex flex-col">
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold text-white shadow-lg" style={{ background: '#16a34a', boxShadow: '0 4px 14px rgba(22,163,74,0.30)' }}>
                    {s.num}
                  </span>
                  {i < steps.length - 1 && (
                    <div className="hidden flex-1 border-t border-dashed lg:block" style={{ borderColor: '#e2e8f0' }} />
                  )}
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl mt-5" style={{ background: '#f0fdf4' }}>
                  <s.icon className="h-5 w-5" style={{ color: '#16a34a' }} />
                </div>
                <h3 className="mt-3 text-base font-bold" style={{ color: '#0f172a' }}>{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: '#64748b' }}>{s.text}</p>
              </div>
            ))}
          </div>

          <div className="rv mt-14 text-center">
            <ButtonLink to="/download-agente" className="!h-12 !min-h-0 !max-h-none !px-7">
              Baixar agente gratuito <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <p className="mt-3 text-xs" style={{ color: '#94a3b8' }}>Windows, 7 MB. Instala em menos de 5 minutos.</p>
          </div>
        </div>
      </section>

      {/* ══════ DIFERENCIAIS ══════ */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="rv grid gap-14 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionLabel>Por que MercadoFlow</SectionLabel>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: '#0f172a' }}>
                Feito para o supermercadista brasileiro
              </h2>
              <p className="mt-4 text-base leading-relaxed" style={{ color: '#64748b' }}>
                Não é um software genérico adaptado. Cada métrica, cada alerta e cada tela foi desenhado pensando no dia a dia de quem opera mercado — do mercadinho de bairro à rede com 20 lojas.
              </p>
              <div className="mt-8 flex flex-col gap-4">
                {[
                  { icon: Shield, text: 'Dados seguros — o agente funciona mesmo sem internet' },
                  { icon: Clock, text: 'Instalação em 5 min, sem mudar nada no seu sistema' },
                  { icon: Sparkles, text: 'Alertas em menos de 1 hora após a instalação' },
                  { icon: Users, text: 'Suporte em português, em horário comercial' },
                  { icon: Zap, text: 'Resultados visíveis na primeira semana de uso' },
                ].map((d) => (
                  <div key={d.text} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: '#f0fdf4' }}>
                      <d.icon className="h-4 w-4" style={{ color: '#16a34a' }} />
                    </div>
                    <p className="pt-1 text-sm font-medium" style={{ color: '#334155' }}>{d.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Metric cards grid */}
            <div className="rv grid grid-cols-2 gap-4">
              {[
                { label: 'Faturamento do dia', val: 'R$ 24.380', note: '+12% vs semana passada', good: true, icon: TrendingUp },
                { label: 'Alertas ativos', val: '7', note: '3 urgentes, 4 atenção', good: false, icon: AlertTriangle },
                { label: 'Melhor combo', val: 'Lift 4,1×', note: 'Carvão + Carne · 78% juntos', good: true, icon: Link2 },
                { label: 'Previsão 7 dias', val: '340 un.', note: 'Coca-Cola 2L · tendência alta', good: true, icon: BarChart3 },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl p-5 shadow-sm" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: card.good ? '#f0fdf4' : '#fef2f2' }}>
                      <card.icon className="h-3.5 w-3.5" style={{ color: card.good ? '#16a34a' : '#dc2626' }} />
                    </div>
                    <p className="text-[11px] font-medium" style={{ color: '#94a3b8' }}>{card.label}</p>
                  </div>
                  <p className="mt-3 text-xl font-extrabold" style={{ color: '#0f172a' }}>{card.val}</p>
                  <p className="mt-1 text-xs font-semibold" style={{ color: card.good ? '#16a34a' : '#d97706' }}>{card.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════ DEPOIMENTOS ══════ */}
      <section id="depoimentos" className="py-20 lg:py-28" style={{ background: '#f8fafc' }}>
        <div className="mx-auto max-w-7xl px-6">
          <div className="rv mx-auto max-w-2xl text-center">
            <SectionLabel><Star className="h-3 w-3" /> Resultados reais</SectionLabel>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: '#0f172a' }}>
              Quem usa, recomenda
            </h2>
          </div>

          <div className="rv mt-14 grid gap-6 lg:grid-cols-3">
            {testimonials.map((t) => (
              <article key={t.name} className="flex flex-col rounded-2xl p-6 shadow-sm" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                {/* Highlight result */}
                <div className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                  <TrendingUp className="h-3 w-3" /> {t.highlight}
                </div>
                <div className="mt-4 flex gap-0.5">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed" style={{ color: '#475569' }}>"{t.text}"</p>
                <div className="mt-5 border-t pt-4" style={{ borderColor: '#e2e8f0' }}>
                  <p className="text-sm font-bold" style={{ color: '#0f172a' }}>{t.name}</p>
                  <p className="text-xs" style={{ color: '#94a3b8' }}>{t.role}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ PLANOS ══════ */}
      <section id="planos" className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="rv mx-auto max-w-2xl text-center">
            <SectionLabel>Planos</SectionLabel>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: '#0f172a' }}>
              Escolha o plano ideal para a sua loja
            </h2>
            <p className="mt-4 text-base" style={{ color: '#64748b' }}>Todos incluem 14 dias grátis, sem cartão de crédito.</p>
          </div>

          <div className="rv mx-auto mt-14 grid max-w-5xl gap-6 lg:grid-cols-3">
            {plans.map((p) => (
              <article
                key={p.name}
                className="relative flex flex-col rounded-2xl p-7 shadow-sm"
                style={p.highlight
                  ? { background: '#ffffff', border: '2px solid #16a34a', boxShadow: '0 0 0 4px rgba(22,163,74,0.08)' }
                  : { background: '#ffffff', border: '1px solid #e2e8f0' }}
              >
                {p.highlight && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold text-white shadow-md" style={{ background: '#16a34a' }}>
                    Mais popular
                  </span>
                )}
                <h3 className="text-base font-bold" style={{ color: '#0f172a' }}>{p.name}</h3>
                <p className="mt-1 text-sm" style={{ color: '#64748b' }}>{p.desc}</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold" style={{ color: '#0f172a' }}>{p.price}</span>
                  {p.period && <span className="text-sm" style={{ color: '#94a3b8' }}>{p.period}</span>}
                </div>
                <ul className="mt-6 flex flex-col gap-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm" style={{ color: '#475569' }}>
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#16a34a' }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-7">
                  <ButtonLink
                    to="/register"
                    variant={p.highlight ? 'primary' : 'secondary'}
                    className="!h-11 !min-h-0 !max-h-none w-full"
                  >
                    {p.cta}
                  </ButtonLink>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ CTA FINAL ══════ */}
      <section style={{ background: '#0f172a' }} className="py-20">
        <div className="rv mx-auto max-w-3xl px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold" style={{ background: 'rgba(22,163,74,0.15)', color: '#4ade80', border: '1px solid rgba(22,163,74,0.25)' }}>
            <Sparkles className="h-3.5 w-3.5" /> 14 dias grátis, sem cartão
          </span>
          <h2 className="mt-5 text-3xl font-extrabold text-white sm:text-4xl">
            Pronto para decidir com dados, não com achismo?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base" style={{ color: '#94a3b8' }}>
            Junte-se a mais de 500 supermercados que já usam o MercadoFlow para crescer com inteligência todos os dias.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <ButtonLink to="/register" className="!h-12 !min-h-0 !max-h-none !px-8 !text-base">
              Começar grátis agora <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <a href="#como-funciona" className="text-sm font-semibold no-underline transition-colors" style={{ color: '#94a3b8' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#e2e8f0')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
            >
              Ver como funciona
            </a>
          </div>
        </div>
      </section>

      {/* ══════ FOOTER ══════ */}
      <footer style={{ borderTop: '1px solid #1e293b', background: '#0f172a' }} className="py-14">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 sm:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ background: '#16a34a' }}>
                MF
              </span>
              <span className="text-sm font-bold text-white">MercadoFlow</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed" style={{ color: '#64748b' }}>
              Inteligência de vendas para supermercados. Transforme dados do seu PDV em decisões práticas.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>Produto</h4>
            <ul className="mt-4 flex flex-col gap-2.5">
              {[
                { href: '#funcionalidades', label: 'Funcionalidades' },
                { href: '#planos', label: 'Planos' },
                { to: '/download-agente', label: 'Baixar agente' },
              ].map((l) => (
                <li key={l.label}>
                  {l.to ? (
                    <Link to={l.to} className="text-sm no-underline transition-colors" style={{ color: '#64748b' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#e2e8f0')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                    >{l.label}</Link>
                  ) : (
                    <a href={l.href} className="text-sm no-underline transition-colors" style={{ color: '#64748b' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#e2e8f0')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                    >{l.label}</a>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>Empresa</h4>
            <ul className="mt-4 flex flex-col gap-2.5">
              {[
                { href: '#como-funciona', label: 'Como funciona' },
                { href: '#depoimentos', label: 'Resultados' },
              ].map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-sm no-underline transition-colors" style={{ color: '#64748b' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#e2e8f0')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                  >{l.label}</a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#475569' }}>Contato</h4>
            <ul className="mt-4 flex flex-col gap-2.5">
              <li><span className="text-sm" style={{ color: '#64748b' }}>contato@mercadoflow.com</span></li>
              <li>
                <Link to="/super-admin/login" className="text-sm no-underline transition-colors" style={{ color: '#334155' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#64748b')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#334155')}
                >Administração</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mx-auto mt-12 max-w-7xl border-t px-6 pt-6" style={{ borderColor: '#1e293b' }}>
          <p className="text-center text-xs" style={{ color: '#475569' }}>
            &copy; {new Date().getFullYear()} MercadoFlow. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
