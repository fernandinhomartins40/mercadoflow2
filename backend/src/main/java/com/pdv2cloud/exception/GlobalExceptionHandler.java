package com.pdv2cloud.exception;

import java.time.LocalDateTime;
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
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
            "timestamp", LocalDateTime.now().toString(),
            "error", "invalid_signature",
            "message", ex.getMessage(),
            "userMessage", "A assinatura da requisição é inválida. Verifique se a versão do agente está atualizada."
        ));
    }

    @ExceptionHandler(CustomExceptions.NotFound.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(CustomExceptions.NotFound ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
            "timestamp", LocalDateTime.now().toString(),
            "error", "not_found",
            "message", ex.getMessage(),
            "userMessage", "O recurso solicitado não foi encontrado."
        ));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of(
            "timestamp", LocalDateTime.now().toString(),
            "error", "forbidden",
            "message", ex.getMessage(),
            "userMessage", "A chave de acesso não tem permissão para esta operação."
        ));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        return ResponseEntity.badRequest().body(Map.of(
            "timestamp", LocalDateTime.now().toString(),
            "error", "validation_error",
            "message", ex.getMessage(),
            "userMessage", "Os dados enviados estão incompletos ou inválidos. Verifique os arquivos XML gerados pelo seu sistema."
        ));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of(
            "timestamp", LocalDateTime.now().toString(),
            "error", "bad_request",
            "message", ex.getMessage(),
            "userMessage", "Houve um problema com os dados enviados. Entre em contato com o suporte se o problema persistir."
        ));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneric(Exception ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
            "timestamp", LocalDateTime.now().toString(),
            "error", "internal_error",
            "message", ex.getMessage(),
            "userMessage", "Ocorreu um erro no servidor. O sistema tentará novamente automaticamente. Se persistir, contacte o suporte."
        ));
    }
}
