-- Bipae nativo (docs/INTEGRACAO-BIPAE.md): catálogo para todo cliente Bipae,
-- conta MercadoFlow criada pelo Bipae, desconto no plano para cliente Bipae
-- ativo e o Confere dentro do Bipae.

-- ── 1. Busca do catálogo por nome ───────────────────────────────────────────
-- Nome e marca sem acento e em minúsculas, com índice de trigramas: "acucar
-- uniao" acha "Açúcar Refinado União 1kg" sem varrer a tabela.
create extension if not exists pg_trgm;

alter table products add column if not exists search_text text generated always as (
    translate(lower(coalesce(name, '') || ' ' || coalesce(brand, '')),
              'áàâãäåéèêëíìîïóòôõöúùûüçñý', 'aaaaaaeeeeiiiiooooouuuucny')
) stored;
create index if not exists idx_products_search_trgm on products using gin (search_text gin_trgm_ops);

-- NCM de cada produto, pelas notas: sem este índice a consulta varre os itens.
create index if not exists idx_invoice_items_product on invoice_items (product_id);

-- ── 2. O que as lojas do Bipae cadastram volta para o catálogo ──────────────
-- Uma linha por produto e loja (a loja só como hash): o NCM e o CEST que mais
-- lojas usam viram a sugestão fiscal; produto que o catálogo não conhecia
-- passa a existir.
create table if not exists catalog_contributions (
    partner_id           uuid not null references integration_partners(id) on delete cascade,
    gtin                 varchar(14) not null,
    store_ref            varchar(64) not null,
    description          varchar(300),
    brand                varchar(120),
    department           varchar(200),
    unit                 varchar(10),
    package_description  varchar(120),
    ncm                  varchar(8),
    cest                 varchar(7),
    updated_at           timestamp not null default now(),
    primary key (partner_id, gtin, store_ref)
);
create index if not exists idx_catalog_contributions_gtin on catalog_contributions (gtin);

-- ── 3. Desconto no plano para cliente do parceiro da casa ───────────────────
alter table integration_partners
    add column if not exists plan_discount_percent integer not null default 0
        check (plan_discount_percent between 0 and 100);

-- O parceiro diz se a loja é cliente ativo dele; o desconto só vale enquanto for.
alter table partner_market_links
    add column if not exists customer_active boolean not null default false,
    add column if not exists customer_status_at timestamp;

-- ── 4. Conta criada pelo parceiro ───────────────────────────────────────────
alter table markets
    add column if not exists created_by_partner_id uuid references integration_partners(id) on delete set null;
