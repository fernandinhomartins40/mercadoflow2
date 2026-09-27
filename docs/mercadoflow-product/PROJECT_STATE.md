# PROJECT_STATE — Evolução de produto MercadoFlow

Atualizado em: 2026-09-27

| Campo | Valor |
|---|---|
| Fase atual | Prompt 7 — Implementação da F1 (concluída; deploy em conferência) |
| Último gate aprovado | Gate 5 (2026-09-27, D-036) |
| Gate pendente | **Gate 6** (aceite da F1; não iniciar a próxima fatia) |
| Escopo autorizado | somente leitura e criação de documentos em `docs/mercadoflow-product/` |
| Código alterado nesta fase | hotfixes D-028 (login, erro 500, primeira nota), D-029 (landing, cota semanal, mapa de calor) e D-032 (SSRF, limite de login/cadastro, porta 3300), autorizados fora dos gates e publicados |

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
| Hotfix D-028 (login, erro 500, 1ª nota) | DONE: 169 testes; validado local com RLS; publicado; login 200 em produção |
| Hotfix D-029 (landing, cota semanal, mapa de calor) | DONE: 169 testes; build ok; publicado (`c345766`); conferido em produção |
| Gate 3A: fluxos clicados e teclado (local) | DONE (04 §5.1) |
| Prompt 4: `06-TECHNICAL-ARCHITECTURE.md` e `07-SECURITY-PERFORMANCE-OPERATIONS.md` | DONE |
| Hotfix D-032 (SSRF, limite de tentativas, IP real, porta 3300) | DONE: 189 testes; publicado (`66c6869`); conferido em produção |
| Desligar ambiente local de auditoria | DONE: 4 containers e rede `mfaudit` removidos; imagens mantidas |
| Prompt 5: `08-PRODUCT-REQUIREMENTS.md` e `09-PRIORITIZED-ROADMAP.md` | DONE: 27 requisitos, 21 fatias + V1, cobertura 63/63 |
| Prompt 6: `10-IMPLEMENTATION-PLAN.md` e `11-TEST-PLAN.md` (F1) | DONE |
| F1 — ativação guiada + eventos + `mvn test` no CI | DONE local (D-037); deploy e conferência em produção a seguir |
| Executar testes do backend | DONE: 202 testes, 0 falhas (Java 17, maven:3.9.6-eclipse-temurin-17) |

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
- código (hotfix D-029): `Landing.tsx` (só a parte do hotfix), `Plans.tsx`, `PublicPlanController.java`, `AuthService.java`, `StoreLayoutService.java`
- `docs/mercadoflow-product/06-TECHNICAL-ARCHITECTURE.md`, `07-SECURITY-PERFORMANCE-OPERATIONS.md`
- código (hotfix D-032): `OutboundUrlGuard.java` (+ teste), `LlmClient.java`, `AiCredentialService.java`, `RateLimitFilter.java` (+ teste), `deploy/nginx.vps.conf`, `docker-compose.vps.yml`
- `docs/mercadoflow-product/08-PRODUCT-REQUIREMENTS.md`, `09-PRIORITIZED-ROADMAP.md`
- `docs/mercadoflow-product/10-IMPLEMENTATION-PLAN.md`, `11-TEST-PLAN.md`

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
15. ~~Landing com números falsos~~ e ~~mapa de calor 500~~: corrigidos (D-029).
16. ~~SSRF pelo provedor de IA e login sem limite~~: corrigidos (D-032).
20. Testes fora do CI e sem teste de integração com RLS (OPS-01/02).
21. CPF do consumidor em claro no banco e nos backups; backup sem cópia externa (SEC-04, OPS-03).
17. Contas de teste do `CREDENCIAIS-TESTE.md` retornam 401 em produção; provável secret ausente no GitHub.
18. `DevSeeder` quebra sob RLS (ferramental de desenvolvimento).
19. Conta descartável criada em produção para confirmar UX-C01: ver `scratchpad/prod_audit_account.json` (mercado `d563f027…`), desativar depois.

## Respostas do owner já registradas

D-006 cliente = mercado independente · D-007 estúdio de ofertas volta ao produto · D-008 crawler aceito · D-009 sem piloto real.

## Próxima ação exata

Conferir o deploy da F1 (job `test-backend` verde, `/health`, conta descartável nova vendo o checklist) e parar no
**Gate 6**. Próxima fatia recomendada: F2 (PostgreSQL + RLS no CI) ou F3 (números verdadeiros no Painel) — escolha do owner.
