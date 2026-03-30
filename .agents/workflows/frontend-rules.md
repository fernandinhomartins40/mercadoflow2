---
description: Regras obrigatórias para implementação no frontend MercadoFlow
---

# Regras do Frontend — MercadoFlow

Estas regras são **obrigatórias** para qualquer IA ou desenvolvedor implementando funcionalidades no frontend do MercadoFlow. Siga cada item à risca.

---

## 1. Idioma — Português Brasileiro (pt-BR) com UTF-8

### Regra absoluta
- **TODO texto visível ao usuário** deve estar em **português brasileiro (pt-BR)**.
- Isso inclui: labels, placeholders, mensagens de erro, títulos, subtítulos, tooltips, aria-labels, hints, kickers, botões, opções de select, estados vazios, loading, e qualquer string visível na interface.
- **NUNCA** use inglês em textos voltados ao usuário. Variáveis, nomes de componentes, props e código podem ser em inglês, mas a camada de apresentação é sempre pt-BR.

### Encoding
- O charset do projeto é **UTF-8**. O `index.html` declara `<meta charset="UTF-8" />` e `<html lang="pt-BR">`.
- Arquivos devem ser salvos com encoding **UTF-8 sem BOM**.
- **Nunca** salve arquivos com encoding Latin-1/ISO-8859-1. Isso gera mojibake (ex: `Visão` vira `VisÃ£o`).
- Se encontrar mojibake em um arquivo existente, **corrija imediatamente** antes de adicionar código.

### Formatação de dados
- Datas: formato brasileiro `dd/mm/aaaa` ou `toLocaleString('pt-BR')`.
- Moeda: `new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- Números: separador decimal `,` e separador de milhar `.`.
- Use os utilitários de `utils/formatters.ts` — **nunca duplique formatadores**.

---

## 2. Componentes Reutilizáveis

### Regra
Antes de criar um novo componente, **verifique se já existe** em:
- `components/common/` — componentes genéricos (Button, Card, Modal, Pagination, etc.)
- `components/dashboard/` — componentes de painel (MetricsCard, PageHero, PanelSection, etc.)
- `components/layout/` — componentes de layout (Layout, Sidebar, WorkspaceSidebar, etc.)
- `utils/formatters.ts` — funções de formatação

### Componentes disponíveis
| Componente | Caminho | Uso |
|---|---|---|
| `Button` | `components/common/Button.tsx` | Botões de ação (primary/secondary) |
| `ButtonLink` | `components/common/ButtonLink.tsx` | Links estilizados como botão |
| `Card` | `components/common/Card.tsx` | Container com borda e sombra |
| `EyeIcon` | `components/common/EyeIcon.tsx` | Ícone de visualização |
| `Modal` | `components/common/Modal.tsx` | Modal com backdrop, Escape e scroll lock |
| `Pagination` | `components/common/Pagination.tsx` | Controle Anterior/Próxima |
| `StatusPill` | `components/common/StatusPill.tsx` | Pill com tom automático por status |
| `EmptyState` | `components/common/EmptyState.tsx` | Estado vazio para listas e tabelas |
| `FeedbackBanner` | `components/common/FeedbackBanner.tsx` | Banner de erro/sucesso |
| `MetricsCard` | `components/dashboard/MetricsCard.tsx` | Card de KPI |
| `PageHero` | `components/dashboard/PageHero.tsx` | Seção hero de topo de página |
| `PanelSection` | `components/dashboard/PanelSection.tsx` | Seção/painel com kicker e título |

### Se precisar criar um novo componente
1. Coloque em `components/common/` se for genérico ou em `components/dashboard/` se for de painel.
2. Exporte um componente React com TypeScript e interface de props tipada.
3. Documente com comentário JSDoc em pt-BR.
4. Todas as props de texto (label, título, etc.) devem estar em pt-BR quando usadas.

---

## 3. Estrutura de Layouts

### Admin (operador do mercado)
- Use `<Layout>` de `components/layout/Layout.tsx`.
- O sidebar é gerenciado por `Sidebar.tsx` → `WorkspaceSidebar.tsx`.
- O topbar é gerenciado por `Navbar.tsx` → `WorkspaceTopbar.tsx`.

### Super Admin (controle da plataforma)
- Use `<SuperAdminLayout>` de `components/layout/SuperAdminLayout.tsx`.
- O sidebar e topbar são gerenciados inline com `WorkspaceSidebar` e `WorkspaceTopbar`.
- O botão "Sair" fica **apenas no topbar** (não duplicar no footer da sidebar).

### Regras do layout
- A classe base é `page` seguida de contexto (`analytics-page`, `super-admin-page`).
- Use `page-hero-grid` + `PageHero` no topo de cada página.
- Use `metrics-grid` + `MetricsCard` para KPIs.
- Use `PanelSection` para seções com título e conteúdo.
- O background gradient já é definido no layout — **não aplique backgrounds nos componentes filhos**.

---

## 4. Estilo e Design System

### Regras de estilo
- O projeto usa **Tailwind CSS v4** com `@theme` para tokens.
- CSS customizado fica em `tailwind.css` dentro da `@layer components`.
- As variáveis CSS estão em `:root` no `@layer base`.
- Use as variáveis CSS existentes (ex: `var(--text-primary)`, `var(--accent-strong)`) — **não use cores hardcoded**.
- Fontes: `Manrope` (corpo), `Outfit`/`Sora` (display).

### Padrões de design
- Border radius: `rounded-[14px]` para botões, `rounded-[18px]` para cards menores, `rounded-[26px]` para painéis, `rounded-[28px]` para hero cards.
- Sombras: `shadow-[0_16px_36px_rgba(44,20,6,0.07)]` para painéis.
- Animação de hover: `hover:-translate-y-px` para botões e cards interativos.

---

## 5. Convenções de Código

### Nomenclatura
- Componentes: PascalCase (ex: `MetricsCard`, `SuperAdminDashboard`).
- Arquivos de componente: PascalCase (ex: `MetricsCard.tsx`).
- Utilitários: camelCase (ex: `formatters.ts`, `cn.ts`).
- Hooks: `use` + PascalCase (ex: `useMarketData.ts`).
- Rotas: kebab-case em pt-BR (ex: `/app/lista-compras`, `/app/previsao-demanda`).

### TypeScript
- Sempre tipar props com `interface` explícita.
- Use `React.FC<Props>` para componentes funcionais.
- Evite `any` — use tipos específicos.

### Imports
- Use imports relativos para componentes do projeto.
- Ordene: React → libs externas → componentes → hooks → utils → types.

---

## 6. Checklist para Novas Telas

Antes de considerar uma nova tela pronta, verifique:

- [ ] Todos os textos visíveis estão em pt-BR
- [ ] Nenhum texto em inglês na interface do usuário
- [ ] Arquivo salvo em UTF-8 (sem mojibake)
- [ ] Usa o Layout correto (Layout ou SuperAdminLayout)
- [ ] Usa PageHero no topo
- [ ] Usa MetricsCard para KPIs (quando aplicável)
- [ ] Usa PanelSection para seções com título
- [ ] Usa componentes reutilizáveis de `common/` (Modal, Pagination, etc.)
- [ ] Usa `utils/formatters.ts` para formatação de dados
- [ ] Não duplica código já existente em outros componentes
- [ ] Props tipadas com TypeScript
- [ ] Aria-labels em pt-BR
