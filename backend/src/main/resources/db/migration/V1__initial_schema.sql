create table if not exists markets (
    id uuid primary key,
    name text not null,
    cnpj text unique,
    address text,
    city text,
    state text,
    region text,
    owner_id uuid,
    plan_type text,
    is_active boolean,
    created_at timestamp
);

create table if not exists users (
    id uuid primary key,
    email text not null unique,
    password text not null,
    name text not null,
    role text,
    market_id uuid,
    industry_id uuid,
    is_active boolean,
    created_at timestamp,
    updated_at timestamp,
    foreign key (market_id) references markets(id)
);

create table if not exists pdvs (
    id uuid primary key,
    name text not null,
    serial_number text,
    market_id uuid,
    created_at timestamp,
    foreign key (market_id) references markets(id)
);

create table if not exists products (
    id uuid primary key,
    ean text unique,
    name text,
    category text,
    brand text,
    unit text,
    created_at timestamp
);

create table if not exists invoices (
    id uuid primary key,
    chave_nfe text not null unique,
    market_id uuid not null,
    pdv_id uuid,
    serie text,
    numero text,
    data_emissao timestamp,
    cnpj_emitente text,
    cpf_cnpj_destinatario text,
    valor_total numeric,
    raw_xml_hash text,
    processed_at timestamp,
    foreign key (market_id) references markets(id),
    foreign key (pdv_id) references pdvs(id)
);

create table if not exists invoice_items (
    id uuid primary key,
    invoice_id uuid not null,
    product_id uuid,
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
    id uuid primary key,
    market_id uuid,
    product_id uuid,
    date date,
    quantity_sold numeric,
    revenue numeric,
    average_price numeric,
    transaction_count integer,
    foreign key (market_id) references markets(id),
    foreign key (product_id) references products(id)
);

create table if not exists alerts (
    id uuid primary key,
    market_id uuid,
    type text,
    title text,
    message text,
    product_id uuid,
    priority text,
    is_read boolean,
    created_at timestamp,
    foreign key (market_id) references markets(id),
    foreign key (product_id) references products(id)
);

create table if not exists campaigns (
    id uuid primary key,
    name text,
    description text,
    market_id uuid,
    start_date timestamp,
    end_date timestamp,
    created_at timestamp,
    foreign key (market_id) references markets(id)
);

create index if not exists idx_chave_nfe on invoices(chave_nfe);
create index if not exists idx_market_date on invoices(market_id, data_emissao);
create index if not exists idx_market_product_date on sales_analytics(market_id, product_id, date);
