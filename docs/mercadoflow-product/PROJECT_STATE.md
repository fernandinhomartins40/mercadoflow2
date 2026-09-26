# PROJECT_STATE — Evolução de produto MercadoFlow

Atualizado em: 2026-09-26

| Campo | Valor |
|---|---|
| Fase atual | Prompt 0 — Inicialização e inventário verificável |
| Último gate aprovado | nenhum |
| Gate pendente | **Gate 0**: aprovação do inventário |
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
| Executar a aplicação e observar fluxos | NOT_STARTED: fica para o Prompt 3, se autorizado |
| Executar testes do backend | NOT_STARTED: não é comando de inventário; proposto para o Prompt 4 |

## Testes executados

Nenhum. Foram executados apenas comandos de leitura (`git status`, `grep`, `find`, `ls`).

## Arquivos criados

- `docs/mercadoflow-product/PROJECT_STATE.md`
- `docs/mercadoflow-product/DECISION_LOG.md`
- `docs/mercadoflow-product/00-REPOSITORY-INVENTORY.md`

## Riscos abertos (a aprofundar nas fases seguintes, sem conclusão ainda)

1. A stack descrita no protocolo não confere com o repositório (Spring Boot + React/Vite, não Next.js/Prisma). As etapas técnicas precisam ser adaptadas.
2. Frontend sem testes, sem lint e sem typecheck no script.
3. Módulos grandes construídos e desligados por flag (ofertas: 32 endpoints, 15 componentes do estúdio e render com FFmpeg; preços estaduais). Custo de manutenção e de runtime sem valor exposto ao usuário.
4. Cinco telas órfãs, sendo `SupplierOrders` duplicada de "Pedido inteligente".
5. Crawler em cerca de 30 sites de varejo: base legal e termos de uso não documentados.
6. Swagger público (`/swagger-ui/**`) liberado no `SecurityConfig`.
7. Não há telemetria de produto; qualquer métrica de uso será, por ora, DESCONHECIDA.

## Próxima ação exata

Aguardar a resposta ao Gate 0. Se aprovado, executar **somente o Prompt 1** (descoberta do produto atual → `01-CURRENT-PRODUCT.md` e `03-USERS-JOBS-JOURNEYS.md`).
