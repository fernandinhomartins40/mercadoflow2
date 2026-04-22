# MercadoFlow 2.0 — Plano de Refatoração Completa

> **Objetivo**: Transformar o MercadoFlow de uma ferramenta com dados excelentes mas apresentação amadora em uma plataforma de referência para supermercadistas, com UX/UI de nível profissional, focada em decisão rápida e ação imediata.

---

## 1. Diagnóstico do Estado Atual

### Problemas Identificados

| Problema | Impacto |
|----------|---------|
| **Dashboard sobrecarregado** — 7+ seções com rails horizontais, pares, promoções, sazonalidade, tudo na mesma tela | Supermercadista não sabe por onde começar |
| **Métricas técnicas expostas** — termos como "lift", "confiança", "suporte", "share promo", "elasticidade" | Linguagem de data science, não de varejo |
| **Sem hierarquia visual clara** — todas as seções têm o mesmo peso visual | Nada parece urgente ou prioritário |
| **Ausência de ações diretas** — dados sem botões de ação contextualizados | Usuário vê o problema mas não age |
| **Navegação linear** — sidebar com 12+ itens sem agrupamento intuitivo | Supermercadista se perde no menu |
| **Sem visão espacial da loja** — nenhuma ferramenta de layout ou planograma | Perde a dimensão física do negócio |
| **Mobile negligenciado** — layout pensado para desktop | Gerente no chão de loja não usa |
| **Gráficos sem contexto** — charts sem comparação (sem "vs semana passada", "vs meta") | Números soltos não geram insight |

---

## 2. Filosofia do Redesign

### Princípios Fundamentais

1. **Exceção primeiro** — mostrar o que precisa de atenção, não tudo que existe
2. **Linguagem de dono de mercado** — zero jargão técnico, falar em "vende bem", "parou de vender", "oportunidade"
3. **Ação em 1 clique** — cada insight acompanha um botão de ação (comprar, promover, reposicionar)
4. **Progressão natural** — resumo → detalhe → ação (nunca overwhelm)
5. **Mobile-first** — cards empilháveis, navegação por gestos, glanceável
6. **Semáforo visual** — verde/amarelo/vermelho em tudo que tem meta ou benchmark

---

## 3. Nova Arquitetura de Telas

### 3.1 Tela Principal: "Hoje no Mercado" (substitui Dashboard)

**Conceito**: Uma tela que responde à pergunta "O que eu preciso fazer hoje?"

