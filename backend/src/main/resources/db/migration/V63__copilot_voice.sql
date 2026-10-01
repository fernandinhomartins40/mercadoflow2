-- Copiloto F2: voz. Transcrição paga (Deepgram) como reserva do reconhecimento
-- do navegador e Jev para comando de voz que o código não reconheceu.
-- Na camada VOZ, "tokens de entrada" são segundos de áudio: o preço de
-- entrada é US$ por 1 milhão de segundos (US$ 0,0043/min = 71,6667).
INSERT INTO ai_task_routes (task, label, layer, provider, model, max_context_tokens, max_output_tokens, temperature,
                            credits_per_use, input_price_usd_m, output_price_usd_m, shadow, notes) VALUES
 ('VOZ_TRANSCRICAO', 'Voz: transcrição paga (Deepgram)', 'VOZ', 'DEEPGRAM', 'nova-3', 60, 0, 0.00, 1, 71.6667, 0.00, FALSE,
  'Só quando o navegador não reconhece fala. Contexto máximo = segundos de áudio. Áudio não é guardado.'),
 ('JEV_COMANDO_VOZ', 'Jev: comando de voz não reconhecido', 'JEV', 'JEV', 'jev-latest', 500, 0, 0.00, 0, 0.042, 0.00, FALSE,
  'A lista fixa de comandos roda no celular; o Jev só escolhe a ação quando ela não reconhece.')
ON CONFLICT (task) DO NOTHING;
