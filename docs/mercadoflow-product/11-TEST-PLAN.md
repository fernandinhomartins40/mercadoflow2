# 11 — Plano de testes: F1 "Ativação guiada + testes no CI"

Data: 2026-09-27 · Fase: Prompt 6 · Plano técnico: `10-IMPLEMENTATION-PLAN.md`

Ambientes: **suíte** = `maven:3.9.6-eclipse-temurin-17` (mesma base do Dockerfile) · **local** = PostgreSQL 16 +
backend + frontend + Nginx descartáveis, recriados das imagens mantidas, com a role de aplicação (RLS ativa) ·
**CI** = GitHub Actions · **produção** = conferência só com conta descartável nova.

## 1. Unitários (suíte)

| ID | Alvo | Caso | Esperado |
|---|---|---|---|
| T-01 | `ActivationService` | mercado sem chave, sem nota, sem evento | passo 1 pendente e atual; `complete=false`; `salesDays` não calculado |
| T-02 | idem | chave ativa, heartbeat há 5 min | passo 1 feito com `doneAt` da chave mais antiga; `online=true` |
| T-03 | idem | chave ativa, heartbeat há 2 h | `online=false`, `lastHeartbeatAt` preenchido |
| T-04 | idem | `first_ingest_at` preenchido, sem evento de análise | passo 2 feito; passo 3 atual; `nextAnalysisAt` = hoje 03:30 se agora < 03:30, senão amanhã 03:30 |
| T-05 | idem | 3 passos feitos, 3 dias de venda | `complete=false`, `salesDays=3` |
| T-06 | idem | 3 passos feitos, 10 dias de venda | `complete=true`, `salesDays` limitado a 8 pela consulta, tratado como ≥ 7 |
| T-07 | idem | rejeições por cota nos últimos 7 dias | `rejectedLast7Days` correto; rejeição resolvida não conta |
| T-08 | idem | chave inativa apenas | passo 1 pendente |
| T-09 | `ProductEventService` | `record` do mesmo marco 2× | 1 linha (idempotente); não lança |
| T-10 | idem | evento não-marco 2× | 2 linhas |
| T-11 | `MarketController` | usuário de outro mercado | 403 (padrão de `assertCanAccessMarket`) |

## 2. Banco e integração (local, role de aplicação, RLS ativa)

| ID | Caso | Esperado |
|---|---|---|
| T-20 | Flyway aplica V54 sobre o banco com V1–V53 | sucesso; policy `tenant_isolation` e GRANT presentes |
| T-21 | retroativo da V54 com oportunidades sintéticas | 1 marco por mercado com oportunidade, data = a mais antiga |
| T-22 | V54 reaplicada? | não se aplica (Flyway); `validate-migrations` do CI passa (nenhuma migração antiga alterada) |
| T-23 | cadastro pelo `/register` | evento `activation.registered` gravado sob `runAsSystem` |
| T-24 | pareamento completo (start → approve → claim) | `activation.agent_paired` gravado; endpoint mostra passo 1 feito |
| T-25 | **1ª nota** pelo `/ingest` com HMAC | 200 em ≤ 2 s; `first_ingest_at` e `activation.first_invoice` gravados; nenhuma sessão `idle in transaction` |
| T-26 | 2ª nota e nota mais antiga que a primeira | 200; nenhum evento duplicado; nenhum bloqueio |
| T-27 | job de detecção executado | `activation.first_analysis` gravado uma vez, mesmo com duas execuções |
| T-28 | mercado A lê `/markets/{B}/activation` | 403; `product_events` de B invisível para A com a role de aplicação |
| T-29 | suíte completa | todos os testes existentes + novos passam (base: 189) |

## 3. E2E e responsividade (local, Playwright, 360 × 800 e 1440 × 900)

| ID | Estado preparado | Verificação |
|---|---|---|
| T-40 | mercado novo | checklist visível; passo 1 marcado "próximo passo"; botão "Baixar agente" leva a `/app/download-agente`; **nenhum** "Todos os produtos em dia"; sem aba Alertas |
| T-41 | agente pareado, heartbeat antigo | passo 1 "concluído"; texto de agente offline |
| T-42 | notas recusadas | texto com a contagem; link para Planos |
| T-43 | 1ª nota recebida | passo 3 com o horário da próxima análise |
| T-44 | análise pronta, 3 dias | Painel normal + faixa "Coletando vendas: 3 de 7 dias"; frases "em dia" substituídas |
| T-45 | loja completa (dados sintéticos de 60 dias) | Painel idêntico ao atual (captura comparada); endpoint chamado 1× e sem repetição |
| T-46 | flag desligada | Painel atual; nenhuma chamada a `/activation` |
| T-47 | endpoint com erro (proxy devolvendo 500) | Painel atual como fallback + aviso |
| T-48 | 360 px em T-40…T-44 | `scrollWidth ≤ 360`; CLS ≤ 0,1 na troca carregando → checklist |

## 4. Acessibilidade (local)

| ID | Verificação | Esperado |
|---|---|---|
| T-60 | axe em T-40…T-44, 360 e 1440 px | zero `critical`/`serious` **originados nos componentes novos** (os preexistentes do layout ficam registrados, não bloqueiam) |
| T-61 | teclado: Tab do topo até o botão do passo atual | foco visível em cada parada; ordem lógica |
| T-62 | alvos | todos os interativos novos ≥ 44 × 44 px |
| T-63 | texto | nenhum texto novo < 14 px (rótulos auxiliares ≥ 12 px) |
| T-64 | estado dos passos | legível sem cor (texto "concluído/próximo passo/pendente") |

## 5. Segurança

| ID | Caso | Esperado |
|---|---|---|
| T-70 | anônimo em `/activation` | 401/403, sem dado |
| T-71 | `props` dos eventos | sem e-mail, CPF, IP, nome (inspeção das 4 chamadas + consulta à tabela) |
| T-72 | SUPER_ADMIN | fora: a regra da classe `MarketController` não inclui SUPER_ADMIN (inalterada) |

## 6. CI

| ID | Caso | Esperado |
|---|---|---|
| T-80 | push da fatia | `test-backend` verde; `build-backend` só começa depois dele; deploy conclui |
| T-81 | prova negativa (local, antes do push) | com um teste quebrado de propósito, `mvn -B -q test` sai com código ≠ 0 — é o código que o Actions usa para parar; o teste quebrado **não** é commitado |
| T-82 | duração | registrar o tempo do job; meta ≤ +5 min no pipeline |

## 7. Produção (após o deploy)

| ID | Caso | Esperado |
|---|---|---|
| T-90 | `/health`, página inicial, login de conta existente | 200 |
| T-91 | cadastro de conta descartável nova → Painel a 360 px | checklist no passo 1 |
| T-92 | `docker stats` não é acessível daqui | impacto de recursos justificado pelo §13 do 10 (sem container, 1 tabela pequena) |

## 8. Critérios de pronto da fatia (DoD do protocolo §5)

Requisito R-03 atendido nos estados T-40…T-45 · permissões T-11/T-28/T-70 · 360 e 1440 px T-48 · acessibilidade T-60…T-64 ·
suíte, build do frontend (`npm run build`) e CI T-29/T-80 · migração T-20…T-22 · recursos §13 do 10 ·
documentação 08/09/PROJECT_STATE atualizada · rollback (flag e revert) descrito · nenhum arquivo fora do §5 do 10 alterado.
