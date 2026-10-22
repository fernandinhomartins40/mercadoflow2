import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import ButtonLink from '../components/common/ButtonLink';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  EyeOff,
  Factory,
  FileSignature,
  LogIn,
  Map,
  MapPin,
  PackageCheck,
  PieChart,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  TrendingUp,
  UserX,
} from 'lucide-react';

/**
 * Página pública do MercadoFlow Indústria (docs/PROPOSTA-INDUSTRIA.md): o
 * fabricante entende o produto e entra no portal pelo mesmo login do painel.
 * Mesmo visual da landing principal.
 */

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

const CONTACT = 'mailto:fuseagencia10@gmail.com?subject=MercadoFlow%20Ind%C3%BAstria';

const sees = [
  { icon: TrendingUp, title: 'Venda na gôndola', text: 'Unidades e faturamento de cada produto seu por dia e por semana, direto das notas do caixa.', accent: '#16a34a', bg: '#f0fdf4' },
  { icon: Tag, title: 'Preço praticado', text: 'O menor, o médio e o maior preço cobrado no varejo em cada cidade.', accent: '#2563eb', bg: '#eff6ff' },
  { icon: MapPin, title: 'Por UF, cidade e bairro', text: 'Onde o produto gira e onde não aparece, até o nível de bairro quando há lojas suficientes.', accent: '#7c3aed', bg: '#f5f3ff' },
  { icon: AlertTriangle, title: 'Possível ruptura', text: 'Quantas lojas vendiam o produto nas 4 semanas anteriores e pararam na última.', accent: '#dc2626', bg: '#fef2f2' },
  { icon: Receipt, title: 'Efeito das promoções', text: 'Quanto do volume saiu com desconto e como a venda reagiu.', accent: '#d97706', bg: '#fffbeb' },
  { icon: Truck, title: 'Entradas (sell-in)', text: 'O que entrou nas lojas pelas notas de compra, para comparar com o que saiu.', accent: '#0891b2', bg: '#ecfeff' },
  { icon: Clock, title: 'Venda por hora', text: 'Os horários de pico do seu produto nas últimas 48 horas, por cidade.', accent: '#db2777', bg: '#fdf2f8' },
  { icon: PieChart, title: 'Participação na categoria', text: 'A fatia do seu produto no total da categoria, sem nome nem número do concorrente.', accent: '#4f46e5', bg: '#eef2ff' },
];

const never = [
  { icon: Store, title: 'Qual mercado vendeu', text: 'Cada número soma várias lojas. Nenhuma loja sozinha pode pesar demais nele, e lugar com poucas lojas não aparece.' },
  { icon: EyeOff, title: 'Produto de concorrente', text: 'Você vê só os GTINs aprovados na sua carteira, com prova de que são seus: prefixo GS1, documento ou licença.' },
  { icon: UserX, title: 'Dado de consumidor', text: 'Nenhum CPF, nota ou cliente sai do supermercado. O que chega ao portal já é agregado e anônimo.' },
];

const steps = [
  { n: '01', icon: Building2, title: 'Cadastro da empresa', text: 'Você envia CNPJ, marcas e prefixos GS1. A nossa equipe confere o cadastro.' },
  { n: '02', icon: PackageCheck, title: 'Carteira de produtos', text: 'Você indica os GTINs que quer acompanhar. Cada um é liberado só com prova de titularidade.' },
  { n: '03', icon: FileSignature, title: 'Contrato e área', text: 'Escolha o pacote e a área: cidades, UFs ou o Brasil inteiro. Antes de ativar, revisamos com você o que vai aparecer.' },
  { n: '04', icon: BarChart3, title: 'Dados no portal', text: 'Pronto: a venda dos seus produtos aparece no portal e é atualizada ao longo do dia.' },
];

const plans = [
  { name: 'Essencial', area: 'Até 3 cidades', items: ['Venda na gôndola', 'Preço praticado', 'Possível ruptura'], highlight: false },
  { name: 'Regional', area: 'Até 3 UFs', items: ['Tudo do Essencial', 'Efeito das promoções', 'Entradas (sell-in)', 'Venda por hora'], highlight: true },
  { name: 'Nacional', area: 'Brasil inteiro', items: ['Tudo do Regional', 'Participação na categoria', 'Exportação dos dados'], highlight: false },
];

