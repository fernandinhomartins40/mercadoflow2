-- Loja desativada à mão pelo superadmin (D-04, docs/pie/lotes/receita.md).
--
-- A troca de estado da assinatura (pagamento confirmado, atraso, retomada)
-- grava is_active = true em toda a rede. Com esta marca, um pagamento reativa a
-- assinatura, mas não religa a loja que o superadmin desligou: a marca é gravada
-- quando ele desativa a loja e apagada quando ele reativa.
ALTER TABLE markets ADD COLUMN IF NOT EXISTS disabled_by_admin_at TIMESTAMP;

-- Lojas que já estão desligadas com a conta em dia só podem ter sido desligadas
-- à mão (a troca de estado no superadmin só desliga em atraso, suspensão ou cancelamento).
UPDATE markets SET disabled_by_admin_at = NOW()
 WHERE is_active = FALSE AND billing_status IN ('ACTIVE', 'TRIAL') AND disabled_by_admin_at IS NULL;
