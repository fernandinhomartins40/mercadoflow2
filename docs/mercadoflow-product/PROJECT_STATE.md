# PROJECT_STATE — Evolução de produto MercadoFlow

Atualizado em: 2026-09-26

| Campo | Valor |
|---|---|
| Fase atual | Prompt 3 — Auditoria de UX, UI e fluxos |
| Último gate aprovado | Gate 2 (2026-09-26, D-024…D-027) |
| Gate pendente | **Gate 3A** (cobertura da auditoria de UX/UI), depois **Gate 3B** |
| Escopo autorizado | somente leitura e criação de documentos em `docs/mercadoflow-product/` |
| Código alterado nesta fase | hotfix D-028 (login, erro 500, primeira nota), autorizado fora dos gates |

## Tarefas

| Tarefa | Status |
|---|---|
| Verificar git status e preservar trabalho do usuário | DONE: 21 arquivos de frontend modificados foram preservados sem alteração |
| Mapear aplicações, stack, build e CI/CD | DONE (estático) |
| Mapear rotas, telas, navegação, APIs, jobs, integrações | DONE (estático) |
| Mapear schema, entidades, tenancy e papéis | DONE (estático); migrations não relidas |
| Mapear UI: componentes, tokens, fontes, ícones | DONE (estático) |
| Prompt 1: `01-CURRENT-PRODUCT.md` e `03-USERS-JOBS-JOURNEYS.md` | DONE (inspeção de código; nenhum fluxo executado) |
| Prompt 2: `02-PRODUCT-THESIS.md` (3 direções, matriz, recomendação A + fundação, arquitetura de informação com 5 destinos, escada de planos) | DONE |
| Prompt 3: `04-UX-UI-AUDIT.md` + `05-DESIGN-SYSTEM-AUDIT.md` (produção pública + ambiente local sintético, 4 larguras, axe, LCP/CLS) | DONE, com lacunas declaradas no §6 do 04 |
| Hotfix D-028 (login, erro 500, 1ª nota) | DONE: 169 testes; validado local com RLS; publicado (run verde); login 200 em produção |
| Executar testes do backend | DONE: 169 testes, 0 falhas (Java 17, maven:3.9.6-eclipse-temurin-17) |

## Testes executados

Prompt 0–2: somente leitura. Prompt 3: Playwright/axe em produção (páginas públicas) e em ambiente local descartável; suíte do backend 169/169; validação do hotfix com RLS.

## Arquivos criados

- `docs/mercadoflow-product/PROJECT_STATE.md`
- `docs/mercadoflow-product/DECISION_LOG.md`
- `docs/mercadoflow-product/00-REPOSITORY-INVENTORY.md`
- `docs/mercadoflow-product/01-CURRENT-PRODUCT.md`
- `docs/mercadoflow-product/03-USERS-JOBS-JOURNEYS.md`
- `docs/mercadoflow-product/02-PRODUCT-THESIS.md`
- `docs/mercadoflow-product/04-UX-UI-AUDIT.md`
- `docs/mercadoflow-product/05-DESIGN-SYSTEM-AUDIT.md`
- código (hotfix D-028): `AuthController.java`, `GlobalExceptionHandler.java`, `PlanService.java`

## Riscos abertos (a aprofundar nas fases seguintes, sem conclusão ainda)

1. A stack descrita no protocolo não confere com o repositório (Spring Boot + React/Vite, não Next.js/Prisma). As etapas técnicas precisam ser adaptadas.
2. Frontend sem testes, sem lint e sem typecheck no script.
3. Módulos grandes construídos e desligados por flag (ofertas: 32 endpoints, 15 componentes do estúdio e render com FFmpeg; preços estaduais). Custo de manutenção e de runtime sem valor exposto ao usuário.
4. Cinco telas órfãs, sendo `SupplierOrders` duplicada de "Pedido inteligente".
5. ~~Crawler: base legal~~ — owner confirmou avaliação e aceite (D-008).
6. Swagger público (`/swagger-ui/**`) liberado no `SecurityConfig`.
7. Não há telemetria de produto nem piloto real (D-009); qualquer métrica de uso é DESCONHECIDA.
8. **Ruptura decisão → ação**: aceitar uma recomendação só grava status (`RecommendationEngine.decide`); não cria item de pedido nem promoção.
9. **Sem onboarding**: o Painel de uma loja sem agente e sem notas diz "Todos os produtos em dia".
10. Dois conceitos de atenção (Alert × Opportunity) e sobreposição entre Painel do dia e Central de Inteligência.
11. Pedido "ENVIADO" não é enviado a ninguém; não há canal de notificação fora do app.
12. Oportunidades de compra, excesso e capital parado derivam de estoque teórico, o que conflita com D-019.
13. A cota do Gratuito rejeita notas excedentes por semana e distorce a análise; a página pública fala "por mês".
14. Não há PWA (manifest/service worker), pré-requisito do push (D-020).
15. Landing afirma "500+ supermercados" e depoimentos sem clientes (UX-C03).
16. Mapa de calor do Mapa da loja sempre em 500 (SQL com colunas inexistentes, UX-C05).
17. Contas de teste do `CREDENCIAIS-TESTE.md` retornam 401 em produção; provável secret ausente no GitHub.
18. `DevSeeder` quebra sob RLS (ferramental de desenvolvimento).
19. Conta descartável criada em produção para confirmar UX-C01: ver `scratchpad/prod_audit_account.json` (mercado `d563f027…`), desativar depois.

## Respostas do owner já registradas

D-006 cliente = mercado independente · D-007 estúdio de ofertas volta ao produto · D-008 crawler aceito · D-009 sem piloto real.

## Próxima ação exata

Aguardar o **Gate 3A** (cobertura da auditoria de UX/UI e itens críticos não verificados, §6 do 04). Se aprovado, executar **somente o Prompt 4** (arquitetura, segurança, desempenho e operação) e parar no Gate 3B.
