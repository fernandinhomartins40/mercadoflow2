# 04 — Auditoria de UX, UI e fluxos

Data: 2026-09-26 · Fase: Prompt 3 · Direções aprovadas: A + B + C sobre fundação comum (D-024)

## 0. Método e ambientes (o que é teste real e o que é inspeção)

| Ambiente | O que foi observado | Como | Limitação |
|---|---|---|---|
| **Produção** `mercadoflow.com` (commit `26487de`) | 6 páginas públicas × 4 larguras (360/768/1024/1440) | Playwright + Chrome headless; métricas de layout, LCP/CLS, rede, console; axe-core 4.10.2 a 360 e 1440 | contas de teste do `CREDENCIAIS-TESTE.md` retornam **401**, então nenhuma tela logada foi vista em produção |
| **Local descartável** (imagens construídas do mesmo commit, PostgreSQL 16 com as mesmas roles/RLS, proxy com `deploy/nginx.vps.conf`) | 14 telas do mercado a 360 px com **loja vazia**; depois as mesmas telas com **60 dias de vendas sintéticas** enviadas pelo ingest real | mesmo roteiro | backend local conectado com a role dona do schema (ignora RLS), porque com a role de aplicação o login quebra (UX-C01); mercado em plano Essencial; usuário MARKET_OWNER |
| Código (cópia local, com as alterações não commitadas do owner) | estados de tela, tokens, componentes | `grep`/leitura | não é teste visual |

Outras limitações observadas: `DevSeeder` falha sob RLS (o perfil `dev` não sobe com a role de aplicação); contas do `CREDENCIAIS-TESTE.md` dão 401 em produção (provável secret ausente); ingestão local de ≈0,4 s por nota (carga histórica de um ano levaria horas); a tabela `sales_analytics` só recebe "ontem", então o gráfico semanal de um cliente novo fica vazio mesmo com histórico (preenchida à mão no ambiente sintético).

Roteiros e capturas: `scratchpad/ux_audit.py`, `gen_sales.py` (fora do repositório; métricas resumidas aqui).

## 1. Achados críticos (bloqueiam confiança, segurança ou ativação)

| ID | Tela/fluxo | Problema | Evidência | Impacto | Status |
|---|---|---|---|---|---|
| UX-C01 | Login de mercado | **Todo usuário ligado a um mercado recebe 500 ao entrar**: o login grava `last_login_at` sem tenant na sessão e a policy `users_modify` (V43, 10/08) recusa a linha | reproduzido localmente com RLS; **confirmado em produção** em 2026-09-26 com conta descartável criada pelo `/register` (cadastro 202, login 500) | nenhum lojista consegue usar o produto | **corrigido e publicado** (D-028, commit 10d601c; login 200 em produção) |
| UX-C02 | Qualquer erro 500 | Resposta devolve `ex.getMessage()`: o login expôs o `UPDATE users …` inteiro | resposta de produção acima | vazamento de estrutura interna (OWASP A05) | **corrigido e publicado** (D-028) |
| UX-C03 | Landing `/` | Afirma "500+ supermercados ativos", "+32% de margem" e depoimento com "Reduzi o desperdício em 40%", **sem nenhum cliente** (D-009); o depoimento ainda fala de desperdício/estoque, fora da tese (D-019) | `Landing.tsx:133-135, 406-430, 770` no commit publicado | propaganda enganosa (CDC art. 37), quebra de confiança no primeiro contato | aberto |
| UX-C04 | Painel do dia, loja vazia | Quatro cartões de "R$ 0,00 / 0" ocupam a primeira tela no celular; "Precisam de atenção: Todos os produtos em dia!"; **nenhuma orientação para instalar o agente** | captura local 360 px, loja sem notas | a ativação (D-014, D-021) falha no primeiro minuto | aberto |
| UX-C05 | Mapa da loja | **Mapa de calor sempre em erro 500**: a SQL usa `ii.quantity`/`ii.unit_price`, colunas que não existem (`quantidade`/`valor_unitario`) | log do backend local; `StoreLayoutService.java:89` | o módulo que o owner quer reinventar (D-022) nunca mostrou o calor | aberto |
| UX-C06 | Cadastro e planos | Página pública e cadastro dizem **"1.000 notas fiscais por mês"**; o sistema aplica **por semana** | captura do `/register` a 360 px; `PublicPlanController:74`; `PlanService:275` | promessa diferente do comportamento (D-027 manda corrigir o texto) | aberto |
| UX-C07 | Ativação: 1ª nota | A **primeira nota de todo mercado novo** (e nota mais antiga que a já vista) travava a ingestão para sempre: `markFirstIngest` em `REQUIRES_NEW` esperava o lock da própria transação da nota; 2 conexões presas por tentativa, pool de 8 | local com RLS: timeout de 25 s e sessões `idle in transaction`/`Lock` | o agente reenviaria e derrubaria o backend inteiro | **corrigido e publicado** (D-028) |

