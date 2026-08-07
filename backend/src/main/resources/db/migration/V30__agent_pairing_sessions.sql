-- Pareamento automatizado do Agente Mercado Flow (device pairing / QR Code).
--
-- Fluxo:
--   1. O agente instalado chama POST /api/v1/agent-pairing/start (rota publica, sem
--      credencial alguma) e recebe um par de codigos:
--        * user_code  - curto, legivel, exibido no QR e no link para o usuario;
--        * agent_secret_hash - o agente guarda o segredo em memoria e o apresenta
--          ao consultar o status; impede que terceiros que enxerguem o user_code
--          resgatem a API key no lugar do agente.
--   2. O usuario abre o link no celular, autentica na web e nomeia o PDV.
--   3. Ao confirmar, o backend cria o PDV, emite a API key e marca a sessao como
--      APPROVED. A chave e entregue UMA unica vez, apenas ao agente que provou
--      posse do agent_secret, e depois a linha e marcada como CONSUMED.
--
-- A API key em texto puro nunca e persistida: fica somente em issued_api_key ate
-- o resgate e e apagada em seguida (ver AgentPairingService.claim).
--
-- Fora da RLS por design: a sessao nasce sem tenant (ninguem esta autenticado no
-- passo 1) e e consultada pelo agente antes de existir contexto de tenant, mesma
-- razao pela qual agent_api_keys ficou de fora em V29.

create table agent_pairing_sessions (
    id                  uuid primary key default gen_random_uuid(),
    user_code           varchar(16)  not null,
    agent_secret_hash   varchar(64)  not null,
    status              varchar(16)  not null default 'PENDING',
    market_id           uuid         references markets (id) on delete cascade,
    pdv_id              uuid         references pdvs (id) on delete set null,
    agent_api_key_id    uuid         references agent_api_keys (id) on delete set null,
    issued_api_key      varchar(128),
    pdv_name            varchar(255),
    hostname            varchar(255),
    approved_by_user_id uuid         references users (id) on delete set null,
    created_at          timestamp    not null default now(),
    approved_at         timestamp,
    consumed_at         timestamp,
    expires_at          timestamp    not null
);

create unique index idx_agent_pairing_user_code on agent_pairing_sessions (user_code);
create index idx_agent_pairing_status on agent_pairing_sessions (status, expires_at);
create index idx_agent_pairing_market on agent_pairing_sessions (market_id);

-- Vincula a chave do agente ao PDV nomeado durante o pareamento. Nullable: as
-- chaves ja emitidas continuam validas e ligadas apenas ao mercado.
alter table agent_api_keys add column pdv_id uuid references pdvs (id) on delete set null;
create index idx_agent_api_key_pdv on agent_api_keys (pdv_id);
