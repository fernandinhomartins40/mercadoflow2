-- IA só com modelos pagos (dono, 22/10/2026, LGPD-07).
--
-- Nas camadas gratuitas o provedor pode usar perguntas e números do mercado
-- para treinar modelos. O código já recusa e pula modelos gratuitos
-- (AiProvider.isFreeModel: sufixo ":free" e o roteador "openrouter/free");
-- aqui os registros que já existem com esses modelos ficam desligados.
-- Nada é apagado: o superadmin ou o lojista religam escolhendo um modelo pago.

-- Plataforma: reservas e rotas com modelo gratuito.
UPDATE ai_route_fallbacks
   SET enabled = FALSE, updated_at = NOW(), updated_by = 'migracao-V104'
 WHERE enabled AND (lower(model) LIKE '%:free' OR lower(model) = 'openrouter/free');

UPDATE ai_task_routes
   SET enabled = FALSE, updated_at = NOW(), updated_by = 'migracao-V104',
       notes = left(coalesce(notes || ' ', '') || 'Desligada pela V104: modelo gratuito. Escolha um modelo pago.', 300)
 WHERE enabled AND (lower(model) LIKE '%:free' OR lower(model) = 'openrouter/free');

-- Modelo padrão do provedor da plataforma: o OpenRouter volta ao modelo pago
-- da reserva (V69); outro provedor com padrão gratuito fica desligado.
UPDATE ai_platform_providers
   SET default_model = 'qwen/qwen3.7-flash', updated_at = NOW(), updated_by = 'migracao-V104'
 WHERE provider = 'OPENROUTER' AND (lower(default_model) LIKE '%:free' OR lower(default_model) = 'openrouter/free');

UPDATE ai_platform_providers
   SET enabled = FALSE, updated_at = NOW(), updated_by = 'migracao-V104'
 WHERE enabled AND (lower(default_model) LIKE '%:free' OR lower(default_model) = 'openrouter/free');

-- Chave própria do mercado (BYOK). Também a do OpenRouter sem modelo escolhido:
-- ela usava o padrão antigo do catálogo (meta-llama/llama-3.3-70b-instruct:free),
-- e o padrão agora é pago. Desligar evita cobrança que o lojista não escolheu;
-- ao religar, ele passa a usar o modelo pago.
UPDATE ai_provider_credentials
   SET enabled = FALSE, last_check_ok = FALSE, updated_at = NOW(),
       last_check_error = 'Desligada: modelo gratuito pode usar seus dados para treinar a IA. Escolha um modelo pago e ligue de novo.'
 WHERE enabled
   AND (lower(model) LIKE '%:free' OR lower(model) = 'openrouter/free'
        OR (provider = 'OPENROUTER' AND (model IS NULL OR btrim(model) = '')));
