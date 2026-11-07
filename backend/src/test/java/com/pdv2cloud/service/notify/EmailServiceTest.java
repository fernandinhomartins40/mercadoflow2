package com.pdv2cloud.service.notify;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/** E-mail montado sem abrir brecha: nome do lojista com HTML vira texto. */
class EmailServiceTest {

    @Test
    void htmlEscapaOConteudo() {
        String html = EmailService.html("Olá <b>", List.of("Mercado <script>alert(1)</script>"), "Abrir", "https://mercadoflow.com/x?a=1&b=2");
        assertFalse(html.contains("<script>"));
        assertTrue(html.contains("&lt;script&gt;"));
        assertTrue(html.contains("a=1&amp;b=2"));
    }

    @Test
    void layoutTemLogoEtiquetaEObservacao() {
        String html = EmailService.html("Título", List.of("Corpo"), "Abrir", "https://mercadoflow.com/x",
            new EmailService.Look("Segurança <da conta>", EmailService.Tone.SECURITY, "Nota & aviso"));
        assertTrue(html.contains("logomercadoflow-branco.png"));
        assertTrue(html.contains("#0F3A29"));
        assertTrue(html.contains("Segurança &lt;da conta&gt;"));
        assertTrue(html.contains("Nota &amp; aviso"));
        String text = EmailService.text("Título", List.of("Corpo"), null, null, new EmailService.Look(null, EmailService.Tone.NEUTRAL, "Nota"));
        assertTrue(text.endsWith("Nota\n\nMercadoFlow"));
    }

    @Test
    void textoTemOLinkCompleto() {
        String text = EmailService.text("Redefinir senha", List.of("Use o link."), "Criar nova senha", "https://mercadoflow.com/redefinir-senha?token=abc");
        assertTrue(text.contains("Criar nova senha: https://mercadoflow.com/redefinir-senha?token=abc"));
    }
}