const SectionLabel: React.FC<{ children: React.ReactNode; dark?: boolean }> = ({ children, dark }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest"
    style={dark
      ? { background: 'rgba(22,163,74,0.15)', color: '#4ade80', border: '1px solid rgba(22,163,74,0.25)' }
      : { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
    {children}
  </span>
);

/** Prévia do portal: ilustrativa, sem dado real de nenhuma loja. */
const PortalMockup: React.FC = () => (
  <div className="relative" aria-hidden="true">
    <div className="overflow-hidden rounded-2xl" style={{ background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 30px 80px -20px rgba(15,23,42,0.25)' }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold text-white" style={{ background: '#0F3A29' }}>IN</span>
          <span className="text-xs font-bold" style={{ color: '#0f172a' }}>Portal da indústria</span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: '#f0fdf4', color: '#16a34a' }}>
          <ShieldCheck className="h-3 w-3" /> Dados anônimos
        </span>
      </div>
      <div className="p-5">
        <p className="text-sm font-bold leading-snug" style={{ color: '#0f172a' }}>
          Seus produtos venderam <span style={{ background: '#d9f99d', padding: '0 4px', borderRadius: 4 }}>48.210 unidades</span> nos últimos 7 dias, +6,4% sobre a semana anterior.
        </p>
        <div className="mt-4 flex h-24 items-end gap-1.5">
          {[38, 52, 45, 61, 58, 72, 66, 80, 74, 88, 83, 95].map((h, i) => (
            <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i === 11 ? '#16a34a' : '#bbf7d0' }} />
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            { city: 'Campinas (SP)', v: '+12%', up: true },
            { city: 'Uberlândia (MG)', v: '+8%', up: true },
            { city: 'Londrina (PR)', v: '-4%', up: false },
            { city: 'Goiânia (GO)', v: '+3%', up: true },
          ].map((c) => (
            <div key={c.city} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: '#f8fafc', border: '1px solid #f1f5f9' }}>
              <span className="text-[11px] font-medium" style={{ color: '#334155' }}>{c.city}</span>
              <span className="text-[11px] font-bold" style={{ color: c.up ? '#16a34a' : '#dc2626' }}>{c.v}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: '#dc2626' }} />
          <span className="text-[11px] font-medium" style={{ color: '#991b1b' }}>Possível ruptura: 4 de 11 lojas pararam de vender em Londrina</span>
        </div>
      </div>
    </div>
    <p className="mt-3 text-center text-[11px]" style={{ color: '#94a3b8' }}>Tela ilustrativa</p>
  </div>
);

