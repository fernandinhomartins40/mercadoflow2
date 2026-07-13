# Segurança Multi-Tenant — Guia Operacional (Fases 0 e 1)

Este documento acompanha a implementação das Fases 0 e 1 do `PLANO_MULTI_TENANT.md`.
Ele cobre **os passos manuais que não podem ser automatizados pelo código** e explica a
arquitetura de isolamento introduzida.

---

## 1. Passos manuais obrigatórios (Fase 0 — fazer AGORA)

### 1.1 Rotacionar o segredo JWT

O segredo antigo esteve versionado no Git e deve ser considerado **comprometido**.

```bash
# Gerar novo segredo (64 bytes, base64)
openssl rand -base64 64 | tr -d '\n'
```

Coloque o valor em `JWT_SECRET` no `.env` (ver `.env.example`). A aplicação **não sobe
mais sem** `JWT_SECRET` (o default foi removido do `application.yml` de propósito).

> ⚠️ A rotação invalida todas as sessões ativas — todos os usuários precisarão logar de novo.

### 1.2 Trocar as senhas administrativas

As senhas `MercadoFlow@2026` e `SuperAdmin@2026` estavam versionadas. Troque-as no banco
de produção imediatamente (via painel super-admin ou SQL com hash BCrypt novo) e defina
`ADMIN_PASSWORD`/`SUPER_ADMIN_PASSWORD` apenas via ambiente. O `ProductionSeeder` agora
**não cria usuários** quando essas variáveis estão vazias (e não tem mais defaults).

### 1.3 Purgar o histórico do Git

`CREDENTIALS.md` e `SUPER_ADMIN_TEST_CREDENTIALS.md` foram removidos do working tree e
adicionados ao `.gitignore`, mas **continuam no histórico**. A purga reescreve commits —
coordene com todos os clones antes de executar:

```bash
pip install git-filter-repo
git filter-repo --invert-paths \
  --path CREDENTIALS.md \
  --path SUPER_ADMIN_TEST_CREDENTIALS.md
# depois: force-push e re-clone em todas as máquinas/CI
git push origin --force --all
git push origin --force --tags
```

O segredo JWT antigo também aparece no histórico de `application.yml`/`docker-compose.yml`;
como esses arquivos não podem ser removidos, a mitigação é a **rotação** (1.1) — o valor
vazado deixa de ter serventia.

---

## 2. Arquitetura de isolamento (Fase 1)

O isolamento deixou de ser "opt-in manual" e passou a ter **três camadas**:

| Camada | Componente | O que garante |
|---|---|---|
| 1 | `TenantAccessFilter` | Toda rota `/api/v1/markets/{marketId}/**` é validada automaticamente contra o tenant do principal autenticado (403 em divergência). Nenhum endpoint novo precisa lembrar de chamar `assertCanAccessMarket`. |
| 2 | `MarketAccessService` (chamadas existentes) | Redundância defensiva mantida nos controllers. |
| 3 | Row-Level Security (PostgreSQL, migration V29) | Mesmo com bug de aplicação, a role `pdv2cloud_app` só enxerga linhas do tenant em `app.current_market`, setado por `TenantAwareDataSource` a cada conexão. Sem contexto → nenhuma linha (fail-closed). |

Papéis `ADMIN`/`SUPER_ADMIN` mantêm escopo global (flag `app.is_admin`), replicando a
semântica que já existia em `MarketAccessService`.

### Roles de banco

| Role | BYPASSRLS? | Usada por |
|---|---|---|
| `pdv2cloud` (dona do schema) | Sim (owner) | Flyway (migrations), `cron-jobs` (agregações cross-tenant), dev local |
| `pdv2cloud_app` | **Não** | API web/agente em produção (`DATABASE_USER`) |

A role de aplicação é criada por `scripts/db/setup-tenant-roles.sh`:
- **Provisionamento novo:** roda automaticamente via `docker-entrypoint-initdb.d`.
- **Banco existente:** execute manualmente dentro do container do Postgres:
  ```bash
  docker compose exec -e DATABASE_APP_PASSWORD='...' postgres \
    sh /docker-entrypoint-initdb.d/10-setup-tenant-roles.sh
  ```

### Verificação manual da RLS

```sql
-- Como pdv2cloud_app, sem contexto: deve retornar 0 linhas
SET app.current_market = ''; SELECT count(*) FROM invoices;

-- Com tenant errado: 0 linhas; com o tenant correto: apenas as linhas dele
SELECT set_config('app.current_market', '<uuid-do-mercado>', false);
SELECT count(*) FROM invoices;
```

---

## 3. Variáveis de ambiente

Ver `.env.example` na raiz. Resumo das novas/alteradas:

| Variável | Obrigatória | Uso |
|---|---|---|
| `JWT_SECRET` | ✅ (app não sobe sem) | Assinatura HS512 dos tokens |
| `DATABASE_ADMIN_PASSWORD` | ✅ (compose local) | Senha da role dona (`pdv2cloud`) |
| `DATABASE_APP_USER` / `DATABASE_APP_PASSWORD` | ✅ | Role de aplicação sujeita a RLS |
| `FLYWAY_USER` / `FLYWAY_PASSWORD` | Quando `DATABASE_USER` ≠ dona | Migrations com a role dona |
| `ADMIN_PASSWORD` / `SUPER_ADMIN_PASSWORD` | Opcional | Seed dos usuários administrativos (vazio = não cria) |

---

## 4. Critérios de aceite (rastreabilidade com o plano)

**Fase 0**
- [x] Todos os métodos de `SupplierOrderController` chamam `assertCanAccessMarket` (Z-1).
- [x] Nenhum segredo/credencial no working tree (`git grep` limpo); histórico → seção 1.3.
- [x] App falha rápido sem `JWT_SECRET`; seeders sem defaults de senha (A-1/A-2).
- [x] Teste automatizado de acesso cross-tenant em supplier-orders (`SupplierOrderControllerTenantIsolationTest`).

**Fase 1**
- [x] Validação automática de `{marketId}` para todos os endpoints (`TenantAccessFilter` + `TenantAccessFilterTest`).
- [x] `TenantContext` populado por request; `app.current_market` setado por conexão (`TenantAwareDataSource`).
- [x] RLS nas tabelas transacionais, incluindo filhas via join (migration `V29`).
- [x] `market_id NOT NULL` em `sales_analytics`, `alerts`, `campaigns`, `pdvs` (migration `V28`, aborta se houver órfãos).
- [ ] Pendente (manual): criar a role `pdv2cloud_app` no banco de produção e apontar `DATABASE_USER` para ela.
- [ ] Pendente (manual): reconciliação de dados de `supplier_orders` (auditar se houve escrita cross-tenant antes da correção):
  ```sql
  SELECT o.id FROM supplier_orders o
  JOIN suppliers s ON s.id = o.supplier_id
  WHERE s.market_id <> o.market_id;
  ```
