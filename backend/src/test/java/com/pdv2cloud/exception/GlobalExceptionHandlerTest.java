package com.pdv2cloud.exception;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.util.NoSuchElementException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.web.servlet.resource.NoResourceFoundException;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    @DisplayName("'não encontrado' dos serviços vira 404 com a mensagem do domínio")
    void noSuchElementIs404() {
        var response = handler.handleNoSuchElement(new NoSuchElementException("Pedido não encontrado"));
        assertEquals(404, response.getStatusCode().value());
        assertEquals("Pedido não encontrado", response.getBody().get("message"));
    }

    @Test
    @DisplayName("rota inexistente vira 404 sem ecoar o caminho pedido")
    void unknownRouteIs404() {
        var response = handler.handleNoResource(new NoResourceFoundException(HttpMethod.GET, "/v3/api-docs", "v3/api-docs"));
        assertEquals(404, response.getStatusCode().value());
        assertFalse(String.valueOf(response.getBody()).contains("api-docs"));
    }

    @Test
    @DisplayName("JSON malformado e cabeçalho ausente viram 400, não 500 (SEC-08)")
    void malformedRequestIs400() {
        var notReadable = new org.springframework.http.converter.HttpMessageNotReadableException(
            "JSON parse error", new org.springframework.mock.http.MockHttpInputMessage(new byte[0]));
        var response = handler.handleBadRequest(notReadable);
        assertEquals(400, response.getStatusCode().value());
        assertFalse(String.valueOf(response.getBody()).contains("JSON parse"));
    }
}
