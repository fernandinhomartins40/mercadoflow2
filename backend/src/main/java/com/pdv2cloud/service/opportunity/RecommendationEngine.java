package com.pdv2cloud.service.opportunity;

import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.Recommendation;
import com.pdv2cloud.repository.OpportunityRepository;
import com.pdv2cloud.repository.RecommendationRepository;
import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Transforma oportunidade em ação concreta, com o cálculo exposto e a decisão
 * do usuário registrada.
 *
 * A estrutura segue o que o plano pede — RECOMENDAÇÃO → EVIDÊNCIAS → CÁLCULOS →
 * CONFIANÇA → IMPACTO → AÇÃO. O campo `calculationTrace` é o que diferencia uma
 * recomendação de um palpite: mostra COMO o número saiu, para o lojista poder
 * discordar com fundamento em vez de simplesmente não confiar.
 *
 * Nada é executado automaticamente. O sistema propõe; quem decide é o dono da
 * loja. Isso não é limitação técnica — é a única postura defensável para um
 * sistema que sugere gastar dinheiro com estoque teórico.
 */
@Service
@Slf4j
public class RecommendationEngine {

    private final OpportunityRepository opportunityRepository;
    private final RecommendationRepository recommendationRepository;
    private final OutcomeEvaluationService outcomeEvaluationService;

    public RecommendationEngine(
        OpportunityRepository opportunityRepository,
        RecommendationRepository recommendationRepository,
        OutcomeEvaluationService outcomeEvaluationService
    ) {
        this.opportunityRepository = opportunityRepository;
        this.recommendationRepository = recommendationRepository;
        this.outcomeEvaluationService = outcomeEvaluationService;
    }

    /**
     * Gera recomendações para as oportunidades abertas que ainda não têm uma.
     *
     * @return quantas foram criadas
     */
    @Transactional
    public int generateForMarket(UUID marketId) {
        List<Opportunity> open = opportunityRepository.findOpenByMarket(marketId);
        int created = 0;

        for (Opportunity o : open) {
            if (recommendationRepository.hasActiveForOpportunity(o.getId())) {
                continue;
            }
            Recommendation rec = build(o);
            if (rec != null) {
                recommendationRepository.save(rec);
                created++;
            }
        }
        return created;
    }

    /**
     * Constrói a recomendação a partir do tipo da oportunidade.
     *
     * @return {@code null} para tipos que não têm ação clara — melhor não
     *         recomendar do que recomendar genérico
     */
    private Recommendation build(Opportunity o) {
        return switch (o.getType()) {
            case "OPORTUNIDADE_DE_COMPRA" -> buyRecommendation(o);
            case "CAPITAL_PARADO" -> liquidateRecommendation(o);
            case "EXCESSO_DE_ESTOQUE" -> reduceRecommendation(o);
            case "PRODUTO_TRACIONADOR", "OPORTUNIDADE_DE_PROMOCAO" -> promoteRecommendation(o);
            case "PRECO_ACIMA_DO_MERCADO", "PRECO_ABAIXO_DA_VIZINHANCA" -> priceRecommendation(o);
            case "ANOMALIA_DE_VENDAS" -> investigateRecommendation(o);
            default -> null;
        };
    }

    private Recommendation buyRecommendation(Opportunity o) {
        Map<String, Object> ev = evidence(o);
        Object qty = ev.get("quantidadeSugerida");
        Object value = ev.get("valorSugerido");
        Object coverage = ev.get("coberturaDias");
        Object velocity = ev.get("giroDiario");

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("quantidade", qty);
        params.put("valorEstimado", value);
        params.put("produtoId", o.getProduct() != null ? o.getProduct().getId().toString() : null);

        String trace = String.format(
            "Giro medido: %s un./dia sobre a janela de 90 dias.%n"
                + "Cobertura atual do estoque estimado: %s dia(s).%n"
                + "Quantidade sugerida = alvo de cobertura + estoque de segurança − estoque atual "
                + "− pedidos já em trânsito.%n"
                + "Confiança do estoque estimado: %s (0 a 1). Quanto menor, mais o número depende "
                + "de compras que não foram registradas no sistema.",
            num(velocity), num(coverage), num(o.getConfidence()));

        return newRecommendation(o, Recommendation.ActionType.COMPRAR,
            "Comprar " + fmtQty(qty) + " un. de " + productName(o),
            o.getDescription(), params, trace, o.getExpectedImpactValue());
    }

