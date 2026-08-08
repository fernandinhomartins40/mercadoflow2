-- Redes de lojas (matriz + filiais), precos dos planos e limites por filial.
--
-- Problema que esta migracao fecha: nao existia hierarquia entre mercados. Cada
-- loja era um Market independente, entao uma rede com 8 supermercados
-- simplesmente criava 8 contas gratuitas ou 8 planos baratos e nunca sentia
-- limite algum. Os limites de V33 eram por conta, jamais por empresa.
--
-- Duas defesas complementares:
--   1. ESTRUTURAL — filiais penduradas numa matriz, com os limites do plano
--      apurados sobre a rede inteira e nao sobre cada loja isolada.
--   2. DETECCAO — o CNPJ raiz (8 primeiros digitos) e identico entre filiais da
--      mesma empresa. Guardado em coluna propria e indexado, permite recusar o
--      cadastro de uma segunda conta da mesma empresa e listar no painel as
--      redes que ja entraram fatiadas antes desta regra existir.

-- ── 1. Renomeacao dos planos pagos ─────────────────────────────────────────
-- PRO vira ESSENCIAL (R$ 197). O nome antigo some do catalogo, entao a
-- conversao precisa acontecer antes de qualquer leitura da aplicacao.
update markets set plan_type = 'ESSENCIAL' where plan_type = 'PRO';
-- ENTERPRISE vira REDE: mesmo papel (sob medida), nome alinhado ao publico.
update markets set plan_type = 'REDE' where plan_type = 'ENTERPRISE';

-- ── 2. Hierarquia de rede ──────────────────────────────────────────────────
alter table markets
    -- Nulo = a propria loja e matriz (ou loja unica). Preenchido = filial.
    add column if not exists parent_market_id uuid references markets (id) on delete set null,
    -- 8 primeiros digitos do CNPJ: identico entre filiais da mesma empresa.
    add column if not exists cnpj_root varchar(8),
    -- Rotulo curto da unidade ("Centro", "Filial 2"), exibido nas telas.
    add column if not exists branch_label varchar(120);

-- Backfill do CNPJ raiz a partir do que ja existe, ignorando mascara.
update markets
set cnpj_root = substring(regexp_replace(cnpj, '[^0-9]', '', 'g') from 1 for 8)
where cnpj is not null
  and length(regexp_replace(cnpj, '[^0-9]', '', 'g')) >= 8
  and cnpj_root is null;

create index if not exists idx_markets_parent on markets (parent_market_id);
create index if not exists idx_markets_cnpj_root on markets (cnpj_root);

-- Uma filial nao pode ser matriz de outra: a hierarquia tem exatamente dois
-- niveis. Sem isso, uma rede poderia encadear filiais indefinidamente e
-- escapar da contagem agregada.
create or replace function assert_single_level_network()
returns trigger as $$
begin
    if new.parent_market_id is not null then
        if new.parent_market_id = new.id then
            raise exception 'Um mercado nao pode ser filial de si mesmo';
        end if;
        if exists (
            select 1 from markets m
            where m.id = new.parent_market_id and m.parent_market_id is not null
        ) then
            raise exception 'Uma filial nao pode ter filiais: vincule a matriz da rede';
        end if;
    end if;
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_single_level_network on markets;
create trigger trg_single_level_network
    before insert or update of parent_market_id on markets
    for each row execute function assert_single_level_network();

-- ── 3. Limites por filial ──────────────────────────────────────────────────
-- V33 ja trouxe pdv_limit_override (teto TOTAL da conta). Aqui entra o teto
-- POR filial: sem ele, uma rede caberia no plano distribuindo poucos PDVs em
-- muitas lojas, ou concentrando dezenas de caixas numa loja so.
alter table markets
    add column if not exists branch_limit_override      integer,
    add column if not exists pdv_per_branch_override    integer,
    -- Preco negociado no plano REDE, em centavos (evita erro de arredondamento).
    add column if not exists custom_price_cents         integer;

-- ── 4. Redes ja fatiadas ───────────────────────────────────────────────────
-- Visao das empresas que criaram mais de uma conta com o mesmo CNPJ raiz sem
-- vinculo de rede. E a lista de abordagem comercial do super admin.
create or replace view v_suspected_networks as
select
    cnpj_root,
    count(*)                                   as account_count,
    sum(case when parent_market_id is null then 1 else 0 end) as unlinked_count,
    min(created_at)                            as first_signup_at,
    max(created_at)                            as last_signup_at,
    array_agg(id order by created_at)          as market_ids,
    array_agg(name order by created_at)        as market_names
from markets
where cnpj_root is not null
group by cnpj_root
having count(*) > 1;
