# 08 — Requisitos de produto

Data: 2026-09-27 · Fase: Prompt 5 · Base: achados de 01–07 e decisões D-001…D-032.
Nada aqui foi implementado nesta fase, exceto o que está marcado **FEITO** (hotfixes autorizados fora dos gates).

Prioridade: **P0** impede confiança, segurança, integridade ou validação do produto · **P1** melhora o core loop e o
valor recorrente · **P2** eficiência, refinamento e escala. Critério de ordenação: impacto, esforço, risco e força da
evidência (qualitativos; sem pontuação numérica).

## Regras transversais (valem para todo requisito)

| Tema | Regra |
|---|---|
| Celular primeiro (D-018) | toda tela nova ou alterada é validada a 360 px antes do desktop; sem rolagem horizontal |
| Acessibilidade essencial | foco visível, rótulo em todo campo, alvo de toque ≥ 44 px, texto ≥ 14 px em conteúdo e ≥ 12 px em rótulo auxiliar, contraste AA, Esc fecha diálogo; axe sem `critical`/`serious` nas telas tocadas |
| Permissão | checada no servidor (`assertCanAccessMarket` + RLS); o frontend só esconde |
| RLS | toda escrita fora de tenant usa `TenantContext.runAsSystem`; todo requisito que escreve tem teste com a role de aplicação (R-02) |
| Números | formatação pt-BR única (`R$ 1.234,56`, `8,0%`); período sempre explícito |
| Estados | carregando, vazio honesto (com próxima ação), erro com recuperação, parcial (dados incompletos avisados) |
| Recursos | sem container novo; cálculo pesado no cron, não na leitura; orçamento do 07 §4 |
| Rollback | feature flag quando muda comportamento visível; migração só aditiva |

## P0

### R-01 — Borda segura: SSRF, limite de tentativas e porta da stack · **FEITO** (D-032)

| Campo | Conteúdo |
|---|---|
| Problema / usuário | SEC-01/02/03: o provedor de IA `CUSTOM` chamava qualquer URL; login e cadastro sem limite; limite do pareamento contornável; stack exposta em `:3300` sem TLS. Afeta todos os mercados e a VPS compartilhada |
| Resultado | chamadas de IA só para https público; força bruta e cadastro em massa barrados; IP real usado nos limites |
| Comportamento | URL validada ao salvar e antes de cada chamada, sem seguir redirecionamento; login 20/min por IP e 10/15 min por e-mail; cadastro 5/h por IP; 429 com mensagem em pt-BR e `Retry-After` |
| Estados de UI | mensagem de erro do login/cadastro exibe o texto do 429; formulário de IA mostra o motivo da recusa da URL |
| Regras | `X-Real-IP` confiável só vindo de rede privada (realip no Nginx da stack); stack publicada só em `127.0.0.1` |
| Dados / eventos | log `Chamada de IA bloqueada`; nenhum dado novo |
| Acessibilidade | mensagem de erro anunciada (já existe no formulário) |
| Segurança | OWASP A07/A10 |
| Desempenho | buckets em memória com teto de 50 mil chaves |
| Telemetria | contagem de 429 no log (sem painel) |
| Aceite | 11ª tentativa com o mesmo e-mail → 429; `http://host:3300` recusa conexão; URL `https://127.0.0.1` recusada ao salvar; 189 testes |
| Fora de escopo | CAPTCHA, bloqueio de conta, WAF |

### R-02 — Rede de proteção: testes no CI e teste de integração com RLS