```
┌─────────────────────────────────────────────────┐
│  Bom dia, João! Terça, 21 de abril              │
│  Seu mercado faturou R$ 12.340 ontem (+8% vs    │
│  terça passada). 3 itens precisam de atenção.   │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│  │Vendas│ │Ticket│ │Itens │ │Margem│           │
│  │hoje  │ │médio │ │ativos│ │promo │           │
│  │R$8.2k│ │R$ 47 │ │ 842  │ │ 23%  │           │
│  │ ↑12% │ │ ↑3%  │ │ =    │ │ ↓2%  │           │
│  │ 🟢   │ │ 🟢   │ │ 🟡   │ │ 🔴   │           │
│  └──────┘ └──────┘ └──────┘ └──────┘           │
│                                                  │
│  ⚡ AÇÕES DO DIA (3)                             │
│  ┌─────────────────────────────────────────┐    │
│  │ 🔴 Leite Integral — parou de vender     │    │
│  │    há 3 dias. Verificar estoque.         │    │
│  │    [Verificar] [Recomprar]               │    │
│  ├─────────────────────────────────────────┤    │
│  │ 🟡 Cerveja Brahma — vendas caíram 40%   │    │
│  │    Considere promoção relâmpago.         │    │
│  │    [Criar promoção] [Ignorar]            │    │
│  ├─────────────────────────────────────────┤    │
│  │ 🟢 Arroz Tio João — giro acelerou!      │    │
│  │    Aumente o pedido em 30%.              │    │
│  │    [Ajustar compra] [Ver detalhes]       │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  📊 RESUMO RÁPIDO                                │
│  ┌─────────────┐ ┌─────────────┐               │
│  │ Top 5       │ │ Precisam    │               │
│  │ vendedores  │ │ de atenção  │               │
│  │ esta semana │ │ (baixo giro)│               │
│  └─────────────┘ └─────────────┘               │
│                                                  │
│  📈 Como foi a semana (gráfico simplificado)    │
│  ┌─────────────────────────────────────────┐    │
│  │  Seg  Ter  Qua  Qui  Sex  Sáb  Dom     │    │
│  │  ▃▃   ▅▅   ▆▆   ▇▇   ██   ██   ▅▅     │    │
│  │  vs semana anterior: ████████████████    │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

**Mudanças-chave:**
- Saudação personalizada com resumo em linguagem natural (IA gera o texto)
- 4 KPI cards com semáforo (vs 6+ métricas confusas)
- "Ações do Dia" como elemento central — não dados, mas AÇÕES
- Gráfico semanal com comparação automática (vs semana anterior)
- Top 5 e "precisam de atenção" como cards resumidos (não rails infinitos)

### 3.2 Tela de Produtos — Redesign Completo

**Antes**: Tabela densa com métricas técnicas (velocity, turnover band, promo share)

**Depois**: Visão por categorias com cards visuais e linguagem simples

```
┌─────────────────────────────────────────────────┐
│  🔍 Buscar produto...          [Filtro ▾]       │
│                                                  │
│  Visualizar por: [Categoria] [Lista] [Ranking]  │
│                                                  │
│  ── BEBIDAS (R$ 45.200 esta semana) ──────────  │
│                                                  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │
│  │ 🖼️     │ │ 🖼️     │ │ 🖼️     │ │ 🖼️     │  │
│  │Coca 2L │ │Skol    │ │Suco Del│ │Água Min│  │
│  │R$2.890 │ │R$1.450 │ │R$ 890  │ │R$ 670  │  │
│  │Vende   │ │Vende   │ │Vende   │ │Caiu    │  │
│  │muito ↑ │ │bem ↑   │ │normal →│ │atenção↓│  │
│  │🟢      │ │🟢      │ │🟡      │ │🔴      │  │
│  └────────┘ └────────┘ └────────┘ └────────┘  │
│                                                  │
│  ── LATICÍNIOS (R$ 32.100 esta semana) ───────  │
│  ...                                             │
└─────────────────────────────────────────────────┘
```

**Mudanças-chave:**
- Agrupamento por categoria com receita total visível
- Status em linguagem simples: "Vende muito", "Vende bem", "Normal", "Caiu", "Parou"
- Semáforo visual em cada card
- 3 modos de visualização: por categoria, lista simples, ranking
- Tap no card → detalhe com gráfico de preço, histórico, sugestões

### 3.3 Nova Tela: "Mapa da Loja" (Store Layout)

**Funcionalidade totalmente nova** — permite ao supermercadista definir e otimizar o layout da loja.

```
┌─────────────────────────────────────────────────┐
│  MAPA DA LOJA           [Editar] [Heatmap ▾]   │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │ [ENTRADA]                                │    │
│  │    ┌──────┐                              │    │
│  │    │HORTA │  ←── Zona de descompressão   │    │
│  │    │FRUTAS│      (primeiros 3 metros)    │    │
│  │    └──────┘                              │    │
│  │                                          │    │
│  │ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐        │    │
│  │ │01│ │02│ │03│ │04│ │05│ │06│ Gôndolas│    │
│  │ │  │ │  │ │  │ │  │ │  │ │  │        │    │
│  │ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘        │    │
│  │ Beb. Latic Limp Higie Cerea Massa     │    │
│  │                                          │    │
│  │ ┌──────────────────────────────────┐    │    │
│  │ │ PONTAS DE GÔNDOLA (promoções)    │    │    │
│  │ └──────────────────────────────────┘    │    │
│  │                                          │    │
│  │    ┌─────────┐  ┌─────────┐             │    │
│  │    │PADARIA  │  │AÇOUGUE  │             │    │
│  │    └─────────┘  └─────────┘             │    │
│  │                                          │    │
│  │ ┌────┐ ┌────┐ ┌────┐ ┌────┐            │    │
│  │ │CAIXA│ │CAIXA│ │CAIXA│ │CAIXA│ ← Zona│    │
│  │ └────┘ └────┘ └────┘ └────┘   impulso │    │
│  │ [SAÍDA]                                  │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  💡 SUGESTÕES DA IA                              │
│  • Mova Cervejas para perto do Açougue (+15%    │
│    estimado em combos churrasco)                 │
│  • Ponta da gôndola 3 está subutilizada —       │
│    coloque o produto #1 da semana ali            │
│  • Zona de impulso: adicione chocolates          │
│    (venderam 23% mais no fim de semana)          │
└─────────────────────────────────────────────────┘
```

**Funcionalidades do Mapa da Loja:**

1. **Editor Drag-and-Drop**
   - Biblioteca de elementos: gôndolas, ilhas, pontas, freezers, caixas, áreas especiais
   - Redimensionar e rotacionar elementos
   - Definir categorias por gôndola/zona
   - Salvar múltiplas versões do layout

2. **Heatmap de Vendas**
   - Overlay de calor sobre o mapa baseado em vendas por categoria/zona
   - Cores: vermelho (alta venda) → azul (baixa venda)
   - Filtro por período (dia, semana, mês)

3. **Sugestões Inteligentes**
   - Baseadas nos dados de cesta (cross-sell): "Quem compra X também compra Y"
   - Otimização de pontas de gôndola com base em margens e giro
   - Zona de impulso otimizada por dados reais
   - Vizinhança de categorias baseada em análise de cesta

4. **Acompanhamento**
   - Antes/depois de mudanças de layout
   - Score de eficiência do layout vs benchmark
   - Histórico de alterações

### 3.4 Compra Casada → "Combos que Vendem Juntos"

**Antes**: Tabela com "lift", "confiança", "suporte" — métricas incompreensíveis para o supermercadista.

**Depois**: Cards visuais com linguagem de vendas.

```
┌─────────────────────────────────────────────────┐
│  COMBOS QUE VENDEM JUNTOS                       │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │ 🖼️ Picanha  +  🖼️ Carvão               │    │
│  │                                          │    │
│  │ Quando o cliente leva Picanha,           │    │
│  │ 73% das vezes também leva Carvão.        │    │
│  │ Isso aconteceu 245 vezes este mês.       │    │
│  │                                          │    │
│  │ 💡 Coloque próximos na loja ou           │    │
│  │    crie uma promoção combo!              │    │
│  │                                          │    │
│  │ [Criar promoção combo] [Ver no mapa]     │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │ 🖼️ Macarrão  +  🖼️ Molho de Tomate     │    │
│  │ 68% das vezes juntos (312 cestas)        │    │
│  │ [Criar promoção combo] [Ver no mapa]     │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### 3.5 Lista de Compras → "Pedido Inteligente"