    private Recommendation liquidateRecommendation(Opportunity o) {
        Map<String, Object> ev = evidence(o);

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("produtoId", o.getProduct() != null ? o.getProduct().getId().toString() : null);
        params.put("valorEstoque", ev.get("valorEstoque"));
        params.put("coberturaDias", ev.get("coberturaDias"));

        String trace = String.format(
            "Classe ABC %s / XYZ %s.%n"
                + "Cobertura de %s dia(s) com giro de %s un./dia — o estoque atual leva muito tempo "
                + "para escoar no ritmo de venda observado.%n"
                + "Risco de estagnação: %s (0 a 1).%n"
                + "GMROI: %s. Capital parado aqui é capital que não está girando em outro item.",
            ev.get("classeAbc"), ev.get("classeXyz"), num(ev.get("coberturaDias")),
            num(ev.get("giroDiario")), num(ev.get("riscoEstagnacao")), num(ev.get("gmroi")));

        return newRecommendation(o, Recommendation.ActionType.LIQUIDAR,
            "Liquidar estoque de " + productName(o),
            o.getDescription(), params, trace, o.getExpectedImpactValue());
    }

    private Recommendation reduceRecommendation(Opportunity o) {
        Map<String, Object> ev = evidence(o);

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("produtoId", o.getProduct() != null ? o.getProduct().getId().toString() : null);
        params.put("acao", "reduzir_proxima_compra");

        String trace = String.format(
            "Cobertura de %s dia(s) acima do necessário para o giro de %s un./dia.%n"
                + "Não é caso de liquidação: o produto vende, mas o volume comprado está à frente "
                + "da demanda. Reduzir o próximo pedido corrige sem sacrificar margem.",
            num(ev.get("coberturaDias")), num(ev.get("giroDiario")));

        return newRecommendation(o, Recommendation.ActionType.COMPRAR,
            "Reduzir próxima compra de " + productName(o),
            o.getDescription(), params, trace, o.getExpectedImpactValue());
    }

    private Recommendation promoteRecommendation(Opportunity o) {
        Map<String, Object> ev = evidence(o);
        Object desconto = ev.get("descontoSugerido");

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("produtoId", o.getProduct() != null ? o.getProduct().getId().toString() : null);
        params.put("descontoPercent", desconto);
        params.put("precoAtual", ev.get("precoAtual"));
        params.put("objetivo", ev.get("objetivo"));

        boolean tracionador = "PRODUTO_TRACIONADOR".equals(o.getType());
        // Sem custo real não há margem: o sistema não afirma teto seguro de desconto
        // e pede custo e preço da ação na hora de decidir.
        boolean costKnown = ev.get("margemPercent") != null;
        params.put("custoConhecido", costKnown);
        String marginLine = costKnown
            ? String.format("Desconto sugerido de %s%% respeita o teto de 70%% da margem atual (%s%%).", num(desconto), num(ev.get("margemPercent")))
            : String.format("Desconto de referência: %s%%. Sem custo registrado não há margem: informe o custo e o preço da ação para ver se compensa.", num(desconto));
        String trace = tracionador
            ? String.format(
                "Este produto puxa a venda de %s outro(s) item(ns) quando entra em promoção.%n"
                    + "Receita incremental estimada na cesta: %s.%n"
                    + "%s%n"
                    + "O ganho não está neste item — está na cesta que ele arrasta.",
                num(ev.get("produtosAfetados")), money(o.getExpectedImpactValue()), marginLine)
            : String.format(
                "Capital exposto: %s, com cobertura de %s dia(s) e giro de %s un./dia.%n"
                    + "Preço atual: %s. %s%n"
                    + "Aqui o desconto é o custo de recuperar dinheiro parado, não de ganhar cesta.",
                money(ev.get("capitalEmRisco")), num(ev.get("coberturaDias")), num(ev.get("giroDiario")),
                money(ev.get("precoAtual")), marginLine);

        return newRecommendation(o, Recommendation.ActionType.PROMOVER,
            "Promover " + productName(o) + (desconto != null ? " com " + num(desconto) + "% de desconto" : ""),
            o.getDescription(), params, trace, o.getExpectedImpactValue());
    }