| Campo | Conteúdo |
|---|---|
| Problema / usuário | OPS-01/OPS-02/SEC-00: o workflow não roda testes (Dockerfile `-DskipTests`); os três bugs críticos de 26/09 (login, 1ª nota, erro 500) eram invisíveis a teste unitário. Afeta todos |
| Resultado | nenhum deploy sai com teste falhando; a classe "funciona como dono do schema, quebra sob RLS" é pega antes da produção |
| Comportamento | job de teste antes do build no `deploy-pdv2cloud-web.yml`; suíte de integração que sobe PostgreSQL 16, aplica as migrações com a role dona e roda os fluxos críticos (cadastro, login, ingestão da 1ª e da 2ª nota, isolamento entre mercados) com a role de aplicação |
| Estados de UI | — |
| Regras | falha de teste bloqueia o deploy |
| Dados / eventos | banco descartável por execução |
| Segurança | prova de isolamento entre tenants a cada push |
| Desempenho | tempo do pipeline: medir antes/depois; meta ≤ +5 min |
| Telemetria | duração do job no Actions |
| Aceite | reintroduzir o bug do login (remover `runAsSystem`) faz o pipeline falhar; revert faz passar |
| Fora de escopo | testes E2E de frontend no CI (P2, R-27) |
| Nota | exige PostgreSQL no CI: serviço `postgres` do GitHub Actions (sem dependência nova) ou Testcontainers (dependência nova, a justificar no Prompt 6) |

### R-03 — Ativação guiada até a primeira nota

| Campo | Conteúdo |
|---|---|
| Problema / usuário | UX-C04, D-014, D-021: loja sem agente vê quatro "R$ 0,00" e "Todos os produtos em dia!", sem orientação. Dono que instala sozinho |
| Resultado | o dono sabe em que passo está e o que fazer até ver a primeira nota analisada |
| Comportamento | enquanto não houver 1ª nota, o Painel (depois Hoje) mostra um checklist no lugar dos KPIs: (1) baixar o agente, (2) parear o PDV, (3) primeira nota recebida, (4) primeira análise pronta. Cada passo marca sozinho a partir do estado real (pareamento, `first_ingest_at`, 1º cálculo). Depois da 1ª nota e antes de haver dias suficientes, mostra "coletando: N notas, X dias; primeira análise em ~Y dias" |
| Estados de UI | nenhum passo, passo a passo, erro de pareamento (código expirado), nota rejeitada por cota (aviso), concluído (some) |
| Regras | visível para dono e gerente; só o dono vê "baixar agente" com o link de instalação |
| Dados / eventos | lê estados existentes (pareamento, `markFirstIngest`); eventos `activation_step_completed` (R-05) |
| Acessibilidade | lista ordenada com estado textual (não só ícone); botões ≥ 44 px |
| Segurança | nenhum dado novo exposto |
| Desempenho | uma consulta leve de estado; sem cálculo analítico enquanto não houver notas |
| Telemetria | tempo cadastro → 1ª nota; % de mercados que concluem cada passo |
| Aceite | mercado recém-criado vê o passo 1; após parear vê o passo 3 pendente; após a 1ª nota vê "coletando"; nunca vê "Todos os produtos em dia" sem dados |
| Fora de escopo | vídeo tutorial, instalação remota, suporte por chat |

### R-04 — Números verdadeiros no Painel

| Campo | Conteúdo |
|---|---|
| Problema / usuário | UX-01, UX-07: "Transações" e "Faturamento" do Painel do dia somam 60 dias; "+100,0% vs semana passada" incoerente; textos com número em formato americano. Dono e comprador |
| Resultado | todo número diz a que período se refere e bate com a fonte |
| Comportamento | KPIs "hoje" comparados com o mesmo dia da semana anterior; se hoje ainda não tem nota, mostrar "ontem" com rótulo; variação só quando a base > 0; textos gerados com formatador pt-BR único (backend e frontend) |
| Estados de UI | sem base de comparação ("sem comparação"), dia parcial ("até 14h") |
| Regras | mesmo cálculo para dono e gerente |
| Dados / eventos | `sales_analytics`/notas; nenhuma tabela nova |
| Acessibilidade | variação com texto ("alta de 8,0%"), não só cor |
| Desempenho | consulta por dia, não varredura de 60 dias |
| Telemetria | — |
| Aceite | com notas sintéticas conhecidas, KPI do dia = soma das notas do dia; nenhum texto com `,` como separador de milhar |
| Fora de escopo | metas, projeções |

### R-05 — Telemetria mínima de produto

