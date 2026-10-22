-- S7 (parecer LGPD): prova do consentimento dos avisos por WhatsApp.
--
-- whatsapp_opt_in_at já existia (V64). Ao ligar, gravamos também o IP de quem
-- ligou, o número aceito e a versão do texto do aviso mostrado na tela. Ao
-- desligar (no painel ou respondendo PARAR), gravamos a data da revogação e
-- mantemos os dados do último aceite como prova. Cada mudança também vai para
-- a trilha de auditoria (audit_logs). Aditiva: só colunas novas e anuláveis.
alter table ai_copilot_prefs add column if not exists whatsapp_opt_in_ip varchar(45);
alter table ai_copilot_prefs add column if not exists whatsapp_opt_in_phone varchar(20);
alter table ai_copilot_prefs add column if not exists whatsapp_opt_in_text_version varchar(20);
alter table ai_copilot_prefs add column if not exists whatsapp_opt_out_at timestamp;

comment on column ai_copilot_prefs.whatsapp_opt_in_ip is 'IP de quem ligou os avisos (último aceite)';
comment on column ai_copilot_prefs.whatsapp_opt_in_phone is 'Número aceito no último aceite';
comment on column ai_copilot_prefs.whatsapp_opt_in_text_version is 'Versão do texto do aviso mostrado no aceite';
comment on column ai_copilot_prefs.whatsapp_opt_out_at is 'Quando os avisos foram desligados (painel ou PARAR)';

-- S4 (parecer LGPD): o PersonalDataRetentionJob apaga IP e user-agent da
-- auditoria após 12 meses. Índice parcial só com as linhas que ainda têm
-- esses dados, para o job não varrer os anos já limpos toda noite.
create index if not exists idx_audit_logs_network_pending
    on audit_logs (created_at) where ip_address is not null or user_agent is not null;
