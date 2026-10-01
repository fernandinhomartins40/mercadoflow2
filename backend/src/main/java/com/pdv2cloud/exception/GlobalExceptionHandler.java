package com.pdv2cloud.exception;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(CustomExceptions.InvalidSignature.class)
    public ResponseEntity<Map<String, Object>> handleInvalidSignature(CustomExceptions.InvalidSignature ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(errorBody(
            "invalid_signature",
            ex.getMessage(),
            "A assinatura da requisicao e invalida. Verifique se a versao do agente esta atualizada."
        ));
    }

    @ExceptionHandler(CustomExceptions.NotFound.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(CustomExceptions.NotFound ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorBody(
            "not_found",
            ex.getMessage(),
            "O recurso solicitado nao foi encontrado."
        ));
    }

    /**
     * Os serviços sinalizam "não existe neste mercado" com NoSuchElementException
     * ("Pedido não encontrado", "Item não encontrado"). Sem este mapeamento a
     * resposta caía no 500 genérico e a tela dizia que o servidor falhou.
     */
    @ExceptionHandler(java.util.NoSuchElementException.class)
    public ResponseEntity<Map<String, Object>> handleNoSuchElement(java.util.NoSuchElementException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorBody(
            "not_found",
            ex.getMessage(),
            "O recurso solicitado nao foi encontrado."
        ));
    }

    /** Rota inexistente (inclui /v3/api-docs com o Swagger desligado em produção): 404, não 500. */
    @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNoResource(
        org.springframework.web.servlet.resource.NoResourceFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(errorBody(
            "not_found",
            "Recurso inexistente",
            "O recurso solicitado nao foi encontrado."
        ));
    }

    /**
     * Requisição malformada é erro de quem chamou, não do servidor (SEC-08):
     * corpo que não é JSON válido, cabeçalho obrigatório ausente (ex.: ingest
     * sem assinatura), parâmetro com tipo errado. Antes caíam no 500 genérico,
     * que dispara alerta e esconde as falhas reais. O detalhe técnico fica no
     * log; a resposta não ecoa o conteúdo recebido.
     */
    @ExceptionHandler({
        org.springframework.http.converter.HttpMessageNotReadableException.class,
        org.springframework.web.bind.MissingRequestHeaderException.class,
        org.springframework.web.bind.MissingServletRequestParameterException.class,
        org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
        org.springframework.web.HttpMediaTypeNotSupportedException.class
    })
    public ResponseEntity<Map<String, Object>> handleBadRequest(Exception ex) {
        log.debug("Requisicao invalida: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(errorBody(
            "bad_request",
            "Requisicao invalida",
            "Os dados enviados estao incompletos ou em formato invalido."
        ));
    }

    @ExceptionHandler(AccountAccessException.class)
    public ResponseEntity<Map<String, Object>> handleAccountAccess(AccountAccessException ex) {
        Map<String, Object> body = errorBody("account_blocked", ex.getMessage(), ex.getMessage());
        body.put("state", ex.getState());
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<Map<String, Object>> handleBadCredentials(BadCredentialsException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(errorBody(
            "invalid_credentials",
            ex.getMessage(),
            "E-mail ou senha incorretos."
        ));
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Map<String, Object>> handleAuthentication(AuthenticationException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(errorBody(
            "unauthorized",
            ex.getMessage(),
            "Nao foi possivel autenticar. Verifique suas credenciais e tente novamente."
        ));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorBody(
            "forbidden",
            ex.getMessage(),
            "A chave de acesso nao tem permissao para esta operacao."
        ));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        // Devolve a mensagem do campo que falhou, em vez de um texto generico
        // sobre XML: esta excecao cobre qualquer formulario da aplicacao, e o
        // usuario de um cadastro precisa saber QUAL regra ele nao atendeu.
        String detail = ex.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getDefaultMessage() != null
                ? error.getDefaultMessage()
                : error.getField() + " inválido")
            .filter(message -> message != null && !message.isBlank())
            .distinct()
            .collect(java.util.stream.Collectors.joining(". "));

        return ResponseEntity.badRequest().body(errorBody(
            "validation_error",
            ex.getMessage(),
            detail.isBlank() ? "Os dados enviados estão incompletos ou inválidos." : detail
        ));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(errorBody(
            "bad_request",
            ex.getMessage(),
            "Houve um problema com os dados enviados. Entre em contato com o suporte se o problema persistir."
        ));
    }

    /**
     * Rede de segurança para o que não tem handler específico.
     *
     * O log com a exceção é o ponto principal: sem ele, todo erro interno vira
     * um JSON genérico e desaparece — um StackOverflowError na ingestão custou
     * horas de investigação porque nada do stack trace chegava ao log, e a
     * mensagem ao cliente ("contacte o suporte") não diz nada a quem precisa
     * corrigir.
     */
    @ExceptionHandler(Throwable.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Throwable ex) {
        log.error("Erro nao tratado: {}", ex.toString(), ex);
        // O detalhe fica so no log: ex.getMessage() de erro interno pode trazer
        // SQL, nomes de tabela e colunas, e ja vazou um UPDATE inteiro no login.
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorBody(
            "internal_error",
            "Ocorreu um erro no servidor.",
            "Ocorreu um erro no servidor. O sistema tentara novamente automaticamente. Se persistir, contacte o suporte."
        ));
    }

    private Map<String, Object> errorBody(String error, String message, String userMessage) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", LocalDateTime.now().toString());
        body.put("error", error);
        body.put("message", safeMessage(message));
        body.put("userMessage", userMessage);
        return body;
    }

    private String safeMessage(String message) {
        if (message == null || message.isBlank()) {
            return "Unexpected server error";
        }
        return message;
    }
}