| Campo | Conteúdo |
|---|---|
| Problema / usuário | D-009 e risco 7: não há uso real nem medição; nenhuma hipótese da tese pode ser validada. Owner |
| Resultado | as métricas de ativação e do core loop existem desde o primeiro cliente |
| Comportamento | tabela de eventos de produto no próprio PostgreSQL (append-only, por mercado), gravada pelo backend nos pontos de negócio: cadastro, pareamento, 1ª nota, 1ª análise, recomendação aceita/recusada, pedido criado/enviado (canal), push aberto, upgrade. Consulta agregada no super admin |
| Estados de UI | só super admin |
| Regras | sem dado pessoal (sem e-mail, CPF, IP); retenção definida (proposta: 13 meses) |
| Dados / eventos | nova tabela `product_events(market_id, type, occurred_at, props jsonb)` com RLS |
| Segurança / LGPD | minimização; sem terceiro (nada de analytics externo) |
| Desempenho | 1 insert assíncrono por evento; volume baixo |
| Telemetria | é o próprio requisito |
| Aceite | cada evento listado aparece uma vez por ação num fluxo E2E local; consulta de funil por mercado |
| Fora de escopo | ferramenta de analytics de terceiros, gravação de sessão, métricas de frontend |

### R-06 — Reposição pelo vendido (quantidade sem estoque)

| Campo | Conteúdo |
|---|---|
| Problema / usuário | UX-09, D-019, D-025: o Pedido inteligente diz "nenhuma reposição necessária" enquanto a Central manda comprar 145 produtos — duas respostas opostas à pergunta central do comprador |
| Resultado | uma só resposta para "o que repor, quanto e de quem" |
| Comportamento | por fornecedor: quantidade = vendido desde o último pedido desse fornecedor, corrigido por tendência e sazonalidade (`ExpectedDemandService`, `SeasonalCalendarService`); no primeiro pedido usa a janela do ciclo informado ("peço a cada N dias", padrão 7). Cada linha mostra "vendeu X desde DD/MM; sugerido Y" e o motivo da correção |
| Estados de UI | produto sem fornecedor (agrupado em "sem fornecedor", com atalho para vincular), fornecedor sem ciclo (pede o ciclo), histórico curto (< 14 dias: aviso de baixa confiança), sem vendas desde o pedido |
| Regras | comprador (gerente) e dono editam; cálculo idêntico no servidor para ambos |
| Dados / eventos | ciclo por fornecedor (coluna nova, migração aditiva); data do último pedido vem de `SupplierOrder` |
| Acessibilidade | tabela vira lista de cartões a 360 px; quantidades editáveis com rótulo |
| Desempenho | calculado no cron e no refresh incremental pós-ingestão, lido pronto |
| Telemetria | quantidade sugerida × quantidade enviada (aceitação da sugestão) |
| Aceite | com vendas sintéticas conhecidas, sugerido = vendido × fatores documentados; Central e Comprar mostram o mesmo número para o mesmo produto |
| Fora de escopo | estoque, NF de entrada, previsão por IA |

### R-07 — Sinais de venda no lugar do estoque teórico

| Campo | Conteúdo |
|---|---|
| Problema / usuário | D-019, D-026, UX-10, UX-11 (parte), 06 §3: oportunidades de excesso, capital parado e compra por cobertura derivam de `compras − vendas` e, sem compras, mandam "comprar" 100% dos produtos |
| Resultado | toda oportunidade nasce de um sinal de venda verificável |
| Comportamento | `CapitalOpportunityDetector` passa a emitir: queda de giro, sem venda há X dias (item de giro), ruptura provável (venda que para abruptamente). Oportunidades antigas de estoque são encerradas com motivo "regra substituída" (migração de dados, não apagadas). Telas deixam de exibir "dias de estoque", capital, GMROI sem dado de compra |
| Estados de UI | explicação "como chegamos nesse número" com os dados de venda |
| Regras | limiares configuráveis por mercado com padrão |
| Dados / eventos | status das oportunidades antigas; nenhuma tabela nova |
| Desempenho | no cron, incremental |
| Telemetria | aceite/recusa por tipo de sinal |
| Aceite | loja sem compras não recebe nenhuma oportunidade baseada em estoque; os três sinais disparam em dados sintéticos preparados para cada caso |
| Fora de escopo | recalibração por IA |

