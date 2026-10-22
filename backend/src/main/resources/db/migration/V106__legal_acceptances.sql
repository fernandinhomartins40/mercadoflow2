-- S1 (parecer LGPD): aceite registrado dos Termos de uso, da Política de
-- privacidade e do Contrato de tratamento de dados (DPA, operador).
--
-- Uma linha por documento e versão aceita, só inserção (o código nunca altera
-- nem apaga). O DPA só é aceito pelo dono da loja (MARKET_OWNER), que
-- representa o mercado controlador. A versão vigente fica em
-- LegalAcceptanceService.VERSION, igual à LEGAL_VERSION do frontend.
create table if not exists legal_acceptances (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references users (id) on delete cascade,
    market_id   uuid references markets (id) on delete set null,
    document    varchar(10) not null,
    version     varchar(20) not null,
    accepted_at timestamp   not null default now(),
    ip          varchar(64),
    user_agent  varchar(500),
    constraint ck_legal_acceptance_document check (document in ('TERMS', 'PRIVACY', 'DPA'))
);

-- Um aceite por pessoa, documento e versão.
create unique index if not exists uq_legal_acceptance
    on legal_acceptances (user_id, document, version);
create index if not exists idx_legal_acceptance_market
    on legal_acceptances (market_id);

-- RLS como na V99/V103 (market_id anulável): o cadastro e o POST de aceite
-- rodam em runAsSystem; o /auth/me lê na sessão da própria loja.
alter table legal_acceptances enable row level security;
drop policy if exists tenant_isolation on legal_acceptances;
create policy tenant_isolation on legal_acceptances for all
    using (current_setting('app.is_admin', true) = 'true'
        or market_id is null
        or market_id = nullif(current_setting('app.current_market', true), '')::uuid)
    with check (current_setting('app.is_admin', true) = 'true'
        or market_id is null
        or market_id = nullif(current_setting('app.current_market', true), '')::uuid);

-- Registro de prova: a aplicação só lê e insere.
do $$
begin
    if exists (select 1 from pg_roles where rolname = 'mercadoflow_app') then
        grant select, insert on legal_acceptances to mercadoflow_app;
    end if;
end $$;