const IndustryLanding: React.FC = () => {
  const containerRef = useReveal();

  return (
    <div ref={containerRef} className="min-h-screen" style={{ background: '#ffffff', color: '#0f172a' }}>
      <style>{`
        .rv { opacity: 0; transform: translateY(28px); transition: opacity 0.55s ease, transform 0.55s ease; }
        .rv.rv-in { opacity: 1; transform: translateY(0); }
        .rv-delay-1 { transition-delay: 0.08s; }
        .rv-delay-2 { transition-delay: 0.16s; }
        .rv-delay-3 { transition-delay: 0.24s; }
        .feature-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .feature-card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(15,23,42,0.10); }
        .lp-link { color: #64748b; transition: color .15s; }
        .lp-link:hover { color: #0f172a; }
        .lp-link-dark { color: #64748b; transition: color .15s; }
        .lp-link-dark:hover { color: #e2e8f0; }
        @media (prefers-reduced-motion: reduce) { .rv { opacity: 1; transform: none; transition: none; } }
      `}</style>

      {/* ══════ NAVBAR ══════ */}
      <header className="sticky top-0 z-50 backdrop-blur-xl" style={{ borderBottom: '1px solid #e2e8f0', background: 'rgba(255,255,255,0.92)' }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2 no-underline" aria-label="MercadoFlow, página inicial">
            <img src="/logomercadoflow-color.png" alt="MercadoFlow" className="h-8 w-auto" />
            <span className="hidden rounded-full px-2.5 py-0.5 text-xs font-bold sm:inline" style={{ background: '#0F3A29', color: '#d9f99d' }}>Indústria</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex" aria-label="Seções">
            <a href="#o-que-ve" className="lp-link text-sm font-medium no-underline">O que você vê</a>
            <a href="#privacidade" className="lp-link text-sm font-medium no-underline">Privacidade</a>
            <a href="#como-funciona" className="lp-link text-sm font-medium no-underline">Como funciona</a>
            <a href="#vender" className="lp-link text-sm font-medium no-underline">Vender às lojas</a>
            <a href="#pacotes" className="lp-link text-sm font-medium no-underline">Pacotes</a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <a href={CONTACT} className="hidden rounded-lg px-4 py-2 text-sm font-semibold no-underline sm:inline-flex" style={{ color: '#334155' }}>
              Falar com a gente
            </a>
            <ButtonLink to="/login" className="!h-9 !min-h-0 !max-h-none !px-5 !text-sm">
              <LogIn className="h-4 w-4" /> Acessar o painel
            </ButtonLink>
          </div>
        </div>
      </header>

      {/* ══════ HERO ══════ */}
      <section className="relative overflow-hidden pb-20 pt-16 lg:pt-24" style={{ background: 'linear-gradient(160deg, #f0fdf4 0%, #ffffff 50%, #f8fafc 100%)' }}>
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #e2e8f0 1px, transparent 0)', backgroundSize: '32px 32px', opacity: 0.4 }} />
        <div className="pointer-events-none absolute -right-40 -top-40 h-[500px] w-[500px] rounded-full blur-3xl" style={{ background: 'rgba(22,163,74,0.08)' }} />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div>
              <div className="rv"><SectionLabel><Factory className="h-3 w-3" /> MercadoFlow Indústria</SectionLabel></div>

              <h1 className="rv rv-delay-1 mt-5 text-4xl font-extrabold leading-[1.12] tracking-tight sm:text-5xl lg:text-[3.25rem]" style={{ color: '#0f172a' }}>
                O giro real dos seus produtos{' '}
                <span style={{ background: 'linear-gradient(135deg, #16a34a, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  na gôndola
                </span>
              </h1>

              <p className="rv rv-delay-2 mt-5 text-lg leading-relaxed" style={{ color: '#64748b' }}>
                Venda, preço praticado e possível ruptura dos seus produtos por UF, cidade e bairro, a partir das notas emitidas nos caixas dos supermercados. Os dados chegam no mesmo dia, não semanas depois, e sem identificar nenhuma loja.
              </p>

              <div className="rv rv-delay-3 mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <ButtonLink to="/login" className="!h-12 !min-h-0 !max-h-none !px-7 !text-base">
                  Acessar o painel <ArrowRight className="h-4 w-4" />
                </ButtonLink>
                <a href={CONTACT} className="inline-flex h-12 items-center gap-1.5 rounded-full px-6 text-base font-semibold no-underline"
                  style={{ border: '1px solid #cbd5e1', color: '#0f172a', background: '#ffffff' }}>
                  Quero contratar
                </a>
              </div>
              <p className="rv mt-3 text-xs" style={{ color: '#94a3b8' }}>Já é cliente? Entre com o e-mail e a senha que a nossa equipe enviou.</p>

              <div className="rv mt-10 flex flex-wrap gap-6">
                {[
                  { val: 'NFC-e', label: 'item a item, do caixa' },
                  { val: 'Mesmo dia', label: 'em vez de semanas' },
                  { val: '100% anônimo', label: 'nenhuma loja identificada' },
                ].map((s) => (
                  <div key={s.label} className="flex flex-col">
                    <span className="text-2xl font-extrabold" style={{ color: '#16a34a' }}>{s.val}</span>
                    <span className="text-xs font-medium" style={{ color: '#64748b' }}>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rv"><PortalMockup /></div>
          </div>
        </div>
      </section>

      {/* ══════ O QUE VOCÊ VÊ ══════ */}
      <section id="o-que-ve" className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="rv mx-auto max-w-2xl text-center">
            <SectionLabel>O que você vê</SectionLabel>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: '#0f172a' }}>
              O que acontece com o seu produto depois que ele sai da fábrica
            </h2>
            <p className="mt-4 text-base leading-relaxed" style={{ color: '#64748b' }}>
              Tudo calculado a partir das notas fiscais emitidas nos caixas dos supermercados que usam o MercadoFlow.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {sees.map((f, i) => (
              <article key={f.title} className={`rv feature-card rv-delay-${Math.min((i % 4) + 1, 3)} flex flex-col rounded-2xl p-6`}
                style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
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

      {/* ══════ PRIVACIDADE ══════ */}
      <section id="privacidade" style={{ background: '#0f172a' }} className="py-20 lg:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-start gap-14 lg:grid-cols-2">
            <div className="rv">
              <SectionLabel dark><ShieldCheck className="h-3 w-3" /> Privacidade</SectionLabel>
              <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Dado de mercado sem expor nenhum mercado
              </h2>
              <p className="mt-5 text-base leading-relaxed" style={{ color: '#94a3b8' }}>
                O supermercado que gera o dado continua protegido, e você recebe um número em que pode confiar. As regras de anonimato valem no próprio banco de dados, e não só na tela: um recorte com poucas lojas não aparece.
              </p>
              <ul className="mt-8 flex flex-col gap-3">
                {['Toda consulta fica registrada', 'Recortes pequenos ficam de fora automaticamente', 'Você só vê os produtos comprovadamente seus'].map((t) => (
                  <li key={t} className="flex items-center gap-3 text-sm" style={{ color: '#cbd5e1' }}>
                    <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#4ade80' }} /> {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-4">
              <p className="rv text-xs font-semibold uppercase tracking-widest" style={{ color: '#64748b' }}>O que você nunca vê</p>
              {never.map((n, i) => (
                <div key={n.title} className={`rv rv-delay-${i + 1} flex gap-4 rounded-2xl p-5`} style={{ background: '#1e293b', border: '1px solid #334155' }}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(220,38,38,0.12)' }}>
                    <n.icon className="h-5 w-5" style={{ color: '#f87171' }} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{n.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed" style={{ color: '#94a3b8' }}>{n.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════ COMO FUNCIONA ══════ */}
      <section id="como-funciona" className="py-20 lg:py-28" style={{ background: '#f8fafc' }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="rv mx-auto max-w-2xl text-center">
            <SectionLabel>Como funciona</SectionLabel>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: '#0f172a' }}>Do cadastro ao dado em quatro passos</h2>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <div key={s.n} className={`rv rv-delay-${Math.min(i + 1, 3)} rounded-2xl p-6`} style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: '#f0fdf4' }}>
                    <s.icon className="h-5 w-5" style={{ color: '#16a34a' }} />
                  </div>
                  <span className="text-3xl font-extrabold" style={{ color: '#e2e8f0' }}>{s.n}</span>
                </div>
                <h3 className="mt-4 text-sm font-bold" style={{ color: '#0f172a' }}>{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: '#64748b' }}>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════ VENDER ÀS LOJAS ══════ */}
      <section id="vender" className="py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="rv">
              <SectionLabel><ShoppingCart className="h-3 w-3" /> Vender às lojas</SectionLabel>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: '#0f172a' }}>
                Venda direto ao supermercado, respeitando os seus distribuidores
              </h2>
              <p className="mt-4 text-base leading-relaxed" style={{ color: '#64748b' }}>
                Catálogo, tabela de preço por região, campanhas e pedidos dentro do painel que o supermercadista já usa. Onde você tem distribuidor exclusivo, a sua campanha chega à loja por ele e o pedido vai para ele.
              </p>
              <ul className="mt-6 flex flex-col gap-3">
                {[
                  'Indústria pequena vende direto; a grande, pelo distribuidor da área',
                  'Contas atendidas direto continuam suas, mesmo em área exclusiva',
                  'A loja só se identifica quando faz o pedido ou autoriza a sua empresa',
                  'Distribuidores e atacadistas também vendem pela plataforma',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm" style={{ color: '#334155' }}>
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#16a34a' }} /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rv grid gap-4 sm:grid-cols-2">
              {[
                { icon: Tag, title: 'Preço por região', text: 'Tabelas por UF ou cidade, com desconto por quantidade.' },
                { icon: Receipt, title: 'Campanhas', text: 'Condição especial para um público de lojas, com prazo.' },
                { icon: Truck, title: 'Pedido e entrega', text: 'Confirme, registre a nota e acompanhe a entrega.' },
                { icon: Store, title: 'Clientes', text: 'As lojas que compraram ou autorizaram a sua empresa.' },
              ].map((c) => (
                <div key={c.title} className="feature-card rounded-2xl p-5" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: '#f0fdf4' }}>
                    <c.icon className="h-5 w-5" style={{ color: '#16a34a' }} />
                  </div>
                  <h3 className="mt-3 text-sm font-bold" style={{ color: '#0f172a' }}>{c.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: '#64748b' }}>{c.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════ PACOTES ══════ */}
      <section id="pacotes" className="py-20 lg:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="rv mx-auto max-w-2xl text-center">
            <SectionLabel>Pacotes</SectionLabel>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: '#0f172a' }}>Você paga pelos produtos que acompanha</h2>
            <p className="mt-4 text-base leading-relaxed" style={{ color: '#64748b' }}>
              A cobrança é por produto acompanhado por mês, em contrato anual. O pacote define a área e os recursos.
            </p>
          </div>

          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {plans.map((p, i) => (
              <div key={p.name} className={`rv rv-delay-${i + 1} flex flex-col rounded-2xl p-7`}
                style={p.highlight
                  ? { background: '#0F3A29', color: '#ffffff', boxShadow: '0 30px 60px -25px rgba(15,58,41,0.6)' }
                  : { background: '#ffffff', border: '1px solid #e2e8f0' }}>
                <h3 className="text-lg font-extrabold">{p.name}</h3>
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: p.highlight ? '#bbf7d0' : '#16a34a' }}>
                  <Map className="h-4 w-4" /> {p.area}
                </p>
                <ul className="mt-6 flex flex-1 flex-col gap-3">
                  {p.items.map((it) => (
                    <li key={it} className="flex items-start gap-2.5 text-sm" style={{ color: p.highlight ? '#e2e8f0' : '#334155' }}>
                      <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: p.highlight ? '#d9f99d' : '#16a34a' }} /> {it}
                    </li>
                  ))}
                </ul>
                <a href={CONTACT} className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold no-underline"
                  style={p.highlight ? { background: '#d9f99d', color: '#0F3A29' } : { border: '1px solid #cbd5e1', color: '#0f172a' }}>
                  Pedir proposta <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            ))}
          </div>
          <p className="rv mt-6 text-center text-xs" style={{ color: '#94a3b8' }}>
            <Download className="mr-1 inline h-3.5 w-3.5" />No pacote Nacional, os dados também podem ser exportados em planilha.
          </p>
        </div>
      </section>

      {/* ══════ CTA FINAL ══════ */}
      <section style={{ background: '#0f172a' }} className="py-20">
        <div className="rv mx-auto max-w-3xl px-4 text-center sm:px-6">
          <SectionLabel dark><Factory className="h-3.5 w-3.5" /> MercadoFlow Indústria</SectionLabel>
          <h2 className="mt-5 text-3xl font-extrabold text-white sm:text-4xl">Veja onde o seu produto vende e onde ele falta</h2>
          <p className="mx-auto mt-4 max-w-xl text-base" style={{ color: '#94a3b8' }}>
            Fale com a nossa equipe para montar o contrato. Se a sua empresa já tem acesso, entre no painel.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <ButtonLink to="/login" className="!h-12 !min-h-0 !max-h-none !bg-[#d9f99d] !px-8 !text-base !text-[#0F3A29] hover:!bg-[#bef264]">
              <LogIn className="h-4 w-4" /> Acessar o painel
            </ButtonLink>
            <a href={CONTACT} className="lp-link-dark text-sm font-semibold no-underline">Falar com a gente</a>
          </div>
        </div>
      </section>

      {/* ══════ FOOTER ══════ */}
      <footer style={{ borderTop: '1px solid #1e293b', background: '#0f172a' }} className="py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <img src="/logomercadoflow-branco.png" alt="MercadoFlow" className="h-7 w-auto" />
          <nav className="flex flex-wrap items-center justify-center gap-6" aria-label="Rodapé">
            <Link to="/" className="lp-link-dark text-sm no-underline">Para supermercados</Link>
            <Link to="/login" className="lp-link-dark text-sm no-underline">Acessar o painel</Link>
            <span className="text-sm" style={{ color: '#64748b' }}>fuseagencia10@gmail.com</span>
          </nav>
          <p className="text-xs" style={{ color: '#475569' }}>&copy; {new Date().getFullYear()} MercadoFlow</p>
        </div>
      </footer>
    </div>
  );
};

export default IndustryLanding;
