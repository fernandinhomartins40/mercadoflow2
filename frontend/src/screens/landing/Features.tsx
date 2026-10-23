import React from 'react';
import {
  BarChart3,
  Bell,
  LineChart,
  Map,
  Package,
  ShoppingCart,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Container, LANDING, SectionTitle } from './theme';

type Feature = {
  icon: LucideIcon;
  title: string;
  text: string;
  /** Versão curta, para os cards de 2 colunas do celular. */
  short: string;
  /** Cor do ícone (forte) e fundo do quadrado (suave). */
  color: string;
  bg: string;
};

// Textos alinhados ao que o produto faz hoje (ver Landing.tsx antiga e o
// backend): painel com indicadores do dia, HealthScore e giro no catálogo,
// sugestão de reposição, alertas automáticos, comparação antes/durante/depois
// das campanhas, análise de cesta (produtos levados juntos), previsão por
// produto e mapa visual da loja.
const FEATURES: Feature[] = [
  {
    icon: BarChart3,
    title: 'Painel de caixa',
    short: 'Indicadores do dia em tempo real.',
    text: 'Faturamento, ticket médio, transações e principais indicadores do dia, atualizados com as vendas do seu PDV.',
    color: LANDING.green600,
    bg: '#f0fdf4',
  },
  {
    icon: Package,
    title: 'Catálogo inteligente',
    short: 'Saúde e giro de cada produto.',
    text: 'Nota de saúde de 0 a 100 e giro de cada produto: veja quais crescem, quais estabilizam e quais estão sumindo.',
    color: '#2563eb',
    bg: '#eff6ff',
  },
  {
    icon: ShoppingCart,
    title: 'Pedidos inteligentes',
    short: 'Sugestão de reposição.',
    text: 'Sugestões de reposição com base no histórico de vendas e na demanda real da sua loja, já em unidades por embalagem.',
    color: '#d97706',
    bg: '#fffbeb',
  },
  {
    icon: Bell,
    title: 'Avisos do dia',
    short: 'O que pede atenção hoje.',
    text: 'Todo dia, a lista do que pede atenção: hora de comprar, vendas fora do normal, dinheiro parado e promoções que funcionam.',
    color: '#dc2626',
    bg: '#fef2f2',
  },
  {
    icon: Tag,
    title: 'Promoções com resultado',
    short: 'Antes, durante e depois.',
    text: 'Compare as vendas antes, durante e depois de cada campanha e saiba se a promoção trouxe volume ou só tirou margem.',
    color: '#7c3aed',
    bg: '#f5f3ff',
  },
  {
    icon: Users,
    title: 'Conheça seus clientes',
    short: 'O que levam juntos.',
    text: 'Descubra quais produtos seus clientes levam juntos na mesma compra e monte combos e exposições com dados reais.',
    color: '#0891b2',
    bg: '#ecfeff',
  },
  {
    icon: LineChart,
    title: 'Previsão de demanda',
    short: 'Prepare o estoque.',
    text: 'Previsão de vendas por produto com a direção da tendência, para preparar o estoque antes do pico e evitar ruptura.',
    color: '#059669',
    bg: '#ecfdf5',
  },
  {
    icon: Map,
    title: 'Mapa da loja',
    short: 'Desempenho por setor.',
    text: 'Monte o layout visual da sua loja, veja os setores de alto e baixo desempenho e reorganize melhor o seu espaço.',
    color: '#ea580c',
    bg: '#fff7ed',
  },
];

const Features: React.FC = () => (
  <section id="funcionalidades" className="scroll-mt-20 py-12 sm:py-16" style={{ background: LANDING.surface }}>
    <Container>
      <SectionTitle
        badge="Funcionalidades"
        title="Seu supermercado. Decisões mais claras."
        subtitle="Tudo o que você precisa para comprar, precificar e gerir o seu estoque com base em dados reais do seu PDV."
      />

      {/* Celular: 2 colunas com texto curto. Tablet: 2 colunas com o texto todo. Computador: 4 × 2. */}
      <ul className="mt-8 grid grid-cols-2 gap-2.5 sm:mt-10 sm:gap-4 lg:grid-cols-4 lg:gap-5">
        {FEATURES.map(({ icon: Icon, title, text, short, color, bg }) => (
          <li
            key={title}
            className="group flex min-w-0 items-start gap-2.5 rounded-2xl border p-3 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg sm:block sm:p-5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            style={{ background: LANDING.surface, borderColor: LANDING.line, boxShadow: LANDING.shadow }}
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-11 sm:w-11 sm:rounded-xl"
              style={{ background: bg }}
              aria-hidden="true"
            >
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color }} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-bold leading-snug sm:mt-4 sm:text-base" style={{ color: LANDING.ink }}>
                {title}
              </h3>
              <p className="mt-0.5 text-[12px] leading-snug sm:hidden" style={{ color: LANDING.muted }}>
                {short}
              </p>
              <p className="mt-2 hidden text-sm leading-relaxed sm:block" style={{ color: LANDING.text }}>
                {text}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Container>
  </section>
);

export default Features;