    private Recommendation priceRecommendation(Opportunity o) {
        Map<String, Object> ev = evidence(o);
        boolean below = "PRECO_ABAIXO_DA_VIZINHANCA".equals(o.getType());

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("produtoId", o.getProduct() != null ? o.getProduct().getId().toString() : null);
        params.put("precoAtual", ev.get("precoPraticado"));
        params.put("precoReferencia", ev.get("medianaMercado"));
        if (ev.get("precoSugerido") != null) {
            params.put("precoNovo", ev.get("precoSugerido"));
        }
        params.put("direcao", below ? "SUBIR" : "BAIXAR");

        String trace = String.format(
            "Seu preço (média dos últimos 30 dias): %s.%n"
                + "Vizinhança (Menor Preço, do Nota Paraná, lojas a até 10 km): faixa típica de %s a %s, mediana %s, em %s lojas.%n"
                + "Mais barato: %s por %s, a %s km.%n"
                + "%s%n"
                + "A faixa vai de 25%% a 75%% dos preços, depois de descartar outro produto com o mesmo código, fardos, "
                + "bares e postos e preços absurdos.%n"
                + "ATENÇÃO: a comparação não conhece o posicionamento da sua loja (atendimento, sortimento, conveniência) "
                + "e o efeito em reais supõe o mesmo volume de venda. Trate como sinal para conferir, não como veredito.",
            money(ev.get("precoPraticado")), money(ev.get("faixaDe")), money(ev.get("faixaAte")), money(ev.get("medianaMercado")),
            num(ev.get("observacoes")), ev.get("lojaMaisBarata") == null ? "—" : ev.get("lojaMaisBarata"),
            money(ev.get("menorPrecoObservado")), num(ev.get("distanciaKm")),
            below
                ? "Subir até " + money(ev.get("precoSugerido")) + " mantém a loja entre as mais baratas e soma " + money(ev.get("impacto")) + " de margem por mês."
                : "Voltar a " + money(ev.get("precoSugerido")) + " coloca a loja no topo da faixa da região.");

        return newRecommendation(o, Recommendation.ActionType.AJUSTAR_PRECO,
            (below ? "Subir o preço de " : "Revisar preço de ") + productName(o),
            o.getDescription(), params, trace, o.getExpectedImpactValue());
    }

    private Recommendation investigateRecommendation(Opportunity o) {
        Map<String, Object> ev = evidence(o);

        Map<String, Object> params = new LinkedHashMap<>();
        params.put("data", ev.get("data"));

        String trace = String.format(
            "Receita do dia: %s. Esperado pelo padrão recente: %s (desvio de %s%%).%n"
                + "O esperado vem de média exponencial dos dias anteriores — acompanha o nível "
                + "recente da loja em vez de comparar com um passado distante.%n"
                + "Z-score de %s: quanto mais longe de zero, menos o dia se explica por variação "
                + "normal.",
            money(ev.get("receitaRealizada")), money(ev.get("receitaEsperada")),
            num(ev.get("desvioPercent")), num(ev.get("zScore")));

        return newRecommendation(o, Recommendation.ActionType.INVESTIGAR,
            o.getTitle(), o.getDescription(), params, trace, o.getExpectedImpactValue());
    }

