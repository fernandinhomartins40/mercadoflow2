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
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(errorBody(
            "internal_error",
            ex.getMessage(),
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
