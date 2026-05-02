import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import ButtonLink from '../components/common/ButtonLink';
import {
  BarChart3,
  ShoppingCart,
  TrendingUp,
  Map,
  Megaphone,
  Bell,
  PackageSearch,
  ArrowRight,
  CheckCircle2,
  Star,
  Zap,
  Shield,
  Clock,
  ChevronRight,
  Store,
  Users,
  LineChart,
} from 'lucide-react';

/* ── Benefícios hero ── */
const heroStats = [
  { value: '+32%', label: 'aumento médio de margem', sub: 'nos primeiros 90 dias' },
  { value: '-45%', label: 'redução de ruptura', sub: 'com pedido inteligente' },
  { value: '3x', label: 'mais eficiência', sub: 'na decisão de compra' },
];

/* ── Funcionalidades ── */
const features = [
  {
    icon: BarChart3,
    title: 'Painel do dia',
    text: 'Veja o que precisa da sua atenção agora: vendas, estoque baixo, produtos parados e oportunidades do dia.',
    color: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: PackageSearch,
    title: 'Raio-X de cada produto',
    text: 'Saiba quanto vende, qual o giro, quando o preço mudou e se vale a pena manter na gôndola.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: ShoppingCart,
    title: 'Pedido inteligente',
    text: 'Lista de compras automática baseada no que realmente vende. Sem achismo, sem excesso de estoque.',
    color: 'bg-amber-50 text-amber-600',
  },
  {
    icon: TrendingUp,
    title: 'Combos que vendem juntos',
    text: 'Descubra quais produtos seus clientes levam juntos e posicione-os lado a lado para vender mais.',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: Map,
    title: 'Mapa da loja',
    text: 'Organize sua loja visualmente. Veja onde cada setor performa melhor e reposicione para lucrar mais.',
    color: 'bg-rose-50 text-rose-600',
  },
  {
    icon: Megaphone,
    title: 'Promoções com resultado',
    text: 'Crie promoções e veja o resultado real: quanto vendeu antes, durante e depois. Sem achismo.',
    color: 'bg-orange-50 text-orange-600',
  },
  {
    icon: LineChart,
    title: 'Previsão de vendas',
    text: 'Saiba antecipadamente quanto vai vender de cada produto e prepare seu estoque com precisão.',
    color: 'bg-cyan-50 text-cyan-600',
  },
  {
    icon: Bell,
    title: 'Alertas automáticos',
    text: 'Receba avisos quando um produto parar de vender, quando o preço mudar ou quando houver oportunidade.',
    color: 'bg-red-50 text-red-600',
  },
];

/* ── Como funciona ── */
const steps = [
  {
    num: '1',
    title: 'Instale em 5 minutos',
    text: 'Baixe o agente no computador da loja. Ele coleta os dados das vendas automaticamente, sem precisar mexer no sistema.',
  },
  {
    num: '2',
    title: 'Os dados aparecem no painel',
    text: 'Vendas, produtos, preços e tendências são organizados automaticamente em painéis simples e claros.',
  },
  {
    num: '3',
    title: 'Tome decisões melhores',
    text: 'Saiba o que comprar, o que promover e onde posicionar cada produto. Tudo baseado no que realmente vende na sua loja.',
  },
];

/* ── Depoimentos ── */
const testimonials = [
  {
    name: 'Carlos Mendes',
    role: 'Dono — Supermercado Bom Preço',
    text: 'Antes eu decidia no feeling. Agora sei exatamente o que comprar e quanto. Reduzi o desperdício em 40% no primeiro mês.',
    stars: 5,
  },
  {
    name: 'Ana Paula Silva',
    role: 'Gerente — Rede Economia',
    text: 'A parte de combos mudou nosso jogo. Colocamos os produtos certos juntos e as vendas de fim de semana subiram 28%.',
    stars: 5,
  },
  {
    name: 'Roberto Almeida',
    role: 'Comprador — Atacadão Central',
    text: 'A lista de compras inteligente acabou com o excesso de estoque. Economizamos R$12mil por mês em produtos parados.',
    stars: 5,
  },
];