Redesign com foco em ação prática:

```
┌─────────────────────────────────────────────────┐
│  PEDIDO INTELIGENTE                              │
│  Baseado nas vendas dos últimos 7 dias           │
│                                                  │
│  🔴 URGENTE — Estoque crítico (3 itens)         │
│  ┌─────────────────────────────────────────┐    │
│  │ ☐ Leite Integral — vende 24/dia,        │    │
│  │   compre pelo menos 168 un.     [+lista] │    │
│  │ ☐ Pão de Forma — vende 18/dia   [+lista] │    │
│  │ ☐ Banana — vende 30kg/dia       [+lista] │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  🟡 REFORÇAR — Giro acelerando (5 itens)        │
│  ┌─────────────────────────────────────────┐    │
│  │ ☐ Cerveja Skol — giro subiu 20%  [+lista]│    │
│  │ ☐ Carne Moída — pico sazonal     [+lista]│    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  🟢 MANTER — Compra regular (12 itens)          │
│  └─ [expandir lista completa]                    │
│                                                  │
│  ⚠️  REDUZIR — Giro caindo (4 itens)            │
│  └─ [expandir lista completa]                    │
│                                                  │
│  [📋 Exportar lista] [📱 Enviar por WhatsApp]   │
└─────────────────────────────────────────────────┘
```

### 3.6 Campanhas → "Promoções"

Simplificar a linguagem e focar no resultado:

