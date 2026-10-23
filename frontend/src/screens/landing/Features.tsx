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
    text: 'Faturamento, ticket médio, transações e principais indicadores do dia, atualizados com as vendas do seu PDV.',
    color: LANDING.green600,
    bg: '#f0fdf4',
  },
  {
    icon: Package,
    title: 'Catálogo inteligente',
    text: 'Nota de saúde de 0 a 100 e giro de cada produto: veja quais crescem, quais estabilizam e quais estão sumindo.',
    color: '#2563eb',
    bg: '#eff6ff',
  },
  {
    icon: ShoppingCart,
    title: 'Pedidos inteligentes',
    text: 'Sugestões de reposição com base no histórico de vendas e na demanda real da sua loja, já em unidades por embalagem.',
    color: '#d97706',
    bg: '#fffbeb',
  },
  {
    icon: Bell,
    title: 'Avisos do dia',
    text: 'Todo dia, a lista do que pede atenção: hora de comprar, vendas fora do normal, dinheiro parado e promoções que funcionam.',
    color: '#dc2626',
    bg: '#fef2f2',
  },
  {
    icon: Tag,
    title: 'Promoções com resultado',
    text: 'Compare as vendas antes, durante e depois de cada campanha e saiba se a promoção trouxe volume ou só tirou margem.',
    color: '#7c3aed',
    bg: '#f5f3ff',
  },
  {
    icon: Users,
    title: 'Conheça seus clientes',
    text: 'Descubra quais produtos seus clientes levam juntos na mesma compra e monte combos e exposições com dados reais.',
    color: '#0891b2',
    bg: '#ecfeff',
  },
  {
    icon: LineChart,
    title: 'Previsão de demanda',
    text: 'Previsão de vendas por produto com a direção da tendência, para preparar o estoque antes do pico e evitar ruptura.',
    color: '#059669',
    bg: '#ecfdf5',
  },
  {
    icon: Map,
    title: 'Mapa da loja',
    text: 'Monte o layout visual da sua loja, veja os setores de alto e baixo desempenho e reorganize melhor o seu espaço.',
    color: '#ea580c',
    bg: '#fff7ed',
  },
];

const Features: React.FC = () => (
  <section id="funcionalidades" className="scroll-mt-20 py-16 sm:py-20" style={{ background: LANDING.surface }}>
    <Container>
      <SectionTitle
        badge="Funcionalidades"
        title="Seu supermercado. Decisões mais claras."
        subtitle="Tudo o que você precisa para comprar, precificar e gerir o seu estoque com base em dados reais do seu PDV."
      />

      <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, text, color, bg }) => (
          <li
            key={title}
            className="group rounded-2xl border p-5 transition duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            style={{ background: LANDING.surface, borderColor: LANDING.line, boxShadow: LANDING.shadow }}
          >
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: bg }}
              aria-hidden="true"
            >
              <Icon className="h-5 w-5" style={{ color }} strokeWidth={2.2} />
            </div>
            <h3 className="mt-4 text-base font-bold" style={{ color: LANDING.ink }}>
              {title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: LANDING.text }}>
              {text}
            </p>
          </li>
        ))}
      </ul>
    </Container>
  </section>
);

export default Features;
