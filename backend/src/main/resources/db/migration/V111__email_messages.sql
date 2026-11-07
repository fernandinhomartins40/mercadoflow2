-- Histórico e fila dos e-mails da plataforma. O VeloMail limita o envio por
-- minuto e por hora: o que ele recusar por limite ou instabilidade fica aqui,
-- com o conteúdo cifrado (pode ter link com token), e sai numa nova tentativa.
-- O status acompanha os webhooks de entrega. Apagado em 90 dias (PersonalDataRetentionJob).
CREATE TABLE email_messages (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id       VARCHAR(120),
    recipient        VARCHAR(320) NOT NULL,
    subject          VARCHAR(300) NOT NULL,
    status           VARCHAR(12) NOT NULL,
    error            VARCHAR(500),
    payload          TEXT,
    attempts         INT NOT NULL DEFAULT 0,
    next_attempt_at  TIMESTAMP,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_email_messages_message ON email_messages (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX idx_email_messages_queue ON email_messages (next_attempt_at) WHERE status = 'queued';
CREATE INDEX idx_email_messages_created ON email_messages (created_at DESC);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercadoflow_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON email_messages TO mercadoflow_app;
    END IF;
END $$;
