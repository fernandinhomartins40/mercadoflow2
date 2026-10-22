-- LGPD-01: o PersonalDataRetentionJob mascara toda noite o CPF/CNPJ do
-- destinatário das notas com mais de 5 anos. Depois de mascarada, a nota
-- continua com data antiga, então um índice só por data_emissao faria cada lote
-- reler as notas já mascaradas. O índice parcial guarda só as que ainda têm o
-- documento em claro e encolhe à medida que o job avança.
--
-- Sem CONCURRENTLY, como em V39 e V97: o Flyway roda na transação; só as
-- gravações de nota esperam enquanto o índice é montado no deploy.
create index if not exists idx_invoices_destinatario_em_claro
    on invoices (data_emissao)
    where cpf_cnpj_destinatario is not null and cpf_cnpj_destinatario not like '*%';
