package com.pdv2cloud.service.ai.chat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Texto pronto do Copiloto: o período sai da pergunta por código e o texto não inventa número. */
class DirectAnswersTest {

    private final DirectAnswers direct = new DirectAnswers();

    @Test
    void periodoSaiDaPergunta() {
        assertEquals(7, direct.argsFrom("resumo_de_vendas", "quanto vendi na semana?").get("dias"));
        assertEquals(15, direct.argsFrom("resumo_de_vendas", "faturamento dos últimos 15 dias").get("dias"));
        assertEquals(30, direct.argsFrom("resumo_de_vendas", "quanto faturei no mês?").get("dias"));
        assertEquals(1, direct.argsFrom("resumo_de_vendas", "vendi quanto hoje").get("dias"));
        assertFalse(direct.argsFrom("resumo_de_vendas", "qual meu faturamento?").containsKey("dias"));
    }

    @Test
    void periodoSoVaiParaConsultasQueAceitam() {
        assertFalse(direct.argsFrom("listar_capital_parado", "o que está parado há 30 dias?").containsKey("dias"));
    }

    @Test
    void quantidadeEOrdemDosProdutos() {
        Map<String, Object> args = direct.argsFrom("produtos_mais_vendidos", "quais os 5 produtos que menos venderam?");
        assertEquals(5, args.get("limite"));
        assertEquals("menores", args.get("ordem"));
        assertFalse(direct.argsFrom("produtos_mais_vendidos", "top 10 mais vendidos").containsKey("ordem"));
    }

    @Test
    void resumoDeVendasEmPortugues() {
        String text = direct.render("resumo_de_vendas", Map.of(
            "periodoDias", 7, "faturamento", 12345.6, "cupons", 830, "ticketMedio", 14.87,
            "variacaoPercent", -3.2, "faturamentoPeriodoAnterior", 12753.0)).orElseThrow();
        assertTrue(text.startsWith("Nos últimos 7 dias você faturou R$ 12.345,60 em 830 cupons"), text);
        assertTrue(text.contains("3,2% abaixo do período anterior"), text);
    }

    @Test
    void listaDeProdutosNumerada() {
        String text = direct.render("produtos_mais_vendidos", Map.of("periodoDias", 30, "produtos", List.of(
            Map.of("produto", "Arroz 5kg", "receita", 900, "quantidade", 30),
            Map.of("produto", "Feijão 1kg", "receita", 400, "quantidade", 50)))).orElseThrow();
        assertTrue(text.contains("1. Arroz 5kg: R$ 900,00 (30 un.)"), text);
        assertTrue(text.contains("2. Feijão 1kg"), text);
    }

    @Test
    void mensagemDaConsultaPassaDireto() {
        assertEquals("Ainda não há vendas.", direct.render("resumo_de_vendas", Map.of("resultado", "Ainda não há vendas.")).orElseThrow());
    }

    @Test
    void erroOuConsultaSemModeloVoltaVazio() {
        assertTrue(direct.render("resumo_de_vendas", Map.of("erro", "falhou")).isEmpty());
        assertTrue(direct.render("consultar_produto", Map.of("produto", "x")).isEmpty());
        assertTrue(direct.render("vendas_por_dia_da_semana", Map.of("porDiaDaSemana", List.of())).isEmpty());
    }
}
