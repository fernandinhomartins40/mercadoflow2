# 10 — Plano de implementação: F1 "Ativação guiada + testes no CI"

Data: 2026-09-27 · Fase: Prompt 6 · Autorização: Gate 4 (D-034) · Requisitos: R-03, R-05 (só eventos de ativação),
R-02 (só a etapa de teste no CI), R-09 (só na tela nova) · Nada implementado ainda.

## 1. Antes × depois

| Situação | Hoje | Depois da F1 |
|---|---|---|
| Loja recém-cadastrada abre o Painel | 4 cartões "R$ 0,00 / 0", aba Alertas e "Todos os produtos em dia!" (UX-C04) | checklist de 3 passos com o próximo passo destacado e o botão da ação; sem KPIs, sem aba Alertas |
| Agente pareado, sem nota | igual ao acima | passo 1 concluído; passo 2 diz se o agente está on-line (último sinal) e o que verificar |
| Notas recusadas pela cota | nada no Painel | passo 2 mostra "N notas recusadas pela cota semanal" com link para Planos |
| Primeira nota recebida, antes da análise | igual ao acima | passo 2 concluído; passo 3 diz que a análise roda na madrugada (03:30) |
| Análise pronta, com menos de 7 dias de venda | Painel com números de poucos dias e "Todos os produtos em dia!" | Painel normal + faixa "Coletando vendas: X de 7 dias"; frases "Todos os produtos em dia" trocadas por "Ainda coletando vendas" enquanto X < 7 |
| Loja com 7+ dias de venda | Painel atual | **inalterado** |
| Deploy | build sem rodar teste (`-DskipTests`) | job `test-backend` roda `mvn test` antes do build; falha bloqueia o deploy |
| Medição | nenhuma | eventos de ativação gravados por mercado; funil consultável por SQL |

## 2. Contrato de API

`GET /api/v1/markets/{id}/activation` — MARKET_OWNER, MARKET_MANAGER, ADMIN, SUPER_ADMIN (regra já aplicada a
`/api/v1/markets/**`) + `assertCanAccessMarket` + RLS.

```json
{
  "complete": false,
  "steps": [
    { "key": "CONNECT_AGENT",   "done": true,  "doneAt": "2026-09-27T10:05:00" },
    { "key": "FIRST_INVOICE",   "done": false, "doneAt": null },
    { "key": "FIRST_ANALYSIS",  "done": false, "doneAt": null }
  ],
  "agent": { "pairedPdvs": 1, "lastHeartbeatAt": "2026-09-27T10:40:00", "online": true },
  "invoices": { "received": 0, "salesDays": 0, "targetDays": 7, "rejectedLast7Days": 0 },
  "nextAnalysisAt": "2026-09-28T03:30:00"
}
```

| Passo | Concluído quando | Fonte |
|---|---|---|
| CONNECT_AGENT ("Instale e conecte o agente") | existe chave de agente ativa; `doneAt` = criação da mais antiga | `AgentApiKeyRepository.findByMarketIdAndIsActiveTrue` |
| FIRST_INVOICE | `markets.first_ingest_at` preenchido | `Market.firstIngestAt` |
| FIRST_ANALYSIS | evento `activation.first_analysis` existe | `product_events` (gravado pelo job) |

`online` = último heartbeat há menos de 15 min. `complete` = 3 passos concluídos **e** `salesDays ≥ 7`.
`salesDays` = dias distintos com nota nos últimos 30 dias, contados com `LIMIT 8` (consulta curta mesmo em loja grande);
só é calculado depois do passo 2. "Instalar" e "parear" são um passo só: a sessão de pareamento só ganha `market_id`
na aprovação (`AgentPairingService.doStart` não conhece o mercado), então não há como saber que o agente foi instalado
antes de ser conectado. O download continua acessível pelo botão do passo 1.

Resposta em erro: 403 para mercado de outro tenant (padrão existente); 404 mercado inexistente.

## 3. Schema e migração

Nova `V54__product_events.sql` (aditiva; nenhuma migração existente é tocada):

```sql
CREATE TABLE product_events (
    id          BIGSERIAL PRIMARY KEY,
    market_id   UUID NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    type        VARCHAR(64) NOT NULL,
    occurred_at TIMESTAMP NOT NULL DEFAULT now(),
    props       JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_product_events_market_type ON product_events (market_id, type);
-- Marcos de ativação acontecem uma vez por mercado; o índice torna a gravação idempotente
-- (INSERT … ON CONFLICT DO NOTHING) sem consulta prévia.
CREATE UNIQUE INDEX uq_product_events_activation ON product_events (market_id, type)
    WHERE type LIKE 'activation.%';
-- RLS e GRANT no mesmo padrão de V51/V52 (policy tenant_isolation; GRANT à role de aplicação).
-- Retroativo: mercados que já têm oportunidade ganham o marco de análise com a data da primeira.
INSERT INTO product_events (market_id, type, occurred_at)
SELECT market_id, 'activation.first_analysis', min(created_at) FROM opportunities GROUP BY market_id
ON CONFLICT DO NOTHING;
```

