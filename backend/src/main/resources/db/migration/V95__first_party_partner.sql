-- Parceiro da casa (docs/INTEGRACAO-BIPAE.md): o PDV/ERP da mesma empresa
-- (Bipae) conversa com o MercadoFlow de forma nativa. Além da API aberta dos
-- ERPs, ele pode, com a autorização da loja:
--  - mandar as vendas do caixa direto (sem o agente lendo XML na pasta);
--  - consultar o catálogo por GTIN (cadastro na hora em que o produto é bipado);
--  - ler a fila de decisões do Tino, os preços da região e os encartes publicados.
-- Nenhum ERP de terceiros recebe esses escopos.

alter table integration_partners
    add column if not exists first_party boolean not null default false;

alter table partner_market_links
    add column if not exists last_sales_at timestamp,
    -- Identificador da loja no sistema do parceiro (ex.: id da loja no Bipae).
    add column if not exists external_store_id varchar(120);

-- "Conectar ao MercadoFlow" de dentro do sistema do parceiro: ele abre um
-- pedido de conexão, o dono aprova no painel e a loja fica vinculada.
-- O código só existe como hash; quem tem o link pode aprovar, mas só logado
-- como dono de uma loja.
create table if not exists partner_connect_requests (
    id                 uuid primary key default gen_random_uuid(),
    partner_id         uuid not null references integration_partners(id) on delete cascade,
    code_hash          varchar(64) not null unique,
    cnpj               varchar(14),
    store_name         varchar(200),
    owner_email        varchar(255),
    external_store_id  varchar(120),
    return_url         text,
    scopes             text[] not null,
    status             varchar(20) not null default 'PENDENTE',  -- PENDENTE | APROVADO | RECUSADO
    market_id          uuid references markets(id) on delete cascade,
    decided_by         varchar(200),
    decided_at         timestamp,
    created_at         timestamp not null default now(),
    expires_at         timestamp not null
);
create index if not exists idx_partner_connect_partner on partner_connect_requests (partner_id, created_at desc);