### R-08 — "Hoje": feed único, priorizado e paginado

| Campo | Conteúdo |
|---|---|
| Problema / usuário | UX-05 (147 cards, 53 mil px), PERF-05, UX-03, UX-06, UX-17, D-021: excesso de informação, Alertas duplicando oportunidades |
| Resultado | o comprador vê primeiro as 5–10 decisões de maior impacto, cada uma com motivo e ação |
| Comportamento | Painel do dia + Central + Resumo semanal numa tela: "fazer agora" (top N por impacto, agrupado por fornecedor/tipo), "acompanhando", "resultados"; "ver mais" pagina no servidor. Cada item: motivo, impacto em R$, ação (Aceitar → R-11, Não faz sentido). Alertas deixam de ser gerados; o que era alerta vira oportunidade ou some |
| Estados de UI | loja sem dados (R-03), nada a fazer ("em dia" só com dados suficientes), carregando, erro |
| Regras | um KPI de pendências (fim da duplicidade UX-06) |
| Dados / eventos | `AlertGenerationJob` desligado por flag; tabela de alertas preservada até o fim do rollback |
| Acessibilidade | lista com cabeçalhos por grupo; ações nomeadas |
| Desempenho | ≤ 30 itens por página; nós DOM < 800 na primeira tela |
| Telemetria | tempo até a primeira decisão; decisões por sessão |
| Aceite | com 147 oportunidades, a primeira tela a 360 px mostra ≤ 10 itens e a página tem < 5 telas de altura; nenhuma chamada a endpoints de alerta |
| Fora de escopo | personalização do feed |

### R-09 — Acessibilidade essencial nas telas prioritárias

| Campo | Conteúdo |
|---|---|
| Problema / usuário | DS-03 (texto 9–11 px), DS-04 (`outline-none` sem substituto), DS-10 (campos sem rótulo), UX-16 (alvos < 44 px). Uso no celular, em luz de loja |
| Resultado | Login, Cadastro, Hoje, Comprar e Loja/Agente legíveis e operáveis por toque e teclado |
| Comportamento | anel de foco global via `focus-visible` no `tailwind.css`; escala tipográfica mínima; rótulos associados; alvos ≥ 44 px nos componentes `Button`/campos |
| Aceite | axe sem `critical`/`serious` nessas telas a 360 e 1440 px; Tab percorre tudo com foco visível |
| Fora de escopo | varredura das demais telas (R-20); leitor de tela completo (lacuna aceita em D-030) |
| Demais campos | sem dados, eventos, segurança ou desempenho próprios; telemetria: — |

### R-10 — Validação com usuários antes de construir o núcleo

| Campo | Conteúdo |
|---|---|
| Problema / usuário | D-009, 02 §3/§7: nenhum cliente; o risco principal da direção A é o comprador não confiar na quantidade |
| Resultado | evidência de 3–5 compradores sobre o fluxo Hoje → Comprar → Enviar antes de R-11/R-12 |
| Comportamento | protótipo navegável (frontend com dados sintéticos, atrás de flag) + roteiro de teste; se houver loja com dados reais, teste "concierge" do pedido sugerido |
| Aceite | relatório com tarefas, taxas de sucesso e citações; decisão registrada no DECISION_LOG |
| Fora de escopo | pesquisa quantitativa |
| Dono | owner recruta; Claude prepara protótipo e roteiro |

## P1

### R-11 — Aceitar COMPRAR vai ao rascunho do pedido, com desfazer

| Campo | Conteúdo |
|---|---|
| Problema | D-011, risco 8: aceitar só grava status (`RecommendationEngine.decide`) |
| Comportamento | aceitar insere/atualiza o item no rascunho do fornecedor (cria rascunho se não houver); toast "Adicionado ao pedido de X · Desfazer" (10 s) e desfazer também no próprio rascunho; produto sem fornecedor pede o fornecedor na hora |
| Estados | sem fornecedor, rascunho já enviado (cria novo), item já no rascunho (soma ou substitui: substitui pela sugestão) |
| Regras | gerente e dono; servidor valida mercado e fornecedor |
| Dados / eventos | `SupplierOrder`/itens existentes; evento `recommendation_accepted` com `order_id` |
| Aceite | aceitar → item no rascunho com a quantidade de R-06; desfazer → rascunho volta ao estado anterior; teste com RLS |
| Fora de escopo | aceitar em lote (P2) |