Sem dado pessoal em `props` (sem e-mail, CPF, IP). Retenção: não implementada nesta fatia (proposta de 13 meses fica
para a fatia de telemetria completa).

## 4. Eventos gravados (somente ativação)

| Evento | Onde | Contexto de tenant |
|---|---|---|
| `activation.registered` | `AuthService.register`, após criar o mercado | já em `runAsSystem` |
| `activation.agent_paired` | `AgentPairingService.approve` | usuário do mercado |
| `activation.first_invoice` | `PlanService.markFirstIngest`, só quando `first_ingest_at` é preenchido agora | transação da nota (`REQUIRED`) |
| `activation.first_analysis` | `OpportunityDetectionJob`, após detectar para o mercado | cron (role dona) |

Gravação: novo `ProductEventService.record(marketId, type, props)` com `INSERT … ON CONFLICT DO NOTHING` via
`JdbcTemplate`, na transação corrente. Risco de abortar a transação da nota: só por erro de banco inesperado; o
conflito de unicidade não aborta. O teste da 1ª nota (§8) cobre o caminho.

## 5. Arquivos

| Ação | Arquivo | Conteúdo |
|---|---|---|
| criar | `backend/src/main/resources/db/migration/V54__product_events.sql` | §3 |
| criar | `backend/.../service/ProductEventService.java` | `record(...)`, `firstOccurrence(marketId, type)` |
| criar | `backend/.../service/ActivationService.java` | monta o estado do §2 |
| criar | `backend/.../model/dto/ActivationStatusDTO.java` | records do contrato |
| alterar | `backend/.../controller/MarketController.java` | `GET /{id}/activation` (≈10 linhas, padrão do `/dashboard`) |
| alterar | `backend/.../service/AuthService.java` | 1 chamada `record` |
| alterar | `backend/.../service/AgentPairingService.java` | 1 chamada `record` |
| alterar | `backend/.../service/PlanService.java` | 1 chamada `record` em `markFirstIngest` |
| alterar | `backend/.../job/OpportunityDetectionJob.java` | 1 chamada `record` por mercado com sucesso |
| criar | `backend/src/test/.../ActivationServiceTest.java`, `ProductEventServiceTest.java` | §8 |
| criar | `frontend/src/services/activation.service.ts` | chamada do endpoint |
| criar | `frontend/src/hooks/useActivation.ts` | estado + atualização a cada 30 s enquanto incompleto |
| criar | `frontend/src/components/activation/ActivationChecklist.tsx` | checklist |
| criar | `frontend/src/components/activation/CollectingBanner.tsx` | faixa "coletando" |
| alterar | `frontend/src/screens/Dashboard.tsx` | ramificação: checklist × painel; texto "em dia" condicionado |
| alterar | `frontend/src/config/features.ts` | `FEATURE_ACTIVATION_CHECKLIST_ENABLED = true` |
| criar | `frontend/src/types/activation.types.ts` | tipos |
| alterar | `.github/workflows/deploy-pdv2cloud-web.yml` | job `test-backend`; `build-backend` passa a depender dele |

**Não tocados** (trabalho local do owner, D-029): `tailwind.css`, `Button.tsx`, `Card.tsx`, `EmptyState.tsx`,
`PanelSection.tsx` e os demais 16 arquivos alterados localmente. Por isso o anel de foco e os tamanhos da F1 ficam
**no componente novo** (classes `focus-visible:` locais), não globais; o foco global (DS-04) espera o owner integrar
o trabalho dele.

## 6. Componentes reutilizados

`Layout`, `UsageBanner`, ícones `lucide-react` já importados, `useAuth`, `api.ts` (cliente com cookie),
tokens CSS existentes (`--text-primary`, `--surface-*`), `Link` do router para `/app/download-agente` e `/app/pdvs`.
Nenhuma dependência nova no frontend nem no backend.

## 7. Estados e acessibilidade da tela

| Estado | Conteúdo |
|---|---|
| Carregando | esqueleto do checklist (mesma altura: sem salto de layout) |
| Erro no endpoint | Painel atual como fallback (a F1 nunca deixa a loja sem tela) + aviso discreto |
| Passo atual | destacado, com texto do que fazer e um botão (≥ 44 px) |
| Agente offline | "Último sinal do agente: há 2 h. Confira se o computador do caixa está ligado." |
| Notas recusadas | "12 notas recusadas pela cota semanal" + link "Ver planos" |
| Aguardando análise | "Primeira análise: hoje às 03:30" (data de `nextAnalysisAt`) |
| Coletando | faixa "Coletando vendas: 3 de 7 dias" acima do Painel |

