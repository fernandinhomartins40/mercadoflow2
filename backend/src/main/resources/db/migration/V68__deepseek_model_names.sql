-- Nome oficial do modelo Pro do DeepSeek é deepseek-v4-pro (deepseek-pro não existe na API).
UPDATE ai_task_routes SET model = 'deepseek-v4-pro' WHERE model = 'deepseek-pro';
UPDATE ai_route_fallbacks SET model = 'deepseek-v4-pro' WHERE model = 'deepseek-pro';
UPDATE ai_platform_providers SET default_model = 'deepseek-v4-pro' WHERE default_model = 'deepseek-pro';
