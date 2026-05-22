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

    # Arquivo incompleto (ainda sendo gravado pelo PDV)
    "xml_incomplete": {
        "title": "Arquivo incompleto",
        "message": "O arquivo de nota foi detectado antes de ser totalmente gravado. O sistema aguardará e tentará novamente.",
        "technical": "XML file incomplete or truncated",
    },

    # Encoding / caracteres inválidos
    "xml_encoding_error": {
        "title": "Arquivo com codificação inválida",
        "message": "O arquivo XML possui caracteres inválidos. Verifique a configuração de exportação do seu sistema.",
        "technical": "XML encoding error",
    },

    # Disco cheio ou inacessível
    "disk_full": {
        "title": "Espaço em disco insuficiente",
        "message": "O disco está cheio. Libere espaço para que o sistema possa continuar operando.",
        "technical": "No space left on device",
    },
    "disk_io_error": {
        "title": "Erro de leitura no disco",
        "message": "O sistema não conseguiu ler o arquivo. Pode ser um problema no armazenamento ou na pasta monitorada.",
        "technical": "Disk I/O error",
    },

    # BD local corrompido (já tratado pelo QueueManager, mas registramos aqui)
    "db_corrupted": {
        "title": "Banco de dados local corrompido",
        "message": "O banco de dados interno foi corrompido e foi recriado automaticamente. Nenhuma nota foi perdida.",
        "technical": "SQLite database corrupted — recreated",
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
    "updating": "Atualizando o agente — aguarde...",
}

UPDATE_PHASE_LABELS: dict[str, str] = {
    "verificando":       "Verificando atualizações...",
    "nova_versão":       "Nova versão disponível",
    "baixando":          "Baixando atualização",
    "validando":         "Validando integridade do arquivo",
    "validado":          "Arquivo validado",
    "instalando":        "Instalando atualização",
    "instalado":         "Atualização concluída — reiniciando",
    "aguardando_janela": "Atualização baixada — instalação agendada para madrugada",
    "atualizado":        "Sistema atualizado",
    "erro_download":     "Falha no download da atualização",
    "erro_instalacao":   "Falha na instalação — versão anterior mantida",
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
    Classifica uma exceção em um tipo de erro amigável.

    Retorna uma chave de ERROR_MESSAGES.
    """
    import requests.exceptions as req_exc

    error_str = str(exception).lower()

    # ── Erros de rede ───────────────────────────────────────────────────────
    if isinstance(exception, req_exc.ConnectionError):
        if "connection refused" in error_str:
            return "connection_refused"
        if "dns" in error_str or "name resolution" in error_str or "nodename" in error_str:
            return "dns_failed"
        return "connection_refused"

    if isinstance(exception, req_exc.Timeout):
        return "timeout"

    # ── Erros HTTP ──────────────────────────────────────────────────────────
    if isinstance(exception, req_exc.HTTPError):
        response = getattr(exception, "response", None)
        if response is not None:
            status = response.status_code
            if status in (401, 403):
                return "invalid_api_key"
            if status == 429:
                return "rate_limit"
            if status == 503:
                return "service_unavailable"
            if status >= 500:
                return "server_error"

    # ── Erros de arquivo ────────────────────────────────────────────────────
    if isinstance(exception, FileNotFoundError):
        return "file_not_found"

    if isinstance(exception, PermissionError):
        return "permission_denied"

    if isinstance(exception, OSError):
        # errno 28 = ENOSPC (no space left on device) — Windows e Linux
        import errno as errno_mod
        eno = getattr(exception, "errno", None)
        if eno == errno_mod.ENOSPC or "no space left" in error_str:
            return "disk_full"
        if eno in (errno_mod.EIO, errno_mod.ENXIO) or "i/o error" in error_str:
            return "disk_io_error"
        return "disk_io_error"

    # ── Erros de XML ────────────────────────────────────────────────────────
    if "xml" in error_str or "parse" in error_str or "lxml" in type(exception).__module__:
        # XML truncado/incompleto: lxml lança XMLSyntaxError com "premature end" ou
        # "document is empty" quando o arquivo ainda está sendo gravado
        if any(kw in error_str for kw in (
            "premature end", "document is empty", "no element found",
            "unexpected end", "end of file",
        )):
            return "xml_incomplete"
        # Problemas de encoding/caracteres inválidos
        if any(kw in error_str for kw in (
            "encoding", "codec", "unicode", "invalid byte",
            "invalid character", "character reference",
        )):
            return "xml_encoding_error"
        return "xml_parse_error"

    # Encoding genérico fora do parsing XML
    if isinstance(exception, (UnicodeDecodeError, UnicodeEncodeError)):
        return "xml_encoding_error"

    return "unknown_error"


def is_transient_error(error_type: str) -> bool:
    """
    Retorna True para erros que valem ser retentados automaticamente
    (problemas temporários de rede, servidor sobrecarregado, arquivo incompleto).
    Retorna False para erros permanentes que exigem ação humana.
    """
    TRANSIENT = {
        "connection_refused", "timeout", "dns_failed",
        "rate_limit", "server_error", "service_unavailable",
        "xml_incomplete", "disk_io_error",
    }
    return error_type in TRANSIENT