```
┌─────────────────────────────────────────────────┐
│  PROMOÇÕES                    [+ Nova promoção]  │
│                                                  │
│  ── ATIVAS AGORA ──                              │
│  ┌─────────────────────────────────────────┐    │
│  │ 🟢 Fim de Semana do Churrasco           │    │
│  │    15-17 abr · 8 produtos               │    │
│  │    Vendas: R$ 4.500 (+35% vs normal)    │    │
│  │    ████████████████████░░░░ 78% da meta │    │
│  │    [Ver detalhes] [Encerrar]             │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  ── ENCERRADAS ──                                │
│  ┌─────────────────────────────────────────┐    │
│  │ Páscoa 2026                              │    │
│  │ Resultado: R$ 12.300 (+42% vs normal)   │    │
│  │ ⭐ Melhor promoção do mês               │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

---

## 4. Nova Navegação

### Sidebar Simplificada

```
┌──────────────────────┐
│  🏪 MercadoFlow       │
│  Supermercado São João│
│                       │
│  📍 HOJE              │
│  • Painel do dia      │
│  • Alertas (3)        │
│                       │
│  📦 PRODUTOS          │
│  • Catálogo           │
│  • Combos             │
│  • Pedido inteligente │
│                       │
│  📊 ESTRATÉGIA        │
│  • Promoções          │
│  • Mapa da loja  NEW  │
│  • Previsão           │
│                       │
│  ⚙️ CONFIGURAÇÃO      │
│  • Agente & PDVs      │
│  • Conta              │
└──────────────────────┘
```

**Mudanças:**
- De 12+ itens para 9 itens em 4 grupos claros
- "Mapa da loja" como destaque (NEW)
- "Compra casada" → "Combos" (nome intuitivo)
- "Lista de compras" → "Pedido inteligente"
- PDVs e Download do agente unificados
- Catálogo global e Preços estaduais movidos para admin (não poluem sidebar normal)
- Badge de contagem nos alertas

---

## 5. Sistema de Design

### 5.1 Paleta de Cores

```
Primária:       #1B4332 (verde escuro — confiança, varejo)
Secundária:     #2D6A4F (verde médio)
Acento:         #40916C (verde claro)
Background:     #FAFAF8 (off-white quente)
Cards:          #FFFFFF
Texto:          #1A1A1A (quase preto)
Texto sec.:     #6B7280 (cinza)

Semáforo:
  Ótimo:        #059669 (verde)
  Atenção:      #D97706 (amarelo/laranja)
  Crítico:      #DC2626 (vermelho)
  Neutro:       #6B7280 (cinza)
```

**Por que verde?** Verde é a cor do dinheiro, do varejo, da confiança. Supermercadistas associam verde com frescor e crescimento. Sai o bege/tan atual que parece "inacabado".

### 5.2 Tipografia

```
Títulos:        Inter Bold, 24-32px
Subtítulos:     Inter Semibold, 18-20px
Corpo:          Inter Regular, 14-16px
Métricas KPI:   Inter Bold, 28-36px
Labels:         Inter Medium, 12-13px uppercase
```

### 5.3 Componentes Novos

| Componente | Descrição |
|-----------|-----------|
| `KPICard` | Card de métrica com valor, tendência (↑↓→), comparação, semáforo |
| `ActionCard` | Card de alerta/ação com ícone, texto em linguagem natural, botões de ação |
| `StatusBadge` | Badge com cor semáforo + texto ("Vende bem", "Caiu", "Urgente") |
| `StoreMap` | Canvas interativo para layout da loja com drag-and-drop |
| `HeatmapOverlay` | Layer de calor sobre o StoreMap |
| `ComboCard` | Card de par de produtos com visual "A + B" |
| `SmartListItem` | Item de lista com prioridade visual, quantidade sugerida, ação |
| `WeekChart` | Gráfico de barras semanal com comparação automática |
| `ProgressRing` | Indicador circular de progresso vs meta |
| `AIInsightBox` | Box com ícone de IA + sugestão em linguagem natural |
| `QuickFilter` | Pills de filtro rápido (período, categoria, status) |

### 5.4 Responsividade

```
Mobile (< 768px):
  - Cards empilhados verticalmente
  - Navegação bottom tab bar (5 itens: Hoje, Produtos, Promoções, Mapa, Menu)
  - KPIs em grid 2x2
  - Swipe para navegar entre seções

Tablet (768-1024px):
  - Sidebar colapsável
  - Cards em grid 2 colunas
  - Mapa da loja com zoom/pan