## 2. Páginas públicas (produção, medido)

| Métrica | Resultado | Leitura |
|---|---|---|
| LCP | 92–932 ms (pior: landing a 360 px) | bom |
| CLS | ≤ 0,03 em geral; **0,158** no cadastro a 768 px e 0,10 no download a 768 px | cadastro instável em tablet |
| JS transferido na 1ª visita | ≈100 KB comprimidos | bom (após a compressão da Fase 15) |
| Estouro horizontal | landing a 768 px: 8 px | pequeno, mas gera rolagem lateral |
| Erro em toda página pública | `GET /api/v1/auth/me` → **403** para visitante anônimo (deveria ser 401 ou nem ser chamado) | ruído de console e requisição inútil em cada visita |
| Alvos de toque < 44 px a 360 px | login 7/7, cadastro 11/14, landing 10/16 | toque difícil |
| axe (somado, 360 + 1440) | `region` 254 nós, `color-contrast` 54 (serious), `landmark-one-main` 12, **`label` 8 (critical)**, `page-has-heading-one` 6 | leitor de tela e contraste |
| Cadastro | 7 campos + plano numa única tela longa; rótulo "Gratuito Gratuito" duplicado; botão desabilitado verde-claro com texto branco | fricção e contraste |
| Landing a 360 px | 12.403 px de altura, com grandes blocos vazios na captura (conteúdo que só aparece por `IntersectionObserver` ao rolar) | página longa; sem `prefers-reduced-motion` verificado |

## 3. App do mercado com loja vazia (local, 360 px)

| Tela | Alvos < 44 px | h1 | axe | Falha de rede | Observação |
|---|---|---|---|---|---|
| Painel do dia | 19/24 | 1 | contraste 17 | — | UX-C04 |
| Central de Inteligência | 20/21 | 1 | contraste 10 | — | |
| Pergunte aos dados | 16/17 | **0** | | — | |
| Semana e rede | 16/18 | **0** | | — | |
| Clientes | 15/18 | **0** | contraste 8 | — | |
| Catálogo | 26/27 | 1 | | — | |
| Pedido inteligente | 15/20 | 1 | | — | |
| Mapa da loja | 23/24 | 1 | **contraste 25, `button-name` 4**, região rolável sem foco | **500** no heatmap | UX-C05 |
| PDVs e agente | 19/23 | 1 | | 404 instalador (artefato local) | |
| Promoções / Conta / Plano / Download | 15–22 alvos pequenos | 1 | | — | |
| Catálogo global (admin) | 15/16 | **0** | | — | aberto a MARKET_OWNER por URL direta (a navegação esconde; acesso a verificar no Prompt 4) |

Todas as telas: `landmark-unique` (landmarks duplicados sem nome). Nenhum estouro horizontal a 360 px. Nenhuma tela orienta o próximo passo quando não há dado.

## 4. Telas com dados sintéticos (local, 60 dias)

Carga: 6.398 notas, 34.022 itens, 145 produtos, 35% das notas com CPF (350 clientes), enviadas pelo
**ingest real** com HMAC. Sinais plantados: 2 produtos em alta, 2 em queda, 2 que param de vender,
2 promoções e 5 pares de cesta. Recalculados: preço (15 s), inteligência (16 s), oportunidades (> 60 s).

### 4.1 O que o motor produziu com os sinais plantados

