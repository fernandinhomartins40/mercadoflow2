create table if not exists markets (
    id text primary key,
    name text not null,
    cnpj text unique,
    address text,
    city text,
    state text,
    region text,
    owner_id text,
    plan_type text,
    is_active boolean,
    created_at text
);

create table if not exists users (
    id text primary key,
    email text not null unique,
    password text not null,
    name text not null,
    role text,
    market_id text,
    industry_id text,
    is_active boolean,
    created_at text,
    updated_at text,
    foreign key (market_id) references markets(id)
);

create table if not exists pdvs (
    id text primary key,
    name text not null,
    serial_number text,
    market_id text,
    created_at text,
    foreign key (market_id) references markets(id)
);

create table if not exists products (
    id text primary key,
    ean text unique,
    name text,
    category text,
    brand text,
    unit text,
    created_at text
);

create table if not exists invoices (
    id text primary key,
    chave_nfe text not null unique,
    market_id text not null,
    pdv_id text,
    serie text,
    numero text,
    data_emissao text,
    cnpj_emitente text,
    cpf_cnpj_destinatario text,
    valor_total numeric,
    raw_xml_hash text,
    processed_at text,
    foreign key (market_id) references markets(id),
    foreign key (pdv_id) references pdvs(id)
);

create table if not exists invoice_items (
    id text primary key,
    invoice_id text not null,
    product_id text,
    codigo_ean text,
    codigo_interno text,
    descricao text,
    ncm text,
    cfop text,
    quantidade numeric,
    valor_unitario numeric,
    valor_total numeric,
    icms numeric,
    pis numeric,
    cofins numeric,
    foreign key (invoice_id) references invoices(id),
    foreign key (product_id) references products(id)
);

create table if not exists sales_analytics (
    id text primary key,
    market_id text,
    product_id text,
    date text,
    quantity_sold numeric,
    revenue numeric,
    average_price numeric,
    transaction_count integer,
    foreign key (market_id) references markets(id),
    foreign key (product_id) references products(id)
);

create table if not exists alerts (
    id text primary key,
    market_id text,
    type text,
    title text,
    message text,
    product_id text,
    priority text,
    is_read boolean,
    created_at text,
    foreign key (market_id) references markets(id),
    foreign key (product_id) references products(id)
);

create table if not exists campaigns (
    id text primary key,
    name text,
    description text,
    market_id text,
    start_date text,
    end_date text,
    created_at text,
    foreign key (market_id) references markets(id)
);

create index if not exists idx_chave_nfe on invoices(chave_nfe);
create index if not exists idx_market_date on invoices(market_id, data_emissao);
create index if not exists idx_market_product_date on sales_analytics(market_id, product_id, date);