    private Recommendation newRecommendation(
        Opportunity o, Recommendation.ActionType action, String title,
        String rationale, Map<String, Object> params, String trace, BigDecimal impact
    ) {
        Recommendation r = new Recommendation();
        r.setMarket(o.getMarket());
        r.setOpportunity(o);
        r.setActionType(action);
        r.setTitle(title.length() <= 300 ? title : title.substring(0, 297) + "...");
        r.setRationale(rationale);
        r.setParameters(params);
        r.setEvidence(o.getEvidence());
        r.setCalculationTrace(trace);
        r.setConfidence(o.getConfidence());
        r.setExpectedImpactValue(impact);
        r.setStatus(Recommendation.Status.PROPOSTA);
        r.setCreatedAt(LocalDateTime.now());
        return r;
    }

    // ── Decisão do usuário ───────────────────────────────────────────────────

    /**
     * Registra a decisão sobre uma recomendação.
     *
     * Aceitar move a oportunidade para EM_ACAO — ela sai da lista de "o que
     * devo decidir" e entra na de "o que estou acompanhando". Rejeitar descarta
     * a oportunidade: o usuário avaliou e disse que não procede.
     */
    @Transactional
    public Recommendation decide(
        UUID marketId, UUID recommendationId,
        Recommendation.Status decision, String actor, String note
    ) {
        Recommendation r = recommendationRepository
            .findByIdAndMarketId(recommendationId, marketId)
            .orElseThrow(() -> new IllegalArgumentException("Recomendacao nao encontrada"));

        r.setStatus(decision);
        r.setDecidedBy(actor);
        r.setDecidedAt(LocalDateTime.now());
        r.setDecisionNote(note);

        Opportunity o = r.getOpportunity();
        if (decision == Recommendation.Status.ACEITA || decision == Recommendation.Status.EXECUTADA) {
            o.setStatus(Opportunity.Status.EM_ACAO);
            /*
             * Congela o ponto de partida AGORA, não na hora de medir: comparar
             * com números recalculados depois seria comparar com um passado que
             * já embute o efeito da própria decisão.
             *
             * Só para aceitas — rejeição não gera ação cujo efeito medir.
             */
            outcomeEvaluationService.createPending(r);
        } else if (decision == Recommendation.Status.REJEITADA) {
            o.setStatus(Opportunity.Status.DESCARTADA);
            o.setDismissReason(note);
        }
        o.setStatusChangedAt(LocalDateTime.now());
        o.setStatusChangedBy(actor);
        opportunityRepository.save(o);

        return recommendationRepository.save(r);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> evidence(Opportunity o) {
        return o.getEvidence() != null ? o.getEvidence() : Map.of();
    }

    private String productName(Opportunity o) {
        return o.getProduct() != null ? o.getProduct().getName() : "produto";
    }

    private static final Locale PT_BR = Locale.forLanguageTag("pt-BR");

    /**
     * Número como o lojista lê (UX-07): vírgula decimal, milhar com ponto e no
     * máximo 2 casas. "0.416666" virava parte do texto e minava a confiança no
     * cálculo que o trace existe para mostrar.
     */
    static String num(Object value) {
        BigDecimal b = toDecimal(value);
        if (b == null) return value == null ? "—" : value.toString();
        NumberFormat nf = NumberFormat.getNumberInstance(PT_BR);
        nf.setMinimumFractionDigits(0);
        nf.setMaximumFractionDigits(2);
        return nf.format(b);
    }

    /** Valor em reais: "R$ 5.893,50". */
    static String money(Object value) {
        BigDecimal b = toDecimal(value);
        if (b == null) return value == null ? "—" : value.toString();
        NumberFormat nf = NumberFormat.getNumberInstance(PT_BR);
        nf.setMinimumFractionDigits(2);
        nf.setMaximumFractionDigits(2);
        return "R$ " + nf.format(b);
    }

    private static BigDecimal toDecimal(Object value) {
        if (value == null) return null;
        if (value instanceof BigDecimal b) return b;
        try {
            return new BigDecimal(value.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String fmtQty(Object qty) {
        if (qty == null) return "";
        try {
            return String.valueOf(Math.round(Double.parseDouble(qty.toString())));
        } catch (NumberFormatException e) {
            return qty.toString();
        }
    }
}
