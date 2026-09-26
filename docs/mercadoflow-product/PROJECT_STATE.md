# PROJECT_STATE — Evolução de produto MercadoFlow

Atualizado em: 2026-09-26

| Campo | Valor |
|---|---|
| Fase atual | Prompt 2 — Tese de produto |
| Último gate aprovado | Gate 1 com correções (2026-09-26, D-015) |
| Gate pendente | **Gate 2**: escolha da direção de produto |
| Escopo autorizado | somente leitura e criação de documentos em `docs/mercadoflow-product/` |
| Código alterado nesta fase | nenhum |

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
| Executar a aplicação e observar fluxos | NOT_STARTED: fica para o Prompt 3, se autorizado |
| Executar testes do backend | NOT_STARTED: não é comando de inventário; proposto para o Prompt 4 |

## Testes executados

Nenhum. Foram executados apenas comandos de leitura (`git status`, `grep`, `find`, `ls`).

## Arquivos criados

- `docs/mercadoflow-product/PROJECT_STATE.md`
- `docs/mercadoflow-product/DECISION_LOG.md`
- `docs/mercadoflow-product/00-REPOSITORY-INVENTORY.md`
- `docs/mercadoflow-product/01-CURRENT-PRODUCT.md`
- `docs/mercadoflow-product/03-USERS-JOBS-JOURNEYS.md`
- `docs/mercadoflow-product/02-PRODUCT-THESIS.md`

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

## Respostas do owner já registradas

D-006 cliente = mercado independente · D-007 estúdio de ofertas volta ao produto · D-008 crawler aceito · D-009 sem piloto real.

## Próxima ação exata

Aguardar a escolha do **Gate 2** (direção + decisões do §11 de `02-PRODUCT-THESIS.md`). Se aprovado, executar **somente os Prompts 3 e 4** (auditorias de UX/UI e técnica), parando nos gates 3A e 3B.
