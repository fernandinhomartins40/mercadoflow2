package com.pdv2cloud.exception;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
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
        return ResponseEntity.badRequest().body(errorBody(
            "validation_error",
            ex.getMessage(),
            "Os dados enviados estao incompletos ou invalidos. Verifique os arquivos XML gerados pelo seu sistema."
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

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
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