Acessibilidade: `<ol>` com cada passo em `<li>`; estado em texto ("concluído", "próximo passo", "pendente"), não só
ícone; `h1` da página mantido; `aria-live="polite"` só na linha de estado do passo atual (a atualização a cada 30 s
não repete a lista inteira); texto ≥ 14 px; contraste AA com os tokens existentes; foco visível com classe local.
Celular primeiro: coluna única a 360 px; a 1440 px, checklist à esquerda e ajuda à direita.

## 8. Testes (detalhe em `11-TEST-PLAN.md`)

Unitários do `ActivationService` (cada combinação de passos, `online`, `complete`, `nextAnalysisAt` antes/depois das
03:30), do `ProductEventService` (idempotência), da migração com a role de aplicação no PostgreSQL local descartável,
Playwright a 360 e 1440 px em 5 estados, axe na tela, e a suíte completa no CI novo.

## 9. Etapa de CI

```yaml
  test-backend:
    needs: validate-migrations
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '17', cache: maven }
      - name: Testes do backend
        working-directory: backend
        run: mvn -B -q test
```

`build-backend.needs: [validate-migrations, test-backend]`. Frontend e coletores continuam em paralelo; o deploy
já depende de `build-backend`. O PostgreSQL como serviço do Actions (decisão do Gate 4) entra na F2, quando houver teste
de integração; a F1 não precisa de banco no CI.

## 10. Flag e rollback

| Camada | Rollback |
|---|---|
| Tela | `FEATURE_ACTIVATION_CHECKLIST_ENABLED = false` → Painel atual, sem chamada ao endpoint |
| Endpoint e eventos | aditivos; revert do commit remove o código; a tabela fica (migração não se reverte, é inofensiva) |
| CI | revert da mudança no workflow |

## 11. Ordem de execução

1. Migração V54 + `ProductEventService` + testes → validar no PostgreSQL local com a role de aplicação.
2. `ActivationService` + DTO + endpoint + testes unitários.
3. Chamadas de evento nos 4 pontos + teste da 1ª nota com RLS (ingestão real local).
4. Frontend: tipos, serviço, hook, checklist, faixa, Dashboard, flag.
5. Playwright + axe nos 5 estados (ambiente local descartável recriado das imagens mantidas).
6. Workflow com `test-backend`.
7. Commit só dos arquivos da fatia → push → acompanhar o pipeline → conferir em produção com uma conta nova
   (cadastro → checklist no passo 1) → atualizar 08/09/PROJECT_STATE.

## 12. Riscos e bloqueios

| Risco | Mitigação |
|---|---|
| Evento na transação da nota aborta a ingestão | `ON CONFLICT DO NOTHING`; teste de ingestão da 1ª e 2ª nota com RLS antes do commit |
| Duração do pipeline | medir: suíte leva ≈1–2 min localmente com cache; meta ≤ +5 min |
| Conta de teste em produção para conferência | cria um terceiro mercado descartável (SEC-10 continua aguardando o owner) |
| Conflito com o trabalho local do owner | não tocar os 21 arquivos; commit por arquivo |

## 13. Estimativa de recursos

CPU/RAM: uma chamada leve por abertura do Painel (4 consultas indexadas por `market_id`, a de dias com `LIMIT 8`);
enquanto a ativação está incompleta e a tela aberta, repete a cada 30 s; depois de `complete`, não repete. Banco: 1 tabela com ~4 linhas
por mercado nesta fatia. Imagem: sem mudança. Actions: +1 job de ~2–4 min por push. Sem container novo.

## 14. Desvios encontrados na implementação (Prompt 7)

| Desvio | Motivo | Efeito |
|---|---|---|
| `marketRepository.flush()` antes do evento de cadastro | a auditoria local deu 500 no `/register`: o JPA só envia o INSERT do mercado no commit, e o evento (JDBC) violava a FK | cadastro 202 com o evento gravado; regra geral: escrita JDBC dentro de transação JPA precisa de flush do que ela referencia |
| Datas do contrato com fuso (`OffsetDateTime`) | o container roda em UTC sem `TZ`; `LocalDateTime` chegava ao navegador sem fuso e era lido como hora local ("último sinal há 0 min" com agente fora do ar há 2 h) | horários corretos no fuso do usuário; o job das 03:30 aparece como **00:30** em Brasília, que é o horário real |
| Fallback de erro sem aviso | um aviso "não foi possível verificar a ativação" não dá ação ao lojista | o Painel antigo aparece normalmente; o erro fica no log |
| SUPER_ADMIN não lê `/activation` | a classe `MarketController` aceita só MARKET_OWNER, MARKET_MANAGER e ADMIN; a F1 não muda a regra | T-72 ajustado |
| Texto da faixa "coletando" em `--text-primary` | `--text-muted` sobre `--surface-info` dá 4,37:1 (axe) | AA atendido |
