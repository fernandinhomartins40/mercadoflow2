package com.pdv2cloud.service.ai.agents;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

/** Canal WhatsApp: formato aceito pela Meta e webhook só com assinatura válida. */
class WhatsAppChannelTest {

    private final WhatsAppConfigService config = mock(WhatsAppConfigService.class);
    private final WhatsAppChannel channel = new WhatsAppChannel(null, null, null, config, null, null, null, null);

    private static String sign(String secret, byte[] body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return "sha256=" + HexFormat.of().formatHex(mac.doFinal(body));
    }

    @Test
    void parametroDoModeloSemQuebraDeLinhaETamanhoMaximo() {
        String t = WhatsAppChannel.templateParam("Compras: Pedido.\n• Leite: comprar 12 un.\n\n\tArroz     5kg");
        assertFalse(t.contains("\n") || t.contains("\t") || t.contains("     "));
        assertEquals("Compras: Pedido. - Leite: comprar 12 un. Arroz 5kg", t);
        assertEquals(1024, WhatsAppChannel.templateParam("x".repeat(3000)).length());
    }

    @Test
    void primeirasLinhasDoAviso() {
        assertEquals("A entrega veio com 2 diferenças. Fornecedor faltou em 2 de 3.",
            WhatsAppChannel.firstLines("A entrega veio com 2 diferenças.\n\nFornecedor faltou em 2 de 3.\nMensagem pronta", 2));
    }

    @Test
    void assinaturaValidaSoComOSegredoCerto() throws Exception {
        when(config.appSecret()).thenReturn("segredo-do-app");
        byte[] body = "{\"entry\":[{\"changes\":[]}],\"acentuação\":\"ç\"}".getBytes(StandardCharsets.UTF_8);
        assertTrue(channel.validSignature(body, sign("segredo-do-app", body)));
        assertFalse(channel.validSignature(body, sign("outro-segredo", body)));
        assertFalse(channel.validSignature(body, null));
        assertFalse(channel.validSignature(body, "sha256=zz"));
        when(config.appSecret()).thenReturn(null);
        assertFalse(channel.validSignature(body, sign("segredo-do-app", body)), "sem segredo cadastrado, nada é aceito");
    }

    @Test
    void tokenDeVerificacao() {
        when(config.verifyToken()).thenReturn("token-de-verificacao-123");
        assertTrue(channel.verifyToken("token-de-verificacao-123"));
        assertFalse(channel.verifyToken("token-errado"));
        assertFalse(channel.verifyToken(null));
    }

    @Test
    void confirmacaoDoPedidoEDaMensagem() {
        DecisionService.Decision pedido = new DecisionService.Decision(UUID.randomUUID(), "COMPRAS", "PEDIDO", "compras",
            "Pedido sugerido: 2 produtos para repor", "", Map.of(), Map.of(), null, 2, false, "APROVADA", Map.of(), null,
            null, null, null, null, Map.of("executado", true, "noPedido", 2), false, null);
        assertEquals("Aprovado: Pedido sugerido: 2 produtos para repor. 2 itens foram para o rascunho de pedido. "
            + "Revise no MercadoFlow antes de enviar ao fornecedor.", WhatsAppChannel.confirmation(pedido));
        DecisionService.Decision msg = new DecisionService.Decision(UUID.randomUUID(), "RECEBIMENTO", "MENSAGEM_FORNECEDOR", "1",
            "Avisar Atacado", "", Map.of(), Map.of(), null, 2, true, "APROVADA", Map.of(), null, null, null, null, null,
            Map.of("executado", true, "mensagem", "Olá, Atacado."), false, null);
        assertTrue(WhatsAppChannel.confirmation(msg).endsWith("Mensagem para encaminhar ao fornecedor:\n\nOlá, Atacado."));
        DecisionService.Decision nivel1 = new DecisionService.Decision(UUID.randomUUID(), "COMPRAS", "PEDIDO", "compras", "Pedido",
            "", Map.of(), Map.of(), null, 1, false, "APROVADA", Map.of(), null, null, null, null, null, Map.of("executado", false), false, null);
        assertTrue(WhatsAppChannel.confirmation(nivel1).endsWith("Anotado na caixa do Copiloto."));
    }
}
