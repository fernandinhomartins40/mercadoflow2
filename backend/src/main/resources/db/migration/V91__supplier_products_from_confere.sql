-- Fornecedor cadastrado sozinho pela nota lida no Confere, e o vínculo produto × fornecedor.
-- Um produto pode ter vários fornecedores; cada vínculo guarda o código do produto
-- no fornecedor, a embalagem de compra e o último custo, para montar pedido sem digitar.

-- De onde veio o cadastro: MANUAL (digitado/CNPJ) ou CONFERE (nota de entrada).
alter table suppliers add column if not exists source varchar(12) not null default 'MANUAL';

create table if not exists supplier_products (
    id               uuid primary key default gen_random_uuid(),
    market_id        uuid not null references markets (id) on delete cascade,
    supplier_id      uuid not null references suppliers (id) on delete cascade,
    product_id       uuid not null references products (id) on delete cascade,
    -- Código do produto no cadastro do fornecedor (cProd da nota).
    supplier_code    varchar(60),
    -- Unidade comercial da nota (CX, FD, UN...) e quantas unidades de venda vêm nela.
    purchase_unit    varchar(6),
    units_per_pack   numeric(10,3),
    -- Custo de uma unidade de venda na última nota (vProd ÷ qTrib).
    last_unit_cost   numeric(15,6),
    last_purchase_at timestamp,
    -- Quantas notas trouxeram este produto deste fornecedor.
    purchases        int not null default 0,
    last_document_id uuid references nfe_documents (id) on delete set null,
    created_at       timestamp not null default now(),
    updated_at       timestamp not null default now(),
    constraint uq_supplier_products unique (supplier_id, product_id)
);
create index if not exists idx_supplier_products_product on supplier_products (market_id, product_id, last_purchase_at desc);
create index if not exists idx_supplier_products_supplier on supplier_products (market_id, supplier_id, last_purchase_at desc);

alter table supplier_products enable row level security;
drop policy if exists tenant_isolation on supplier_products;
create policy tenant_isolation on supplier_products for all using (
    current_setting('app.is_admin', true) = 'true'
    or market_id = nullif(current_setting('app.current_market', true), '')::uuid);

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'mercadoflow_app') then
        execute 'grant select, insert, update, delete on supplier_products to mercadoflow_app';
    end if;
end $$;

-- ── Notas que já estão no Confere ─────────────────────────────────────────

-- 1. Fornecedor de cada nota completa, no cadastro do mercado (sem mexer no que já existe).
--    Nota emitida pelo próprio CNPJ do mercado (transferência) não vira fornecedor.
insert into suppliers (market_id, cnpj, razao_social, nome_fantasia, municipio, uf, source)
select distinct on (d.market_id, d.emitter_cnpj)
       d.market_id, d.emitter_cnpj,
       left(coalesce(nullif(s.name, ''), nullif(d.emitter_name, ''), d.emitter_cnpj), 255),
       left(nullif(s.trade_name, ''), 255),
       left(coalesce(s.city, d.supplier_city), 100), coalesce(s.uf, d.supplier_uf), 'CONFERE'
from nfe_documents d
join markets m on m.id = d.market_id
left join nfe_suppliers s on s.cnpj = d.emitter_cnpj
where d.completeness = 'FULL'
  and length(d.emitter_cnpj) = 14
  and d.emitter_cnpj <> coalesce(regexp_replace(m.cnpj, '\D', '', 'g'), '')
order by d.market_id, d.emitter_cnpj, d.issued_at desc nulls last
on conflict (market_id, cnpj) do nothing;

-- 2. Produto × fornecedor a partir dos itens das notas (só itens ligados a um produto).
insert into supplier_products (market_id, supplier_id, product_id, supplier_code, purchase_unit, units_per_pack,
                               last_unit_cost, last_purchase_at, purchases, last_document_id)
select i.market_id, sup.id, i.product_id,
       (array_agg(i.supplier_code order by i.issued_at desc nulls last))[1],
       (array_agg(i.unit order by i.issued_at desc nulls last))[1],
       (array_agg(case when i.quantity > 0 and i.tax_quantity > i.quantity
                       then round(i.tax_quantity / i.quantity, 3) end order by i.issued_at desc nulls last))[1],
       (array_agg(i.unit_cost order by i.issued_at desc nulls last))[1],
       max(i.issued_at),
       count(distinct i.document_id),
       (array_agg(i.document_id order by i.issued_at desc nulls last))[1]
from nfe_document_items i
join suppliers sup on sup.market_id = i.market_id and sup.cnpj = i.supplier_cnpj
where i.product_id is not null
group by i.market_id, sup.id, i.product_id
on conflict (supplier_id, product_id) do nothing;
