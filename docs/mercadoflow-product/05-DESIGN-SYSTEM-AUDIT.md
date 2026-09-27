# 05 — Auditoria do design system

Data: 2026-09-26 · Fase: Prompt 3 · Base: D-018 (celular primeiro), D-021 (menos telas), protocolo §2.13 (marca a serviço da usabilidade)

Método: medição estática por `grep` sobre `frontend/src` **na cópia local**, que inclui as 21 alterações de
frontend não commitadas do owner, e axe-core 4.10.2 nas páginas públicas publicadas (`mercadoflow.com`,
2026-09-26). As telas logadas serão medidas no ambiente local sintético (ver `04-UX-UI-AUDIT.md`).

---

## 1. O que existe

| Camada | Estado | Evidência |
|---|---|---|
| Tokens | `@theme` do Tailwind 4 com 60 variáveis CSS: escala `brand` verde (`#22c55e`/`#16a34a`), superfícies e textos (`--text-primary`, `--text-muted`, `--surface-success`…) | `tailwind.css` |
| Tipografia | Inter 400–800 + JetBrains Mono (Google Fonts) | `index.html` |
| Ícones | lucide-react | `package.json` |
| Componentes base | `components/common` (13: Button, ButtonLink, Card, Chart, EmptyState, FeedbackBanner, Modal, Pagination, PasswordField, StatusPill, Table, …) | `ls` |
| Segundo conjunto | `components/ui` (8: Chip, DataRow, Empty, RailCard, Section, Stat, StatGrid), usado em **2 arquivos** | `grep` de imports |
| Logos | `logomercadoflow-color.png`, `-branco.png` | `public/` |

## 2. Achados

| ID | Problema | Medida | Impacto | Prioridade |
|---|---|---|---|---|
| DS-01 | **Tokens contornados**: cores fixas no código | 840 literais `#rrggbb`, 97 cores distintas, contra 60 tokens definidos; só 27 nomes distintos aparecem via `var(--…)` | tema inconsistente, contraste imprevisível, sem modo escuro viável | P1 |
| DS-02 | **Estilo inline dominante** | 1.798 objetos `style={{…}}` | estados (hover/foco/disabled) e responsividade difíceis; a mesma decisão visual se repete à mão | P1 |
| DS-03 | **Texto pequeno demais para celular** | 9–11 px em ~200 lugares (`text-[10px]` ×85, `text-[11px]` ×78, `text-[9px]` ×16, `text-[0.62–0.7rem]` ×54); `text-xs` (12 px) ×446 | ilegível a 360 px em luz de loja; contraria D-018 | **P0** para as telas prioritárias |
| DS-04 | **Foco removido sem substituto** | `outline-none` ×46 contra `focus-visible` ×2 | navegação por teclado invisível (WCAG 2.4.7) | **P0** (acessibilidade) |
| DS-05 | **Componente de modal ignorado** | `<Modal>` usado 0 vezes; 10 modais próprios `fixed inset-0` | foco, Esc, rolagem e leitor de tela tratados (ou não) caso a caso | P1 |
| DS-06 | **Botão do sistema pouco usado** | `<button>` cru ×265 contra `<Button>` ×149 | alvos de toque, foco e estados variam por tela | P1 |
| DS-07 | **Dois conjuntos de componentes** | `common` (32 arquivos importam) × `ui` (2 importam); `EmptyState` × `Empty` | duplicação e dúvida sobre qual usar | P2 |
| DS-08 | **Alvos de toque pequenos** | páginas públicas a 360 px: login 7 de 7, cadastro 11 de 14 e landing 10 de 16 interativos com menos de 44 px | toque errado no celular (WCAG 2.5.8) | P1 |
| DS-09 | **Contraste insuficiente** | axe `color-contrast` (serious): 54 nós nas páginas públicas; botão desabilitado verde-claro com texto branco no cadastro | leitura difícil; WCAG 1.4.3 | P1 |
| DS-10 | **Campos sem rótulo associado** | axe `label` (critical): 8 nós nas páginas públicas | leitor de tela não anuncia o campo | **P0** |
| DS-11 | **Estrutura de página** | sem `<main>` (`landmark-one-main`, 12 nós); login/cadastro sem `h1` | navegação por leitor de tela | P2 |
| DS-12 | Raio de borda | `rounded-lg` ×326, `rounded-xl` ×255, `rounded-2xl` ×13, `rounded-md` ×11 | leve inconsistência visual | P2 |

