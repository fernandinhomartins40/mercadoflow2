-- Provedores fora do catálogo do lojista (dono, 22/10/2026): Cerebras, Groq,
-- NVIDIA NIM e Gemini têm camada gratuita, em que podem usar os dados para
-- treinar a IA, e a API não diz se a chave do cliente é de conta paga.
-- Só desliga (sem apagar): o lojista vê o motivo e cadastra outro provedor.
UPDATE ai_provider_credentials
   SET enabled = FALSE, last_check_ok = FALSE, updated_at = NOW(),
       last_check_error = 'Este provedor saiu da lista: ele tem plano gratuito, em que pode usar seus dados para treinar a IA. Use OpenRouter, OpenAI, DeepSeek ou um endpoint próprio.'
 WHERE enabled AND provider IN ('CEREBRAS', 'GROQ', 'NVIDIA_NIM', 'GEMINI');
