"""
Friendly user messages for the PDV2Cloud agent.
Translates technical errors into user-friendly language.
"""

ERROR_MESSAGES = {
    # Connection errors
    "connection_refused": {
        "title": "Não foi possível conectar ao servidor",
        "message": "Verifique sua conexão com a internet e tente novamente.",
        "technical": "Connection refused",
    },
    "timeout": {
        "title": "Servidor demorou para responder",
        "message": "A conexão está lenta. Aguarde alguns minutos e o sistema tentará novamente automaticamente.",
        "technical": "Request timeout",
    },
    "dns_failed": {
        "title": "Erro ao encontrar o servidor",
        "message": "Verifique sua conexão com a internet. Se o problema persistir, entre em contato com o suporte.",
        "technical": "DNS resolution failed",
    },

    # Authentication errors
    "invalid_api_key": {
        "title": "Chave de acesso inválida",
        "message": "A chave de acesso configurada não é válida. Acesse o painel web e gere uma nova chave.",
        "technical": "Invalid API key",
    },
    "api_key_expired": {
        "title": "Chave de acesso expirada",
        "message": "Sua chave de acesso expirou. Acesse o painel web e gere uma nova chave.",
        "technical": "API key expired",
    },
    "rate_limit": {
        "title": "Muitas requisições",
        "message": "O sistema detectou um volume alto de dados. Aguarde alguns minutos e o envio será retomado automaticamente.",
        "technical": "Rate limit exceeded (429)",
    },

    # Configuration errors
    "missing_api_key": {
        "title": "Sistema não configurado",
        "message": "Configure a chave de acesso na interface de configuração antes de usar o sistema.",
        "technical": "API key not configured",
    },
    "missing_watch_paths": {
        "title": "Nenhuma pasta configurada",
        "message": "Adicione pelo menos uma pasta para monitoramento na interface de configuração.",
        "technical": "No watch paths configured",
    },

    # File errors
    "xml_parse_error": {
        "title": "Arquivo inválido",
        "message": "O arquivo XML está corrompido ou em formato incorreto. Verifique o arquivo gerado pelo seu sistema.",
        "technical": "XML parse error",
    },
    "file_not_found": {
        "title": "Arquivo não encontrado",
        "message": "O arquivo foi movido ou removido antes de ser processado.",
        "technical": "File not found",
    },
    "permission_denied": {
        "title": "Sem permissão para acessar o arquivo",
        "message": "O sistema não tem permissão para ler os arquivos. Execute como Administrador ou ajuste as permissões da pasta.",
        "technical": "Permission denied",
    },

    # Server errors
    "server_error": {
        "title": "Erro no servidor",
        "message": "O servidor encontrou um problema. O sistema tentará novamente automaticamente. Se persistir, contacte o suporte.",
        "technical": "Internal server error (500)",
    },
    "service_unavailable": {
        "title": "Servidor temporariamente indisponível",
        "message": "O servidor está em manutenção. O sistema tentará novamente automaticamente em alguns minutos.",
        "technical": "Service unavailable (503)",
    },

    # Generic fallback
    "unknown_error": {
        "title": "Erro desconhecido",
        "message": "Ocorreu um erro inesperado. O sistema tentará novamente automaticamente.",
        "technical": "Unknown error",
    },
}

STATUS_MESSAGES = {
    "online": "Sistema funcionando normalmente ✓",
    "offline": "Sem conexão com o servidor - Tentando reconectar...",
    "processing": "Processando arquivos...",
    "idle": "Aguardando novos arquivos...",
    "error": "Atenção: alguns arquivos falharam - Verifique os detalhes",
}


def get_friendly_error(error_type: str, technical_detail: str = "") -> dict:
    """
    Returns a user-friendly error message.

    Args:
        error_type: Key from ERROR_MESSAGES
        technical_detail: Optional technical detail to append

    Returns:
        Dict with 'title', 'message', and 'technical' keys
    """
    error = ERROR_MESSAGES.get(error_type, ERROR_MESSAGES["unknown_error"])
    result = error.copy()
    if technical_detail:
        result["technical"] = f"{result['technical']}: {technical_detail}"
    return result


def classify_error(exception: Exception) -> str:
    """
    Classifies an exception into a friendly error type.

    Args:
        exception: The exception object

    Returns:
        Error type key for ERROR_MESSAGES
    """
    import requests.exceptions as req_exc

    error_str = str(exception).lower()

    # Network errors
    if isinstance(exception, req_exc.ConnectionError):
        if "connection refused" in error_str:
            return "connection_refused"
        elif "dns" in error_str or "name resolution" in error_str:
            return "dns_failed"
        return "connection_refused"

    if isinstance(exception, req_exc.Timeout):
        return "timeout"

    # HTTP errors
    if isinstance(exception, req_exc.HTTPError):
        if hasattr(exception, 'response'):
            status = exception.response.status_code
            if status == 401 or status == 403:
                return "invalid_api_key"
            elif status == 429:
                return "rate_limit"
            elif status >= 500:
                return "server_error"

    # File errors
    if isinstance(exception, FileNotFoundError):
        return "file_not_found"

    if isinstance(exception, PermissionError):
        return "permission_denied"

    # XML parsing errors
    if "xml" in error_str or "parse" in error_str:
        return "xml_parse_error"

    return "unknown_error"