| Sinal plantado | Resultado | Leitura |
|---|---|---|
| 2 promoções (cerveja, café) | **detectadas** (2 janelas); halo medido corretamente (café puxa açúcar, pão, carvão) | o motor de promoção funciona |
| 5 pares de cesta | 74 efeitos halo | funciona |
| 2 produtos em queda | **nenhuma oportunidade** | sinal de venda ignorado |
| 2 produtos que pararam de vender (ruptura provável) | **nenhuma oportunidade** | sinal de venda ignorado |
| (sem compras registradas) | **145 de 147 oportunidades = OPORTUNIDADE_DE_COMPRA**, uma por produto: estoque teórico = compras (0) − vendas | **ruído total**; prova no produto o conflito de D-019 e sustenta D-025/D-026 |

### 4.2 Achados por tela (360 px salvo indicação)

| ID | Tela | Problema | Evidência | Impacto | Proposta | Preservar | Prioridade |
|---|---|---|---|---|---|---|---|
| UX-01 | Painel do dia | KPIs **não são "do dia"**: "Transações 6,4 mil" e "Faturamento R$ 412 mil" são o total dos 60 dias; "+100,0% vs semana passada" incoerente | captura; 6.398 notas no banco | decisão sobre número errado | período explícito (hoje × mesmo dia da semana anterior) | dados de venda, "Mais vendidos" | P0 |
| UX-02 | Painel do dia | conteúdo **cortado à direita** a 360 px (sábado some do gráfico, borda dos cartões) | captura | informação escondida | contêiner fluido; gráfico adaptado | — | P1 |
| UX-03 | Painel do dia | "Precisam de atenção" lista produtos sem dizer **por quê** | captura | não gera ação | motivo + ação por item | lista | P1 |
| UX-04 | Painel do dia | LCP 7,8 s (360) / 5,9 s (1440); `analytics/cockpit` leva 2,6 s calculando na leitura | resource timing | abandono; na VPS tende a piorar | materializar no job ou cache por loja | — | P1 |
| UX-05 | Central de Inteligência | 147 cards de uma vez: **53.410 px de altura** no celular (≈68 telas), 3.292 nós, 462 alvos, 67 mil caracteres | captura, métricas | excesso de informação (D-021) | feed priorizado (5–10 primeiros), agrupado, "ver mais" | "Como chegamos nesse número", Aceitar/Não faz sentido | **P0** |
| UX-06 | Central de Inteligência | "Aguardando sua decisão 147" e "Oportunidades abertas 147" repetem o número | captura | ruído | um KPI de pendências + impacto | — | P2 |
| UX-07 | Central / Promoções | número em **formato americano** no texto ("R$ 5,893.50", "8.0%", "produto(s)") ao lado de "R$ 5.893,50" | captura | desconfiança no número | formatação pt-BR única | texto determinístico | P1 |
| UX-08 | Central de Inteligência | "Analisar agora" → `/opportunities/detect` passa de 60 s e o proxy devolve **504** (145 produtos, 60 dias) | chamada medida | erro visível ao lojista | tarefa assíncrona com progresso | recálculo sob demanda | P1 |
| UX-09 | Pedido inteligente | **contradiz a Central**: "Repor para o ideal R$ 0,00 · 0 itens · Nenhuma reposição necessária — o estoque estimado cobre o giro", enquanto a Central manda comprar os 145 | capturas | a pergunta central (J1) recebe duas respostas opostas | reposição pelo vendido (D-025) como aba inicial | Lista, Pedidos, Fornecedores | **P0** |
| UX-10 | Pedido inteligente | aba inicial de capital/GMROI/"Quanto você tem para comprar?" com R$ 0,00 em tudo, sem dado de compra | captura | confusão; contra D-019 | começar por "o que repor, de quem" | — | P1 |
| UX-11 | Promoções | tela mais sólida (halo, prioridade, efeito medido), mas mostra "0 dias de estoque" e "Margem 25%" presumida; abas cortadas; título da barra "Efetividade de prom…" ≠ "Promoções" | captura | ruído e inconsistência | tirar estoque; margem só quando informada | análise de halo e efetividade | P1 |
| UX-12 | Promoções | LCP 5,7 s; `promo-intelligence/recommendations` 4,8 s | resource timing | lentidão | materializar | — | P1 |
| UX-13 | Mapa da loja | instrução "**Alt+clique**: marcar corredor" (impossível no celular); 4ª coluna cortada a 360 px; 4 botões sem nome; calor sempre 500 (UX-C05) | captura, axe, log | inviável no uso principal (D-018/D-022) | reinvenção "montar a loja andando" (tese §4) | vínculo categoria → posição, sugestões de vizinhança | **P0** para D-022 |
| UX-14 | Catálogo | cartão é `<article onClick>`: **não abre pelo teclado** (WCAG 2.1.1); 10.029 px de altura; LCP 7,2 s (`products/performance` 2,3 s) | código, métricas | acessibilidade, lentidão | cartão como link; paginação | desempenho, combos, previsão | P1 |
| UX-15 | Detalhe do produto | LCP 8 s; **130 nós com contraste insuficiente** (pior da aplicação); 3 regiões roláveis sem foco | métricas, axe | leitura difícil | tokens de contraste (DS-01/DS-09) | histórico e previsão | P1 |
| UX-16 | Todas as telas do app | 80–95% dos interativos < 44 px; `landmark-unique` em todas; 4 telas sem h1 | axe, métricas | toque e leitor de tela | DS-08, DS-11 | — | P1 |
| UX-17 | Painel | aba "Alertas" ainda presente, contra D-021 | captura | conceito duplicado | fundir em Hoje | — | P1 |
| UX-18 | Super admin (7 telas) | sem falhas de rede; contraste (Crawler 90–95 nós); 5 `select` sem nome em SaaS | axe | ferramenta interna | tokens | tudo | P2 |

