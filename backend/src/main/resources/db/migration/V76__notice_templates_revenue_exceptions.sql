-- Assinaturas S5: central de avisos com modelos editáveis, registro de
-- pagamentos (para o painel de receita) e fila de exceções.

-- Modelos dos avisos: texto com variáveis ({nome}, {plano}, {data}, {dias},
-- {valor}, {loja}) e por onde cada aviso sai. O padrão fica guardado para
-- "restaurar".
CREATE TABLE notification_templates (
    kind           VARCHAR(40) PRIMARY KEY,
    label          VARCHAR(120) NOT NULL,
    title          VARCHAR(160) NOT NULL,
    body           VARCHAR(600) NOT NULL,
    default_title  VARCHAR(160) NOT NULL,
    default_body   VARCHAR(600) NOT NULL,
    send_app       BOOLEAN NOT NULL DEFAULT TRUE,
    send_email     BOOLEAN NOT NULL DEFAULT TRUE,
    send_whatsapp  BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order     INT NOT NULL DEFAULT 0,
    updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by     VARCHAR(255)
);

INSERT INTO notification_templates (kind, label, title, body, default_title, default_body, send_app, send_email, send_whatsapp, sort_order)
SELECT k, l, t, b, t, b, a, e, w, o FROM (VALUES
  ('WELCOME', 'Cadastro: boas-vindas',
   'Bem-vindo ao MercadoFlow, {nome}',
   'Sua conta da {loja} está pronta, no plano Grátis, para sempre. Primeiro passo: instalar o agente no computador do caixa para lermos as vendas.',
   TRUE, TRUE, FALSE, 10),
  ('TRIAL_STARTED', 'Teste: começou',
   'Seu teste do plano {plano} começou',
   'Você tem {dias} dias com tudo do plano {plano}, sem cartão. Termina em {data}. Depois, se não assinar, a conta volta ao Grátis sem perder nada.',
   TRUE, TRUE, FALSE, 20),
  ('TRIAL_ENDING', 'Teste: faltam 3 dias e 1 dia',
   'Seu teste termina em {data}',
   'Faltam {dias} dia(s). Assine para continuar com tudo do plano {plano}. Se não assinar, a conta volta ao Grátis sem perder nada.',
   TRUE, TRUE, TRUE, 30),
  ('TRIAL_ENDED', 'Teste: terminou',
   'Seu teste terminou: a conta voltou ao Grátis',
   'Nada foi perdido. Para voltar a ter tudo do plano, é só assinar.',
   TRUE, TRUE, FALSE, 40),
  ('PAYMENT_CONFIRMED', 'Pagamento confirmado',
   'Pagamento confirmado: {valor}',
   'Recebemos o pagamento do plano {plano}. O plano vale até {data}. A nota fiscal fica em Minha assinatura.',
   FALSE, TRUE, FALSE, 50),
  ('PAYMENT_FAILED', 'Pagamento falhou',
   'Não conseguimos confirmar o pagamento da assinatura',
   'Tudo continua funcionando até {data}. Depois disso, a conta fica só para consulta até o pagamento ser feito.',
   TRUE, TRUE, TRUE, 60),
  ('PAST_DUE_REMINDER', 'Atraso: lembrete dos dias 1, 3, 5 e 7',
   'Pagamento em aberto há {dias} dia(s)',
   'A assinatura do plano {plano} está com pagamento em aberto. Tudo funciona até {data}; depois a conta fica só para consulta. Pague em Minha assinatura.',
   TRUE, TRUE, TRUE, 70),
  ('RESTRICTED', 'Conta só para consulta',
   'Conta só para consulta: pagamento em aberto',
   'Os seus dados continuam guardados. Assim que o pagamento for confirmado, tudo volta na hora. Se ficar {dias} dias assim, a conta volta ao plano Grátis.',
   TRUE, TRUE, TRUE, 80),
  ('BACK_TO_FREE', 'Voltou ao Grátis',
   'Sua conta voltou ao plano Grátis',
   'Os dados continuam aqui, nos limites do Grátis. Para voltar ao plano pago, é só assinar de novo.',
   TRUE, TRUE, FALSE, 90),
  ('PAYMENT_RECOVERED', 'Pagamento regularizado',
   'Pagamento confirmado',
   'Obrigado! A assinatura voltou ao normal e todos os recursos do plano estão liberados.',
   TRUE, TRUE, FALSE, 100),
  ('PAUSED', 'Assinatura pausada',
   'Assinatura pausada até {data}',
   'Os seus dados ficam guardados e a conta usa os limites do Grátis. A assinatura volta sozinha em {data}.',
   TRUE, TRUE, FALSE, 110),
  ('RESUMED', 'Pausa terminou',
   'Sua assinatura voltou',
   'Todos os recursos do plano estão liberados de novo.',
   TRUE, TRUE, FALSE, 120),
  ('LIMIT_NEAR', 'Limite: 80% da semana',
   'Você já usou {dias}% das notas desta semana',
   'O plano {plano} está perto do limite semanal de notas. Se a loja cresceu, veja o próximo plano.',
   TRUE, TRUE, FALSE, 130),
  ('LIMIT_REACHED', 'Limite: 100% da semana',
   'Limite semanal de notas atingido',
   'As notas que passarem do limite do plano {plano} entram na segunda-feira. Para não esperar, veja o próximo plano.',
   TRUE, TRUE, FALSE, 140),
  ('AI_CREDITS_LOW', 'Créditos de IA acabando (20%)',
   'Seus créditos de IA estão acabando',
   'Restam {valor} créditos. Sem créditos, o Copiloto continua com o texto do sistema; para mais respostas, compre um pacote em Conta.',
   TRUE, TRUE, FALSE, 150)
) AS v(k, l, t, b, a, e, w, o)
ON CONFLICT (kind) DO NOTHING;

