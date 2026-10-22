-- SEG-05: revogação de JWT. Tokens emitidos antes deste instante deixam de valer
-- (reset de senha, troca de papel, desativação, transferência de titularidade).
-- Sem default retroativo: nulo = nenhum token é derrubado.
alter table users add column if not exists credentials_changed_at timestamp;