## 5. Fluxos (entrada → contexto → decisão → ação → confirmação → resultado → recuperação)

| Fluxo | Entrada | Contexto | Decisão | Ação | Confirmação | Resultado | Recuperação | Veredito |
|---|---|---|---|---|---|---|---|---|
| Cadastro → 1º acesso | landing com números falsos (UX-C03) | cadastro longo, cota "por mês" errada (UX-C06) | plano | criar conta (202) | "Você já pode entrar" | **login 500** até o hotfix (UX-C01) | nenhuma | quebrado → **corrigido (D-028)** |
| Ativação (agente → 1ª nota) | Painel vazio "tudo em dia" (UX-C04) | nada orienta | — | instalar/parear (10º item do menu) | — | **1ª nota travava a ingestão** | agente reenviaria e esgotaria o pool | quebrado → **ingestão corrigida (D-028)**; orientação ainda falta |
| Decisão de compra | Painel / Central | 145 "comprar" sem critério real | Aceitar | só registra (`01` §5) | lista recarrega | Pedido inteligente diz "0 itens" (UX-09) | — | **não fecha** |
| Promoção | "O que promover" | halo bem explicado | escolher produto | criar campanha — NÃO VERIFICADO (somente leitura) | NÃO VERIFICADO | efetividade medida | NÃO VERIFICADO | parcial |
| Mapa da loja | menu | grade | — | editar seção (Alt+clique) | — | calor 500 | — | **inviável no celular** |

## 6. Cobertura (Gate 3A)

| Item | Coberto | Total | Como |
|---|---|---|---|
| Rotas públicas | 6 | 6 | produção, 4 larguras, axe |
| Rotas do mercado | 15 | 15 | local; 4 larguras (detalhe do produto em 2); axe a 360/1440; loja vazia e com dados |
| Rotas super admin | 7 | 8 | local, 360/1440; detalhe de execução do crawler sem execução para abrir |
| Rotas atrás de flag desligada (ofertas, preços estaduais) | 0 | 13 | inacessíveis por design; estúdio volta ao produto (D-013) e será auditado religado |
| Redirects legados | 0 | 16 | sem tela própria |
| Formulários | 2 exercidos (login, cadastro) | ≥ 6 com `<form>` + outros sem `<form>` | demais só vistos, sem envio |
| Fluxos de ação (aceitar, pedido, campanha, mapa) | 0 clicados | 5 | somente leitura; evidência por código |
| Teclado / leitor de tela | axe em todas as telas; teclado por inspeção (DS-04, UX-14) | — | **navegação real por teclado NÃO VERIFICADA** |
| Desempenho | LCP/CLS em todas; API em 4 telas | — | máquina local, **não a VPS** |

**Itens críticos não verificados:** (1) fluxos de ação clicados; (2) navegação real por teclado;
(3) desempenho na VPS; (4) estúdio de ofertas (desligado).