/* ── Planos ── */
const plans = [
  {
    name: 'Essencial',
    price: 'R$ 197',
    period: '/mês',
    desc: 'Para mercados que querem começar a decidir com dados',
    features: ['Painel do dia', 'Até 2.000 produtos', 'Pedido inteligente', 'Alertas automáticos', '1 usuário'],
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
      'Previsão de vendas',
      'Até 5 usuários',
    ],
    cta: 'Escolher Profissional',
    highlight: true,
  },
  {
    name: 'Rede',
    price: 'Sob consulta',
    period: '',
    desc: 'Para redes com múltiplas lojas',
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

/* ── Números ── */
const trustNumbers = [
  { icon: Store, value: '500+', label: 'Supermercados' },
  { icon: Users, value: '2.800+', label: 'Usuários ativos' },
  { icon: PackageSearch, value: '12M+', label: 'Produtos analisados' },
  { icon: TrendingUp, value: '98,5%', label: 'Satisfação' },
];

/* ── Reveal animation hook ── */
const useReveal = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('revealed'); }),
      { threshold: 0.12 },
    );
    el.querySelectorAll('.rv').forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, []);
  return ref;
};

const Landing: React.FC = () => {
  const containerRef = useReveal();

  return (
    <div ref={containerRef} className="min-h-screen bg-white">
      {/* ── Reveal CSS ── */}
      <style>{`
        .rv { opacity: 0; transform: translateY(24px); transition: opacity 0.6s ease, transform 0.6s ease; }
        .revealed { opacity: 1; transform: translateY(0); }
      `}</style>

      {/* ══════ NAVBAR ══════ */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-sm font-extrabold text-white shadow-lg shadow-emerald-600/20">
              MF
            </span>
            <div>
              <p className="text-base font-bold text-gray-900 leading-tight">MercadoFlow</p>
              <p className="text-[11px] font-medium text-gray-400">Inteligência para supermercados</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <a href="#funcionalidades" className="text-sm font-medium text-gray-500 no-underline transition hover:text-gray-900">Funcionalidades</a>
            <a href="#como-funciona" className="text-sm font-medium text-gray-500 no-underline transition hover:text-gray-900">Como funciona</a>
            <a href="#depoimentos" className="text-sm font-medium text-gray-500 no-underline transition hover:text-gray-900">Depoimentos</a>
            <a href="#planos" className="text-sm font-medium text-gray-500 no-underline transition hover:text-gray-900">Planos</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link to="/login" className="hidden rounded-lg px-4 py-2 text-sm font-semibold text-gray-700 no-underline transition hover:bg-gray-50 sm:inline-flex">
              Entrar
            </Link>
            <ButtonLink to="/register" className="!h-10 !min-h-0 !max-h-none !text-sm !px-5">
              Teste grátis
            </ButtonLink>
          </div>
        </div>
      </header>

      {/* ══════ HERO ══════ */}
      <section className="relative overflow-hidden bg-gradient-to-b from-emerald-50/50 to-white pb-20 pt-20 lg:pt-28">
        {/* Decorative elements */}
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-100/40 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 top-1/2 h-72 w-72 rounded-full bg-emerald-50/60 blur-3xl" />

        <div className="rv relative mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-700">
              <Zap className="h-3.5 w-3.5" /> Novo: Mapa da loja com heatmap de vendas
            </span>

            <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              Seu mercado vendendo mais com{' '}
              <span className="bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent">decisões inteligentes</span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-500 sm:text-xl">
              Transforme os dados da sua loja em ações claras: o que comprar, o que promover e onde posicionar cada produto para lucrar mais.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <ButtonLink to="/register" className="!h-14 !min-h-0 !max-h-none !px-8 !text-base">
                Começar grátis por 14 dias <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <a href="#como-funciona" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 no-underline transition hover:text-gray-900">
                Ver como funciona <ChevronRight className="h-4 w-4" />
              </a>
            </div>

            <p className="mt-4 text-xs text-gray-400">Sem cartão de crédito. Cancele quando quiser.</p>
          </div>

          {/* Hero stats */}
          <div className="rv mx-auto mt-16 grid max-w-3xl gap-6 sm:grid-cols-3">
            {heroStats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-sm">
                <p className="text-3xl font-extrabold text-emerald-600">{s.value}</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{s.label}</p>
                <p className="mt-0.5 text-xs text-gray-400">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ TRUST BAR ══════ */}
      <section className="border-y border-gray-100 bg-gray-50/50 py-10">
        <div className="rv mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-10 px-6 sm:gap-16">
          {trustNumbers.map((t) => (
            <div key={t.label} className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
                <t.icon className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-gray-900">{t.value}</p>
                <p className="text-xs text-gray-500">{t.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════ FUNCIONALIDADES ══════ */}
      <section id="funcionalidades" className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="rv mx-auto max-w-2xl text-center">
            <span className="text-sm font-semibold uppercase tracking-wider text-emerald-600">Funcionalidades</span>
            <h2 className="mt-3 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Tudo que seu mercado precisa em um só lugar
            </h2>
            <p className="mt-4 text-gray-500">
              Do estoque à gôndola, do pedido à promoção. Cada funcionalidade foi pensada para o dia a dia do supermercadista.
            </p>
          </div>

          <div className="rv mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <article
                key={f.title}
                className="group flex flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
              >
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${f.color}`}>
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-bold text-gray-900">{f.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-500">{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ COMO FUNCIONA ══════ */}
      <section id="como-funciona" className="bg-gray-50 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="rv mx-auto max-w-2xl text-center">
            <span className="text-sm font-semibold uppercase tracking-wider text-emerald-600">Como funciona</span>
            <h2 className="mt-3 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Simples de instalar. Fácil de usar. Resultados reais.
            </h2>
          </div>

          <div className="rv mx-auto mt-14 grid max-w-4xl gap-8 lg:grid-cols-3">
            {steps.map((s) => (
              <div key={s.num} className="relative flex flex-col items-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-extrabold text-white shadow-lg shadow-emerald-600/20">
                  {s.num}
                </span>
                <h3 className="mt-5 text-lg font-bold text-gray-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{s.text}</p>
              </div>
            ))}
          </div>

          <div className="rv mt-12 text-center">
            <ButtonLink to="/download-agente" className="!h-12 !min-h-0 !max-h-none">
              Baixar agente gratuito <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* ══════ DIFERENCIAL ══════ */}
      <section className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="rv grid gap-12 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="text-sm font-semibold uppercase tracking-wider text-emerald-600">Por que MercadoFlow</span>
              <h2 className="mt-3 text-3xl font-extrabold text-gray-900 sm:text-4xl">
                Feito por quem entende de supermercado
              </h2>
              <p className="mt-4 text-gray-500 leading-relaxed">
                Não somos mais um software genérico. Cada tela, cada métrica e cada alerta foi pensado
                para a realidade do supermercadista brasileiro — do mercadinho de bairro à rede com 20 lojas.
              </p>

              <div className="mt-8 flex flex-col gap-4">
                {[
                  { icon: Shield, text: 'Seus dados seguros — funciona mesmo sem internet' },
                  { icon: Clock, text: 'Instalação em 5 minutos, sem mudar seu sistema' },
                  { icon: Zap, text: 'Resultados visíveis já na primeira semana' },
                  { icon: Users, text: 'Suporte humanizado em português' },
                ].map((d) => (
                  <div key={d.text} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                      <d.icon className="h-4 w-4 text-emerald-600" />
                    </div>
                    <p className="text-sm font-medium text-gray-700 pt-1">{d.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual card grid */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Vendas hoje', val: 'R$ 24.380', change: '+12%', good: true },
                { label: 'Produtos em alerta', val: '7', change: 'precisam atenção', good: false },
                { label: 'Melhor combo', val: 'Carvão + Carne', change: '78% compram juntos', good: true },
                { label: 'Próxima previsão', val: '340 un', change: 'Coca-Cola 2L', good: true },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium text-gray-400">{card.label}</p>
                  <p className="mt-2 text-xl font-bold text-gray-900">{card.val}</p>
                  <p className={`mt-1 text-xs font-semibold ${card.good ? 'text-emerald-600' : 'text-amber-600'}`}>{card.change}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════ DEPOIMENTOS ══════ */}
      <section id="depoimentos" className="bg-gray-50 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="rv mx-auto max-w-2xl text-center">
            <span className="text-sm font-semibold uppercase tracking-wider text-emerald-600">Depoimentos</span>
            <h2 className="mt-3 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Quem usa, recomenda
            </h2>
          </div>

          <div className="rv mt-14 grid gap-6 lg:grid-cols-3">
            {testimonials.map((t) => (
              <article key={t.name} className="flex flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="flex gap-0.5">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-gray-600">"{t.text}"</p>
                <div className="mt-5 border-t border-gray-100 pt-4">
                  <p className="text-sm font-bold text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-400">{t.role}</p>
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
            <span className="text-sm font-semibold uppercase tracking-wider text-emerald-600">Planos</span>
            <h2 className="mt-3 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Escolha o plano ideal para sua loja
            </h2>
            <p className="mt-4 text-gray-500">Todos incluem 14 dias grátis. Sem compromisso.</p>
          </div>

          <div className="rv mx-auto mt-14 grid max-w-5xl gap-6 lg:grid-cols-3">
            {plans.map((p) => (
              <article
                key={p.name}
                className={`relative flex flex-col rounded-2xl border p-7 shadow-sm ${
                  p.highlight
                    ? 'border-emerald-200 bg-emerald-50/30 ring-2 ring-emerald-500/20'
                    : 'border-gray-100 bg-white'
                }`}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-4 py-1 text-xs font-bold text-white shadow">
                    Mais popular
                  </span>
                )}
                <h3 className="text-lg font-bold text-gray-900">{p.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{p.desc}</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-gray-900">{p.price}</span>
                  {p.period && <span className="text-sm text-gray-400">{p.period}</span>}
                </div>
                <ul className="mt-6 flex flex-col gap-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-6">
                  <ButtonLink
                    to="/register"
                    variant={p.highlight ? 'primary' : 'secondary'}
                    className="!h-12 !min-h-0 !max-h-none w-full"
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
      <section className="bg-emerald-600 py-20">
        <div className="rv mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            Pronto para vender mais e desperdiçar menos?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-emerald-100">
            Junte-se a mais de 500 supermercados que já usam o MercadoFlow para tomar decisões melhores todos os dias.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <ButtonLink
              to="/register"
              variant="secondary"
              className="!h-14 !min-h-0 !max-h-none !px-8 !text-base"
            >
              Começar grátis por 14 dias <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
          <p className="mt-4 text-xs text-emerald-200">Sem cartão de crédito. Cancele quando quiser.</p>
        </div>
      </section>

      {/* ══════ FOOTER ══════ */}
      <footer className="border-t border-gray-100 bg-white py-12">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 sm:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
                MF
              </span>
              <span className="text-sm font-bold text-gray-900">MercadoFlow</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-gray-400">
              Inteligência de vendas para supermercados e farmácias. Transforme dados em decisões práticas.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Produto</h4>
            <ul className="mt-3 flex flex-col gap-2">
              <li><a href="#funcionalidades" className="text-sm text-gray-500 no-underline hover:text-gray-900">Funcionalidades</a></li>
              <li><a href="#planos" className="text-sm text-gray-500 no-underline hover:text-gray-900">Planos</a></li>
              <li><Link to="/download-agente" className="text-sm text-gray-500 no-underline hover:text-gray-900">Baixar agente</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Empresa</h4>
            <ul className="mt-3 flex flex-col gap-2">
              <li><a href="#como-funciona" className="text-sm text-gray-500 no-underline hover:text-gray-900">Como funciona</a></li>
              <li><a href="#depoimentos" className="text-sm text-gray-500 no-underline hover:text-gray-900">Depoimentos</a></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Contato</h4>
            <ul className="mt-3 flex flex-col gap-2">
              <li><span className="text-sm text-gray-500">contato@mercadoflow.com</span></li>
              <li>
                <Link to="/super-admin/login" className="text-sm text-gray-400 no-underline hover:text-gray-600">
                  Administração
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-7xl border-t border-gray-100 px-6 pt-6">
          <p className="text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} MercadoFlow. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
