package com.pdv2cloud.controller;

import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.repository.OpportunityRepository;
import com.pdv2cloud.repository.RecommendationRepository;
import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.PlanService;
import com.pdv2cloud.service.intelligence.CapitalMetricsReader;
import com.pdv2cloud.service.WorkingCapitalService.CapitalMetric;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Exportação dos dados da loja em CSV.
 *
 * Recurso do plano Profissional: quem pede exportação é quem tem outro sistema
 * e equipe para consumi-la. Não é análise — é operação madura.
 *
 * <b>Formato:</b> separador ponto-e-vírgula e decimal com vírgula, porque o
 * destino real é o Excel em português. CSV com vírgula abriria tudo numa coluna
 * só e o cliente concluiria que o arquivo veio quebrado.
 *
 * <b>BOM UTF-8 no início:</b> sem ele o Excel lê "Ação" como "AÃ§Ã£o". É um
 * detalhe de três bytes que decide se o arquivo é usável.
 */
@RestController
@RequestMapping("/api/v1/markets/{marketId}/export")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class DataExportController {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    /** Excel em pt-BR espera ponto-e-vírgula; vírgula juntaria tudo numa coluna. */
    private static final char SEP = ';';

    /** Sem BOM, o Excel exibe acentos como mojibake. */
    private static final String BOM = "﻿";

    private final CapitalMetricsReader capitalMetricsReader;
    private final OpportunityRepository opportunityRepository;
    private final RecommendationRepository recommendationRepository;
    private final MarketAccessService marketAccessService;
    private final PlanService planService;

    public DataExportController(
        CapitalMetricsReader capitalMetricsReader,
        OpportunityRepository opportunityRepository,
        RecommendationRepository recommendationRepository,
        MarketAccessService marketAccessService,
        PlanService planService
    ) {
        this.capitalMetricsReader = capitalMetricsReader;
        this.opportunityRepository = opportunityRepository;
        this.recommendationRepository = recommendationRepository;
        this.marketAccessService = marketAccessService;
        this.planService = planService;
    }

    private boolean allowed(UUID marketId) {
        return planService.canUseDataExport(planService.limitsFor(marketId));
    }

    /** O plano permite exportar? A tela usa para mostrar o botão ou o convite. */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> status(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        boolean ok = allowed(marketId);
        return ResponseEntity.ok(ok
            ? Map.of("disponivel", true)
            : Map.of(
                "disponivel", false,
                "mensagem", "Exportar seus dados para planilha ou para outro sistema "
                    + "faz parte do plano Profissional."
            ));
    }

    /** Portfólio completo: capital, giro, cobertura e sugestão de compra. */
    @GetMapping(value = "/capital.csv", produces = "text/csv")
    public ResponseEntity<byte[]> capitalCsv(
        @PathVariable("marketId") UUID marketId,
        @RequestParam(value = "windowDays", defaultValue = "90") int windowDays,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        if (!allowed(marketId)) {
            return ResponseEntity.status(403).build();
        }

        PlanService.EffectiveLimits limits = planService.limitsFor(marketId);
        List<CapitalMetric> rows = capitalMetricsReader.portfolio(
            marketId, planService.clampWindow(limits, windowDays));

        StringBuilder csv = new StringBuilder(BOM);
        header(csv, "Produto", "EAN", "Categoria", "Classe ABC", "Classe XYZ",
            "Receita", "Qtd vendida", "Venda por dia", "Cobertura (dias)",
            "Estoque (un)", "Valor em estoque", "GMROI", "Margem %",
            "Qtd sugerida", "Valor sugerido", "Veredito", "Ultima venda");

        for (CapitalMetric m : rows) {
            line(csv,
                m.name(), m.ean(), m.category(), m.abcClass(), m.xyzClass(),
                num(m.revenue()), num(m.quantitySold()), num(m.dailyVelocity()),
                num(m.coverageDays()), num(m.inventoryUnits()), num(m.inventoryValue()),
                num(m.gmroi()), num(m.grossMarginPercent()),
                num(m.suggestedOrderUnits()), num(m.suggestedOrderValue()),
                m.capitalStatus() != null ? m.capitalStatus().name() : "",
                m.lastSaleDate() != null ? m.lastSaleDate().format(DATE) : "");
        }

        return download(csv.toString(), "capital-de-giro.csv");
    }

    /** Oportunidades abertas, com os números que as sustentam. */
    @GetMapping(value = "/oportunidades.csv", produces = "text/csv")
    public ResponseEntity<byte[]> opportunitiesCsv(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        if (!allowed(marketId)) {
            return ResponseEntity.status(403).build();
        }

        StringBuilder csv = new StringBuilder(BOM);
        header(csv, "Tipo", "Situacao", "Produto", "Resumo", "Impacto estimado",
            "Confianca", "Detectada vezes", "Primeira deteccao", "Ultima deteccao");

        for (Opportunity o : opportunityRepository.findAllByMarket(marketId)) {
            line(csv,
                o.getType(),
                o.getStatus() != null ? o.getStatus().name() : "",
                o.getProduct() != null ? o.getProduct().getName() : "",
                o.getTitle(),
                num(o.getExpectedImpactValue()),
                num(o.getConfidence()),
                String.valueOf(o.getDetectionCount()),
                o.getFirstDetectedAt() != null ? o.getFirstDetectedAt().format(DATE) : "",
                o.getLastDetectedAt() != null ? o.getLastDetectedAt().format(DATE) : "");
        }

        return download(csv.toString(), "oportunidades.csv");
    }

    /** Decisões tomadas: o que foi aceito, rejeitado e com que justificativa. */
    @GetMapping(value = "/decisoes.csv", produces = "text/csv")
    public ResponseEntity<byte[]> decisionsCsv(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        if (!allowed(marketId)) {
            return ResponseEntity.status(403).build();
        }

        StringBuilder csv = new StringBuilder(BOM);
        header(csv, "Acao", "Situacao", "Resumo", "Retorno esperado",
            "Confianca", "Decidido por", "Decidido em", "Observacao");

        recommendationRepository.findDecidedByMarket(marketId).forEach(r -> line(csv,
            r.getActionType() != null ? r.getActionType().name() : "",
            r.getStatus() != null ? r.getStatus().name() : "",
            r.getTitle(),
            num(r.getExpectedImpactValue()),
            num(r.getConfidence()),
            r.getDecidedBy(),
            r.getDecidedAt() != null ? r.getDecidedAt().format(DATE) : "",
            r.getDecisionNote()));

        return download(csv.toString(), "decisoes.csv");
    }

    // ── Montagem do CSV ──────────────────────────────────────────────────────

    private void header(StringBuilder csv, String... columns) {
        line(csv, columns);
    }

    private void line(StringBuilder csv, String... values) {
        for (int i = 0; i < values.length; i++) {
            if (i > 0) {
                csv.append(SEP);
            }
            csv.append(escape(values[i]));
        }
        csv.append('\n');
    }

    /**
     * Escapa o valor no dialeto CSV.
     *
     * Aspas viram aspas duplas e o campo é envolvido quando contém separador,
     * aspa ou quebra de linha — um nome de produto com ponto-e-vírgula
     * desalinharia todas as colunas seguintes.
     */
    private String escape(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        boolean needsQuotes = value.indexOf(SEP) >= 0
            || value.indexOf('"') >= 0
            || value.indexOf('\n') >= 0
            || value.indexOf('\r') >= 0;
        String escaped = value.replace("\"", "\"\"");
        return needsQuotes ? '"' + escaped + '"' : escaped;
    }

    /** Decimal com vírgula: é o que o Excel em português reconhece como número. */
    private String num(BigDecimal value) {
        return value == null ? "" : value.toPlainString().replace('.', ',');
    }

    private ResponseEntity<byte[]> download(String csv, String filename) {
        byte[] body = csv.getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"" + filename + "\"")
            .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
            .body(body);
    }
}
