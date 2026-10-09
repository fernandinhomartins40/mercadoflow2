-- Busca de foto sob demanda: produto que entrou por um mercado (Confere ou PDV) e
-- ainda não tem imagem no catálogo é procurado por código de barras nas lojas
-- coletadas. Esta tabela guarda só as tentativas sem resultado, para não repetir a
-- mesma busca a cada ciclo; quem ganha foto sai da fila sozinho.
create table if not exists product_image_lookups (
    product_id      uuid primary key references products (id) on delete cascade,
    attempts        int not null default 0,
    last_attempt_at timestamp not null default now(),
    next_attempt_at timestamp not null default now()
);
create index if not exists idx_product_image_lookups_next on product_image_lookups (next_attempt_at);
