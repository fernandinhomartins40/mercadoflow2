-- Fase 1 do plano multi-tenant (achado D-1 da auditoria):
-- Row-Level Security como defesa em profundidade no banco.
--
-- Como funciona:
--   * A role de APLICACAO (pdv2cloud_app, criada por scripts/db/setup-tenant-roles.sh,
--     sem BYPASSRLS e nao-dona das tabelas) so enxerga linhas cujo market_id seja igual
--     a variavel de sessao app.current_market, setada pelo TenantAwareDataSource a cada
--     checkout de conexao. Sem contexto, nenhuma linha e visivel (fail-closed).
--   * app.is_admin = 'true' e setado apenas para principais ADMIN/SUPER_ADMIN, cujo
--     escopo e global por design (mesma semantica de MarketAccessService).
--   * A role DONA do schema (pdv2cloud: Flyway, jobs, dev local) nao e afetada,
--     pois RLS sem FORCE nao se aplica ao owner.
--
-- Tabelas fora da RLS, deliberadamente:
--   * users, markets, agent_api_keys: consultadas durante a autenticacao, antes de
--     existir contexto de tenant.
--   * products, product_enrichments, catalog_crawler_*, state_price_*,
--     price_intelligence (fontes): catalogo/dados globais compartilhados por design.

do $$
declare
    tenant_table text;
    tenant_tables text[] := array[
        'pdvs',
        'invoices',
        'sales_analytics',
        'alerts',
        'campaigns',
        'demand_forecasts',
        'market_basket_rules',
        'audit_logs',
        'product_observations',
        'market_product_aliases',
        'product_price_daily_stats',
        'product_price_events',
        'product_promotion_windows',
        'price_intelligence_checkpoints',
        'shopping_list_items',
        'offer_templates',
        'offer_generation_jobs',
        'offer_brand_kits',
        'offer_campaign_kits',
        'offer_render_outputs',
        'offer_market_profiles',
        'purchase_price_history',
        'suppliers',
        'supplier_orders',
        'store_layouts'
    ];
begin
    foreach tenant_table in array tenant_tables loop
        execute format('alter table %I enable row level security', tenant_table);
        execute format(
            'create policy tenant_isolation on %I for all using ('
            || ' current_setting(''app.is_admin'', true) = ''true'''
            || ' or market_id = nullif(current_setting(''app.current_market'', true), '''')::uuid'
            || ')',
            tenant_table
        );
    end loop;
end $$;

-- Tabelas-filhas sem market_id direto: o tenant e derivado da tabela-pai via EXISTS.

alter table invoice_items enable row level security;
create policy tenant_isolation on invoice_items for all using (
    current_setting('app.is_admin', true) = 'true'
    or exists (
        select 1 from invoices parent
        where parent.id = invoice_items.invoice_id
          and parent.market_id = nullif(current_setting('app.current_market', true), '')::uuid
    )
);

alter table supplier_order_items enable row level security;
create policy tenant_isolation on supplier_order_items for all using (
    current_setting('app.is_admin', true) = 'true'
    or exists (
        select 1 from supplier_orders parent
        where parent.id = supplier_order_items.supplier_order_id
          and parent.market_id = nullif(current_setting('app.current_market', true), '')::uuid
    )
);

alter table offer_generation_job_items enable row level security;
create policy tenant_isolation on offer_generation_job_items for all using (
    current_setting('app.is_admin', true) = 'true'
    or exists (
        select 1 from offer_generation_jobs parent
        where parent.id = offer_generation_job_items.job_id
          and parent.market_id = nullif(current_setting('app.current_market', true), '')::uuid
    )
);

alter table offer_template_variants enable row level security;
create policy tenant_isolation on offer_template_variants for all using (
    current_setting('app.is_admin', true) = 'true'
    or exists (
        select 1 from offer_templates parent
        where parent.id = offer_template_variants.template_id
          and parent.market_id = nullif(current_setting('app.current_market', true), '')::uuid
    )
);