### R-12 — Enviar o pedido por vários canais

| Campo | Conteúdo |
|---|---|
| Problema | D-012, risco 11: "ENVIADO" não vai a ninguém |
| Comportamento | ao enviar, escolher: WhatsApp (texto pronto pelo `wa.me`/compartilhar do celular), PDF (gerado no backend), lista de conferência para o representante (mesma fonte, formato de checklist), exportação CSV para portal |
| Estados | fornecedor sem telefone (pede), sem itens (bloqueia), PDF gerando |
| Regras | canais por plano conforme R-21; marcar "enviado" registra canal e data (base do próximo ciclo de R-06) |
| Dados / eventos | canal e data no pedido (coluna aditiva); evento `order_sent{channel}` |
| Aceite | texto do WhatsApp com itens, quantidades e unidade; PDF abre no celular; data do envio usada no cálculo seguinte |
| Fora de escopo | integração por API com portais; envio automático |

### R-13 — Fornecedores prontos para a reposição

| Campo | Conteúdo |
|---|---|
| Problema | 02 §3 "dados necessários", UX-19: vínculo produto → fornecedor desconhecido; cadastro de fornecedor em dois passos, sem diálogo acessível |
| Comportamento | cadastro de fornecedor num `Sheet` único (foco preso, Esc); campo "peço a cada N dias"; vincular produtos a partir da lista "sem fornecedor" de R-06, em lote |
| Aceite | fluxo cadastro + vínculo de 10 produtos em ≤ 2 min no celular (teste guiado) |
| Fora de escopo | busca por CNPJ na Receita |

### R-14 — Arquitetura de informação em 5 destinos

| Campo | Conteúdo |
|---|---|
| Problema | D-021, 02 §8, risco 4, UX-17: 14 destinos, telas órfãs (`SupplierOrders` duplicada), Alertas |
| Comportamento | Hoje · Comprar · Produtos · Vender · Loja; barra inferior no celular, lateral no desktop; "Pergunte aos dados" como ação global; rotas antigas redirecionam para o novo destino; telas órfãs removidas da navegação e depois do código |
| Aceite | todas as rotas antigas redirecionam; nenhuma tela alcançável fora dos 5 destinos exceto super admin; teste de navegação por teclado |
| Fora de escopo | reescrever telas internas (cada destino herda as telas até sua fatia) |

### R-15 — PWA instalável e push

| Campo | Conteúdo |
|---|---|
| Problema | D-020, risco 14: não há manifest nem service worker; notificação só por push |
| Comportamento | manifest, ícones, service worker (só cache de estáticos; API sem cache); Web Push com VAPID no backend; inscrição por usuário; primeiros pushes: "hora de pedir para X" (ciclo de R-13) e "primeira análise pronta" (R-03); preferências por tipo |
| Regras | chave VAPID como segredo estável (como `AI_ENCRYPTION_KEY`); push nunca inclui valor financeiro no texto da notificação bloqueada |
| Dados / eventos | tabela de inscrições (aditiva); eventos `push_sent`, `push_opened` |
| Recursos | envio pelo cron, sem fila nem container |
| Aceite | Android/Chrome instala e recebe push de teste; iOS ≥ 16.4 com PWA na tela inicial; desinscrever para de enviar |
| Fora de escopo | app nativo, e-mail, WhatsApp como notificação |

### R-16 — Leitura barata (materialização)

| Campo | Conteúdo |
|---|---|
| Problema | PERF-01/02, UX-04, UX-12, UX-14, UX-15; 06 §3 (agregado diário só "ontem") |
| Comportamento | cockpit, desempenho de produtos e recomendações de promoção lidos de tabelas calculadas no cron e atualizadas incrementalmente após a ingestão; carga histórica também alimenta o agregado |
| Aceite | endpoints ≤ 300 ms no ambiente local com 34 mil itens; LCP ≤ 2,5 s a 360 px nas rotas prioritárias (Playwright); CPU do cron dentro de 1 vCPU |
| Fora de escopo | cache externo (Redis) |

