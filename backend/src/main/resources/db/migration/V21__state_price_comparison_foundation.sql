create table if not exists state_price_sources (
    id uuid primary key,
    provider text not null unique,
    name text not null,
    state_code text,
    service_name text,
    service_url text,
    coverage_states text,
    notes text,
    active boolean not null default true,
    created_at timestamp not null default now(),
    updated_at timestamp not null default now()
);

create table if not exists state_price_observations (
    id uuid primary key,
    source_id uuid not null references state_price_sources(id),
    product_id uuid not null references products(id),
    provider_product_id text not null,
    observed_gtin text,
    product_name text not null,
    normalized_name text not null,
    brand text,
    category text,
    package_description text,
    unit text,
    observed_state text not null,
    observed_city text,
    observed_store text,
    observed_store_id text,
    source_url text,
    price numeric(10,2) not null,
    currency text not null default 'BRL',
    observed_at timestamp not null,
    raw_payload text,
    created_at timestamp not null default now()
);

create unique index if not exists uq_state_price_observation_source_store_product_time
    on state_price_observations(source_id, provider_product_id, coalesce(observed_store_id, ''), observed_at);

create index if not exists idx_state_price_observations_product_observed_at
    on state_price_observations(product_id, observed_at desc);

create index if not exists idx_state_price_observations_state_observed_at
    on state_price_observations(observed_state, observed_at desc);

create index if not exists idx_state_price_observations_source_observed_at
    on state_price_observations(source_id, observed_at desc);

create index if not exists idx_state_price_observations_price
    on state_price_observations(price asc);

create index if not exists idx_state_price_observations_normalized_name
    on state_price_observations(normalized_name);

insert into state_price_sources (
    id,
    provider,
    name,
    state_code,
    service_name,
    service_url,
    coverage_states,
    notes,
    active,
    created_at,
    updated_at
) values
    (
        gen_random_uuid(),
        'MENOR_PRECO_PR',
        'Menor Preco Paraná',
        'PR',
        'Menor Preço / Nota Paraná',
        'https://menorpreco.notaparana.pr.gov.br/',
        'PR',
        'Portal oficial do Estado do Paraná para consulta de menor preço.',
        true,
        now(),
        now()
    ),
    (
        gen_random_uuid(),
        'PRECO_DA_HORA_BA',
        'Preço da Hora Bahia',
        'BA',
        'Preço da Hora Bahia',
        'https://precodahora.ba.gov.br/',
        'BA',
        'Portal oficial da SEFAZ Bahia para consulta pública de preços.',
        true,
        now(),
        now()
    ),
    (
        gen_random_uuid(),
        'PRECO_DA_HORA_PB',
        'Preço da Hora Paraíba',
        'PB',
        'Preço da Hora Paraíba',
        'https://precodahora.pb.gov.br/',
        'PB',
        'Portal oficial da Paraíba para consulta pública de preços.',
        true,
        now(),
        now()
    ),
    (
        gen_random_uuid(),
        'BUSCA_PRECO_AM',
        'Busca Preço Amazonas',
        'AM',
        'Busca Preço Amazonas',
        'https://buscapreco.sefaz.am.gov.br/',
        'AM',
        'Portal oficial da SEFAZ Amazonas para consulta pública de preços.',
        true,
        now(),
        now()
    ),
    (
        gen_random_uuid(),
        'MENOR_PRECO_BRASIL',
        'Menor Preço Brasil',
        null,
        'Menor Preço Brasil',
        'https://nfg.sefaz.rs.gov.br/site/MenorPreco.aspx',
        'AC,AL,DF,ES,PA,PE,PI,RJ,RN,RO,RR,RS,SE,TO',
        'Portal nacional desenvolvido no Rio Grande do Sul e adotado por múltiplas UFs.',
        true,
        now(),
        now()
    )
on conflict (provider) do update set
    name = excluded.name,
    state_code = excluded.state_code,
    service_name = excluded.service_name,
    service_url = excluded.service_url,
    coverage_states = excluded.coverage_states,
    notes = excluded.notes,
    active = excluded.active,
    updated_at = now();