Desktop (> 1024px):
  - Sidebar fixa
  - Cards em grid 3-4 colunas
  - Mapa da loja em tela cheia com painel lateral
```

---

## 6. Funcionalidade: Mapa da Loja — Especificação Detalhada

### 6.1 Editor de Layout

**Elementos disponíveis na biblioteca:**

| Elemento | Ícone | Descrição |
|----------|-------|-----------|
| Gôndola | ═══ | Prateleira dupla-face, configurável em largura/comprimento |
| Ponta de gôndola | ╗ | Exposição promocional nos fins de corredor |
| Ilha | ▣ | Display central (frutas, promoções, sazonais) |
| Freezer horizontal | ❄ | Congelados, sorvetes |
| Freezer vertical | ▐ | Refrigerados, laticínios, bebidas |
| Balcão | ─── | Padaria, açougue, frios |
| Checkout | ⬜ | Caixa registradora com zona de impulso |
| Área livre | ░ | Espaço aberto, corredor, entrada |

**Interações:**
- Drag da biblioteca para o canvas
- Resize nos handles
- Rotação (0°, 90°, 180°, 270°)
- Duplo-clique para atribuir categoria(s) ao elemento
- Menu de contexto: duplicar, excluir, editar propriedades
- Snap-to-grid para alinhamento

### 6.2 Atribuição de Categorias

Cada elemento do layout pode receber:
- **Categoria principal** (ex: "Bebidas")
- **Subcategorias** (ex: "Cervejas", "Refrigerantes", "Sucos")
- **Produtos específicos** (para pontas de gôndola e ilhas promocionais)

### 6.3 Visualizações do Mapa

| Modo | O que mostra |
|------|-------------|
| **Layout** | Planta baixa com nomes das categorias |
| **Heatmap de Vendas** | Calor por zona baseado em receita (dados reais do PDV) |
| **Heatmap de Margem** | Calor por zona baseado em margem de lucro |
| **Combos** | Linhas conectando zonas com produtos que vendem juntos |
| **Sugestões** | Highlights em zonas com oportunidade de otimização |

### 6.4 Sugestões Inteligentes (baseadas em dados do sistema)

A IA analisa os dados de cesta, vendas e sazonalidade para sugerir:

1. **Vizinhança de categorias**: "Coloque massas perto de molhos — 68% dos clientes compram juntos"
2. **Otimização de pontas**: "A ponta da gôndola 3 tem baixo giro. Sugestão: coloque [Produto X] que vendeu R$ 2.300 esta semana"
3. **Zona de impulso**: "Chocolates venderam 23% mais no fim de semana — adicione ao checkout"
4. **Sazonalidade**: "Junho chegando — prepare espaço para produtos de festa junina (pipoca, amendoim, canjica)"
5. **Fluxo lógico**: "Coloque itens essenciais (leite, pão, ovos) no fundo da loja para aumentar exposição"

### 6.5 Modelo de Dados

```typescript
interface StoreLayout {
  id: string;
  name: string;
  width: number;       // largura em metros
  height: number;      // comprimento em metros
  gridSize: number;    // tamanho do grid em cm
  elements: StoreElement[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface StoreElement {
  id: string;
  type: 'gondola' | 'endcap' | 'island' | 'freezer_h' | 'freezer_v' | 'counter' | 'checkout' | 'open_area';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;    // 0, 90, 180, 270
  label: string;
  categoryIds: string[];
  productIds?: string[];  // para pontas/ilhas específicas
  metadata?: Record<string, any>;
}

interface StoreZonePerformance {
  elementId: string;
  revenue: number;
  margin: number;
  transactionCount: number;
  topProducts: { name: string; revenue: number }[];
  trend: 'up' | 'down' | 'stable';
  period: string;
}
```

---

## 7. Tradução de Linguagem Técnica → Linguagem de Varejo

| Termo Técnico (atual) | Linguagem de Varejo (novo) |
|----------------------|---------------------------|
| Sales Velocity | Giro diário |
| Turnover Band HIGH/MEDIUM/LOW | Vende muito / Vende bem / Vende pouco |
| Revenue Trend Percentage | Comparado com semana passada |
| Promo Revenue Share | Quanto vende em promoção |
| Lift | Aumento nas vendas |
| Confidence (cesta) | "X% das vezes compram juntos" |
| Support | "Aconteceu X vezes" |
| Price Index | Preço comparado com a média |
| Baseline Price | Preço normal |
| Elasticity | Sensibilidade a preço |
| Demand Forecast | Previsão de vendas |
| Revenue Lift Percent | "Vendeu X% a mais" |
| Transaction Count | Número de vendas |
| Product Performance | Como o produto está indo |

---

## 8. Plano de Execução — Fases

### Fase 1: Fundação (semana 1-2)
- [ ] Criar novo sistema de design (cores, tipografia, componentes base)
- [ ] Implementar novos componentes: `KPICard`, `ActionCard`, `StatusBadge`, `QuickFilter`, `AIInsightBox`
- [ ] Refatorar sidebar para nova estrutura de navegação
- [ ] Implementar bottom tab bar para mobile
- [ ] Criar sistema de semáforo (RAG) reutilizável

### Fase 2: Telas Core (semana 3-4)
- [ ] Redesign completo do Dashboard → "Hoje no Mercado"
  - Saudação com resumo IA
  - 4 KPI cards com semáforo
  - Ações do dia (prioridade baseada em alertas)
  - Gráfico semanal com comparação
- [ ] Redesign da tela de Produtos
  - Visualização por categoria com cards visuais
  - Status em linguagem simples
  - 3 modos de visualização
- [ ] Redesign da Lista de Compras → "Pedido Inteligente"
  - Agrupamento por urgência (semáforo)
  - Quantidades sugeridas com justificativa
  - Exportar / WhatsApp

### Fase 3: Mapa da Loja (semana 5-7)
- [ ] Backend: modelo de dados StoreLayout + API CRUD
- [ ] Frontend: Canvas editor com drag-and-drop
- [ ] Biblioteca de elementos (gôndolas, freezers, etc.)
- [ ] Atribuição de categorias a zonas
- [ ] Heatmap de vendas overlay
- [ ] Sugestões inteligentes baseadas em dados de cesta
- [ ] Histórico de layouts com comparação antes/depois

### Fase 4: Refinamento (semana 8-9)
- [ ] Redesign de Compra Casada → "Combos que Vendem Juntos"
- [ ] Redesign de Campanhas → "Promoções"
- [ ] Redesign da Previsão de Demanda
- [ ] Integração do Mapa da Loja com Combos e Promoções
- [ ] Testes de usabilidade e ajustes

### Fase 5: Polish e Mobile (semana 10)
- [ ] Responsividade completa em todas as telas
- [ ] Animações e transições suaves
- [ ] Modo escuro (opcional)
- [ ] Performance: lazy loading, virtualização de listas
- [ ] Testes finais e deploy

---

## 9. Métricas de Sucesso

| Métrica | Meta |
|---------|------|
| Tempo para primeira ação no dashboard | < 10 segundos |
| Itens na sidebar | ≤ 9 (de 12+) |
| Jargão técnico visível ao usuário | 0 termos |
| Telas com semáforo visual | 100% |
| Cobertura mobile | 100% das telas |
| Cliques para criar promoção | ≤ 3 |
| Cliques para adicionar ao pedido | 1 |

---

## 10. Referências e Inspirações do Setor

**Plataformas de referência estudadas:**
- **Dunnhumby** — Customer-centric analytics com linguagem natural
- **Symphony RetailAI (CINDE)** — IA prescritiva com agentes autônomos
- **Blue Yonder Luminate** — Category management com AI localizada
- **LEAFIO** — Planogram software com analytics overlay
- **RELEX** — Auto-geração de planogramas com IA
- **Datawiz Store Manager** — App mobile-first para gerentes de loja

**Melhores práticas aplicadas:**
- Design baseado em exceção (mostrar o que precisa de atenção)
- KPI cards com semáforo RAG (Red/Amber/Green)
- Linguagem natural gerada por IA para insights
- Progressive disclosure (resumo → detalhe → ação)
- Mobile-first com card-based layout
- Heatmaps espaciais sobre plantas de loja
- Sugestões de vizinhança baseadas em análise de cesta

---

> **Este plano aguarda aprovação para início da implementação.**
> Após aprovação, a execução seguirá as fases descritas acima.
> Qualquer fase pode ser priorizada ou ajustada conforme necessidade.
