-- O id qwen/qwen3.5-flash não existe no OpenRouter. Reserva passa a ser o
-- qwen/qwen3.7-flash (mais novo e mais barato: US$ 0,03 / 0,13 por milhão).
UPDATE ai_route_fallbacks SET model = 'qwen/qwen3.7-flash', input_price_usd_m = 0.03, output_price_usd_m = 0.13
 WHERE provider = 'OPENROUTER' AND model = 'qwen/qwen3.5-flash';
UPDATE ai_platform_providers SET default_model = 'qwen/qwen3.7-flash'
 WHERE provider = 'OPENROUTER' AND default_model = 'qwen/qwen3.5-flash';