### R-17 — Detecção sob demanda assíncrona

| Campo | Conteúdo |
|---|---|
| Problema | UX-08, PERF-03: "Analisar agora" > 60 s → 504 |
| Comportamento | o botão agenda a tarefa e mostra progresso; um pedido por mercado por vez; resultado aparece no Hoje |
| Aceite | nenhum 504; segundo clique durante a execução não duplica |

### R-18 — Ingestão e carga histórica mais rápidas

| Campo | Conteúdo |
|---|---|
| Problema | PERF-04: ≈0,4 s/nota; um ano de histórico levaria horas; recálculo de preço por nota |
| Comportamento | recálculo pesado fora do caminho da nota (marcado e processado em lote pelo cron) |
| Aceite | ≤ 0,1 s/nota no ambiente local; resultados analíticos idênticos antes/depois no mesmo conjunto |

### R-19 — Nada cortado a 360 px

| Campo | Conteúdo |
|---|---|
| Problema | UX-02 (Painel), UX-11 (abas de Promoções, título da barra), UX-13 (coluna do mapa) |
| Comportamento | contêineres fluidos, abas roláveis com indicação, título da barra igual ao do menu |
| Aceite | nenhuma rolagem horizontal da página a 360 px nas rotas do app (teste automatizado de `scrollWidth`) |

### R-20 — Design system aplicado

| Campo | Conteúdo |
|---|---|
| Problema | DS-01, DS-02, DS-05, DS-06, DS-08, DS-09; UX-14 (cartão `<article onClick>`), UX-15 (130 nós sem contraste), UX-16, UX-19, UX-20 (placeholder como rótulo) |
| Comportamento | cada fatia migra as telas que toca para tokens, `Button`, `Modal`/`Sheet` e rótulos visíveis; cartão do catálogo vira link |
| Aceite | por tela migrada: 0 literais de cor, axe sem `serious`; contagens do 05 caem a cada fatia (medidas pelo mesmo script) |
| Fora de escopo | modo escuro; migração de telas fora das fatias |
| Nota | o owner tem 21 arquivos de frontend alterados localmente (Button, Card, Modal, Table, tokens…) que vão na mesma direção; a fatia que tocar esses arquivos precisa combinar com esse trabalho antes |

### R-21 — Escada de planos coerente

| Campo | Conteúdo |
|---|---|
| Problema | D-023, D-027 (risco), 02 §9: Gratuito limitado por volume corta o fim da semana; recorte de 5 itens em `PlanService:701` a confirmar; 1 PDV |
| Comportamento | aviso na tela quando a análise estiver incompleta por cota ("a análise desta semana não inclui notas após DD/MM"); limites dos pagos aplicados às novas capacidades (fornecedores, canais de envio, horizonte, encartes) conforme tabela do 02 §9 revisada no Gate de cada fatia; bloqueado aparece contado, nunca oculto |
| Aceite | cada limite tem teste no servidor; Gratuito executa o ciclo completo para 1 fornecedor |
| Fora de escopo | mudar preços ou a cota (D-023, D-027); plano REDE (DECISÃO NECESSÁRIA) |

### R-22 — Segurança e operação complementares

| Campo | Conteúdo |
|---|---|
| Problema | SEC-05 (sem HSTS/CSP/X-Frame-Options, versão do nginx exposta), SEC-04 (CPF em claro), OPS-03 (backup só na VPS, sem ensaio), OPS-04 (sem id de correlação) |
| Comportamento | cabeçalhos e `server_tokens off` no Nginx do host (via `deploy-web.sh`) e da stack; CPF guardado só como HMAC (migração que preenche o hash e anula o texto, em etapas reversíveis até a última); backup cifrado com cópia fora da VPS e ensaio de restauração documentado; id de correlação no MDC e na resposta |
| Aceite | `curl -I` mostra os cabeçalhos; nenhuma coluna com CPF em claro; restauração ensaiada com tempo medido; log de uma requisição tem o mesmo id do começo ao fim |
| Fora de escopo | SIEM, rastreamento distribuído |