-- Aviso que não aparece no app (só e-mail/WhatsApp) continua gravado para não repetir.
ALTER TABLE app_notifications ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_notifications ADD COLUMN IF NOT EXISTS whatsapp_at TIMESTAMP;

-- Pagamentos recebidos (assinatura e créditos), para a receita real do mês.
CREATE TABLE billing_payments (
    id           BIGSERIAL PRIMARY KEY,
    provider     VARCHAR(12) NOT NULL,
    payment_id   VARCHAR(80) NOT NULL,
    market_id    UUID REFERENCES markets (id) ON DELETE SET NULL,
    kind         VARCHAR(12) NOT NULL,   -- SUBSCRIPTION | AI | CONFERE
    value_cents  INT NOT NULL,
    method       VARCHAR(20),
    paid_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_billing_payment UNIQUE (provider, payment_id)
);
CREATE INDEX idx_billing_payments_paid ON billing_payments (paid_at);
CREATE INDEX idx_billing_payments_market ON billing_payments (market_id, paid_at DESC);

-- Fila de exceções: só o que o automático não resolveu.
CREATE TABLE billing_exceptions (
    id           BIGSERIAL PRIMARY KEY,
    kind         VARCHAR(40) NOT NULL,
    market_id    UUID REFERENCES markets (id) ON DELETE SET NULL,
    provider_ref VARCHAR(120),
    detail       VARCHAR(600) NOT NULL,
    status       VARCHAR(10) NOT NULL DEFAULT 'OPEN',  -- OPEN | RESOLVED
    resolution   VARCHAR(600),
    resolved_by  VARCHAR(255),
    resolved_at  TIMESTAMP,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_billing_exceptions_open ON billing_exceptions (status, created_at DESC);
CREATE UNIQUE INDEX uq_billing_exception_ref ON billing_exceptions (kind, provider_ref) WHERE provider_ref IS NOT NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        GRANT SELECT, INSERT, UPDATE ON notification_templates, billing_payments, billing_exceptions TO mercadoflow_app;
        GRANT USAGE ON SEQUENCE billing_payments_id_seq, billing_exceptions_id_seq TO mercadoflow_app;
    END IF;
END $$;
