CREATE TABLE suppliers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_id     UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    cnpj          VARCHAR(14) NOT NULL,
    razao_social  VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    email         VARCHAR(255),
    telefone      VARCHAR(30),
    logradouro    VARCHAR(255),
    municipio     VARCHAR(100),
    uf            VARCHAR(2),
    cep           VARCHAR(10),
    situacao_cadastral VARCHAR(50),
    cnae_principal     VARCHAR(10),
    descricao_cnae     VARCHAR(255),
    porte              VARCHAR(50),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP,
    CONSTRAINT uq_supplier_market_cnpj UNIQUE (market_id, cnpj)
);

CREATE INDEX idx_suppliers_market_id ON suppliers(market_id);
CREATE INDEX idx_suppliers_cnpj      ON suppliers(cnpj);