### R-23 — Estúdio de ofertas de volta ao menu (Vender)

| Campo | Conteúdo |
|---|---|
| Problema | D-007, D-013, risco 3: 32 endpoints e 15 componentes desligados por flag |
| Comportamento | ferramenta independente em Vender; render com fila existente (`OfferGenerationJob`) e teto de CPU; limites por plano (R-21) |
| Aceite | gerar um encarte a 360 px; CPU do render dentro do teto medido na VPS |
| Fora de escopo | vínculo automático com oportunidades (D-013) |

### R-24 — Mapa da loja "montar a loja andando"

| Campo | Conteúdo |
|---|---|
| Problema | D-022, UX-13 (Alt+clique, coluna cortada, botões sem nome), UX-C05 (calor corrigido, mas categorias vazias nos produtos vindos da nota) |
| Comportamento | 1º protótipo e teste com 3–5 donos (hipótese do 02 §4); depois: lista vertical de corredores com foto opcional, faixas coloridas pelo desempenho, sugestões de vizinhança pela cesta; categorização dos produtos da nota como pré-requisito do calor |
| Aceite | cadastrar uma loja de 8 corredores a 360 px sem teclado; calor com < 10% "sem categoria" |
| Fora de escopo | planta em grade, realidade aumentada |

### R-25 — Rede: filtro "todas as lojas"

| Campo | Conteúdo |
|---|---|
| Problema | D-017, direção C |
| Comportamento | filtro em Hoje e Produtos no plano Profissional; divergência "vende numa, não na outra" como sinal no feed |
| Aceite | com 2 lojas sintéticas, comparação item a item correta; usuário sem acesso a uma loja não a vê (RLS) |

### R-26 — Promoções sem presunções

| Campo | Conteúdo |
|---|---|
| Problema | UX-11: margem de 25% presumida; "0 dias de estoque" |
| Comportamento | margem só quando informada (senão, esconder e explicar); sem estoque (R-07) |
| Aceite | nenhuma margem exibida sem custo informado |

## P2

### R-27 — Higiene e ferramental

| Item | Achado | Critério de aceite |
|---|---|---|
| a | SEC-07: `/auth/me` em páginas públicas responde 403 | páginas públicas não chamam `/auth/me`; anônimo recebe 401 |
| b | SEC-08: cabeçalho ausente no ingest vira 500 | 400 com mensagem |
| c | SEC-06: Swagger/actuator liberados no `SecurityConfig` | fechados em produção por perfil |
| d | SEC-09: contas de teste 401 em produção | secret conferido ou arquivo retirado |
| e | SEC-10: 2 mercados de auditoria em produção | desativados (owner decide quando) |
| f | OPS-07: `DevSeeder` quebra sob RLS | perfil `dev` sobe com a role de aplicação |
| g | risco 2: frontend sem lint/typecheck/testes | `tsc --noEmit` e lint no CI |
| h | DS-07 (`common` × `ui`), DS-11 (`<main>`, h1), DS-12 (raios) | um conjunto de componentes; axe sem `landmark-one-main` |
| i | UX-18: super admin (contraste, `select` sem nome) | axe sem `critical` |
| j | 06 §3: outros `REQUIRES_NEW` com risco de auto-bloqueio | revisados com teste de R-02 |
| k | UX-06: KPI duplicado | coberto por R-08 |

## NÃO FAZER (agora)

| Item | Justificativa |
|---|---|
| NF de entrada / controle de estoque | D-019 |
| Preços estaduais e indústria como destino | fora da tese aprovada (02 §3 "adiar"); sem cliente; permanecem atrás de flag sem manutenção evolutiva |
| Notificação por WhatsApp/e-mail | D-020 |
| Mudar preços ou cota do Gratuito | D-023, D-027 |
| Modo escuro | sem pedido nem evidência |
| Plano REDE | DECISÃO NECESSÁRIA do owner, fora deste roadmap |
