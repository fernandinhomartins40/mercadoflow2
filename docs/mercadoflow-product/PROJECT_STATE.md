# PROJECT_STATE — Evolução de produto MercadoFlow

Atualizado em: 2026-09-26

| Campo | Valor |
|---|---|
| Fase atual | Prompt 1 — Descoberta do produto atual |
| Último gate aprovado | Gate 0 (2026-09-26, D-010) |
| Gate pendente | **Gate 1**: validação do diagnóstico |
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

## Respostas do owner já registradas

D-006 cliente = mercado independente · D-007 estúdio de ofertas volta ao produto · D-008 crawler aceito · D-009 sem piloto real.

## Próxima ação exata

Aguardar a validação do **Gate 1** (diagnóstico + perguntas de `01-CURRENT-PRODUCT.md` §12). Se aprovado, executar **somente o Prompt 2** (tese de produto, 3 direções → `02-PRODUCT-THESIS.md`).