Pontos positivos medidos: carregamento inicial leve (≈100 KB de JS comprimido, LCP < 1 s nas páginas públicas);
breakpoints majoritariamente `sm:` (base mobile-first); escala tipográfica do Tailwind predominante.

## 3. Proposta de sistema visual implementável (não altera a logo)

Princípio: **uma decisão visual, um token; uma interação, um componente.** A marca (verde + azul-escuro,
ideia de fluxo com direção) aparece em cor de ação, estados de progresso e na barra de navegação, não
como decoração de cada cartão.

| Elemento | Proposta |
|---|---|
| Cores | tokens semânticos, não por tom: `--color-action` (verde da marca), `--color-ink` (azul-escuro), `--surface`, `--surface-raised`, `--border`, `--text`, `--text-muted` (contraste ≥ 4,5:1 em `--surface`), `--success/--warning/--danger/--info` com pares fundo/texto validados. Proibir `#rrggbb` fora de `tailwind.css` via checagem no build |
| Tipografia | escala mínima de 14 px no celular para texto corrido e 12 px só para rótulos auxiliares (`caption`); títulos 20/24/30; números de KPI em Inter tabular (`font-variant-numeric: tabular-nums`) |
| Espaçamento | escala de 4 px (4, 8, 12, 16, 24, 32); gutter lateral de 16 px a 360 px |
| Grid | 1 coluna até 767 px; 2 a partir de 768; 12 colunas a partir de 1024; barra inferior com 5 destinos no celular (Hoje, Comprar, Produtos, Vender, Loja), lateral no desktop |
| Radius | 2 valores: 8 px (controles) e 12 px (superfícies) |
| Elevação | 2 níveis: borda (padrão) e sombra (sobreposições: modal, sheet, menu) |
| Estados | cada componente com default, hover, `focus-visible` (anel de 2 px `--color-action` + offset), active, disabled (contraste de texto preservado), loading |
| Toque | alvo mínimo de 44×44 px em qualquer interativo |
| Iconografia | lucide, 20 px na navegação e 16 px inline, sempre com texto ou `aria-label` |
| Tabelas | no celular viram **lista de cartões** (produto, número principal, ação); tabela só a partir de 768 px |
| Formulários | rótulo visível associado (`htmlFor`), ajuda abaixo, erro inline com ícone e texto, teclado numérico para quantidade/CNPJ |
| Sobreposições | um `Sheet` (bottom sheet no celular, painel lateral no desktop) e um `Dialog`, ambos com foco preso, Esc, retorno de foco e `aria-modal` |
| Feedback | `Toast` para sucesso com **Desfazer** (D-011), `Banner` para estado da conta/ativação |
| Vazio/erro/carregando | componentes únicos `EmptyState` (com próxima ação), `ErrorState` (com tentar de novo) e `Skeleton` |

## 4. Migração sugerida (para o roadmap, sem implementar agora)

1. Tokens semânticos + regra no build que barra hex novo (não quebra o existente).
2. `Button`, `Sheet/Dialog`, `EmptyState/ErrorState/Skeleton` como únicos pontos de entrada; `components/ui` fundido em `common`.
3. Migrar primeiro as telas do núcleo (Hoje, Comprar), com o redesenho da arquitetura de informação; o resto entra conforme cada tela for tocada.

Impacto em recursos: nenhum no servidor; o bundle tende a cair com menos estilo inline. **NÃO MEDIDO**.
