package com.pdv2cloud.service.ai;

import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.WeeklyDigest;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.OpportunityRepository;
import com.pdv2cloud.repository.WeeklyDigestRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * O resumo da semana da loja — caso 2 do §22 do plano.
 *
 * Responde a pergunta que nenhuma tela responde hoje: "como foi minha semana?".
 * O cockpit mostra o agora, a Central mostra o que fazer; falta o retrospecto,
 * que é como o dono de loja realmente pensa o negócio.
 *
 * Segue a mesma disciplina das fases anteriores: os NÚMEROS são apurados por
 * SQL determinístico e guardados junto do texto. A IA apenas os lê e escreve o
 * parágrafo. Sem chave configurada, o texto vem do gerador determinístico
 * daqui — que não é placeholder, é um resumo utilizável.
 */
@Service
@Slf4j
public class WeeklyDigestService {

    public static final String TASK = "RESUMO_SEMANAL";

    private final NamedParameterJdbcTemplate jdbc;
    private final WeeklyDigestRepository digestRepository;
    private final OpportunityRepository opportunityRepository;
    private final MarketRepository marketRepository;
    private final AiOrchestrator orchestrator;

    public WeeklyDigestService(
        NamedParameterJdbcTemplate jdbc,
        WeeklyDigestRepository digestRepository,
        OpportunityRepository opportunityRepository,
        MarketRepository marketRepository,
        AiOrchestrator orchestrator
    ) {
        this.jdbc = jdbc;
        this.digestRepository = digestRepository;
        this.opportunityRepository = opportunityRepository;
        this.marketRepository = marketRepository;
        this.orchestrator = orchestrator;
    }

    /**
     * Gera (ou atualiza) o resumo da semana passada.
     *
     * Idempotente por (mercado, segunda-feira): rodar duas vezes atualiza a
     * mesma linha. Importa porque um job que falha no meio será re-executado, e
     * duplicar semanas quebraria a série que a tela mostra.
     *
     * @return vazio quando não houve venda na semana — uma loja fechada não
     *         precisa de resumo, e gerar um texto sobre o nada seria pior que
     *         não gerar nada
     */
    @Transactional
    public Optional<WeeklyDigest> generateForLastWeek(UUID marketId) {
        LocalDate lastMonday = LocalDate.now()
            .with(DayOfWeek.MONDAY).minusWeeks(1);
        return generateForWeek(marketId, lastMonday);
    }

    @Transactional
    public Optional<WeeklyDigest> generateForWeek(UUID marketId, LocalDate weekStart) {
        LocalDate monday = weekStart.with(DayOfWeek.MONDAY);
        LocalDate sunday = monday.plusDays(6);

        Map<String, Object> metrics = collectMetrics(marketId, monday, sunday);
        if (metrics.isEmpty()) {
            return Optional.empty();
        }

        String deterministicText = buildDeterministicSummary(metrics);

        // Contexto e hash montados a partir dos NÚMEROS, não do texto: se a
        // semana teve os mesmos resultados, o cache responde.
        String prompt = buildPrompt(metrics);
        AiContextBuilder.AiContext context =
            new AiContextBuilder.AiContext(prompt, sha256(prompt));

        AiOrchestrator.Interpretation interpretation = orchestrator.interpret(
            marketId, TASK, "WEEK", null, context,
            AiPrompts.SYSTEM_WEEKLY, AiPrompts.VERSION_WEEKLY, deterministicText
        );

        WeeklyDigest digest = digestRepository
            .findByMarketIdAndWeekStart(marketId, monday)
            .orElseGet(() -> {
                WeeklyDigest fresh = new WeeklyDigest();
                fresh.setMarket(marketRepository.getReferenceById(marketId));
                fresh.setWeekStart(monday);
                return fresh;
            });

        digest.setWeekEnd(sunday);
        digest.setMetrics(metrics);
        digest.setSummary(interpretation.content());
        digest.setDeterministic(interpretation.deterministic());
        digest.setProvider(interpretation.provider());
        digest.setPromptVersion(AiPrompts.VERSION_WEEKLY);

        return Optional.of(digestRepository.save(digest));
    }

    public List<WeeklyDigest> recent(UUID marketId) {
        return digestRepository.findRecentByMarket(marketId);
    }

    /**
     * Apura os fatos da semana.
     *
     * Uma consulta agregada para vendas (com a semana anterior na mesma query,
     * para a comparação usar a mesma régua), uma para os destaques de produto,
     * e a leitura das oportunidades abertas.
     */
    private Map<String, Object> collectMetrics(UUID marketId, LocalDate monday, LocalDate sunday) {
        String salesSql = """
            select
              count(*) filter (where data_emissao >= :inicio) as cupons,
              coalesce(sum(valor_total) filter (where data_emissao >= :inicio), 0) as receita,
              count(*) filter (where data_emissao < :inicio) as cupons_anterior,
              coalesce(sum(valor_total) filter (where data_emissao < :inicio), 0)
                as receita_anterior
            from invoices
            where market_id = :marketId
              and data_emissao >= :inicioAnterior
              and data_emissao < :fim
            """;

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("inicio", monday.atStartOfDay())
            .addValue("inicioAnterior", monday.minusWeeks(1).atStartOfDay())
            .addValue("fim", sunday.plusDays(1).atStartOfDay());

        Map<String, Object> metrics = jdbc.query(salesSql, params, rs -> {
            if (!rs.next()) {
                return new LinkedHashMap<String, Object>();
            }
            long coupons = rs.getLong("cupons");
            if (coupons == 0) {
                // Loja sem venda na semana: não há resumo a fazer.
                return new LinkedHashMap<String, Object>();
            }
            BigDecimal revenue = rs.getBigDecimal("receita");
            BigDecimal previous = rs.getBigDecimal("receita_anterior");

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("semanaDe", monday.toString());
            out.put("semanaAte", sunday.toString());
            out.put("faturamento", scale(revenue));
            out.put("cupons", coupons);
            out.put("ticketMedio", revenue.divide(
                BigDecimal.valueOf(coupons), 2, RoundingMode.HALF_UP));
            out.put("faturamentoSemanaAnterior", scale(previous));
            if (previous != null && previous.signum() > 0) {
                out.put("variacaoPercent", revenue.subtract(previous)
                    .multiply(BigDecimal.valueOf(100))
                    .divide(previous, 1, RoundingMode.HALF_UP));
            }
            return out;
        });

        if (metrics == null || metrics.isEmpty()) {
            return Map.of();
        }

        metrics.put("destaques", topProducts(marketId, monday, sunday));
        metrics.putAll(opportunitySummary(marketId));
        return metrics;
    }

    /** Os cinco produtos que mais faturaram na semana. */
    private List<Map<String, Object>> topProducts(
        UUID marketId, LocalDate monday, LocalDate sunday
    ) {
        String sql = """
            select p.name as produto, sum(ii.valor_total) as receita,
                   sum(ii.quantidade) as quantidade
            from invoice_items ii
            join invoices i on i.id = ii.invoice_id
            join products p on p.id = ii.product_id
            where i.market_id = :marketId
              and i.data_emissao >= :inicio and i.data_emissao < :fim
            group by p.name
            order by sum(ii.valor_total) desc
            limit 5
            """;

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("inicio", monday.atStartOfDay())
            .addValue("fim", sunday.plusDays(1).atStartOfDay());

        List<Map<String, Object>> items = new ArrayList<>();
        jdbc.query(sql, params, rs -> {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("produto", rs.getString("produto"));
            item.put("receita", scale(rs.getBigDecimal("receita")));
            item.put("quantidade", scale0(rs.getBigDecimal("quantidade")));
            items.add(item);
        });
        return items;
    }

    /** O que ficou pendente de decisão, por tipo. */
    private Map<String, Object> opportunitySummary(UUID marketId) {
        List<Opportunity> open = opportunityRepository.findOpenByMarket(marketId);
        Map<String, Long> byType = new LinkedHashMap<>();
        BigDecimal impact = BigDecimal.ZERO;

        for (Opportunity o : open) {
            byType.merge(o.getType(), 1L, Long::sum);
            if (o.getExpectedImpactValue() != null) {
                impact = impact.add(o.getExpectedImpactValue());
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("oportunidadesAbertas", open.size());
        out.put("oportunidadesPorTipo", byType);
        out.put("impactoEstimadoTotal", scale(impact));
        return out;
    }

    /**
     * O contexto que vai ao modelo.
     *
     * São só os números apurados — nenhum dado bruto de nota, nenhum
     * identificador. Não passa pela allowlist do {@link AiContextBuilder}
     * porque aqui não há evidência de detector: cada campo deste texto foi
     * escrito à mão, um a um, e todos são agregados da loja.
     */
    private String buildPrompt(Map<String, Object> m) {
        StringBuilder sb = new StringBuilder();
        sb.append("RESUMO DA SEMANA DE ").append(m.get("semanaDe"))
            .append(" A ").append(m.get("semanaAte")).append("\n\n");
        sb.append("Faturamento: R$ ").append(money(m.get("faturamento"))).append('\n');
        sb.append("Cupons: ").append(m.get("cupons")).append('\n');
        sb.append("Ticket médio: R$ ").append(money(m.get("ticketMedio"))).append('\n');
        sb.append("Semana anterior: R$ ")
            .append(money(m.get("faturamentoSemanaAnterior"))).append('\n');
        if (m.get("variacaoPercent") != null) {
            sb.append("Variação: ").append(m.get("variacaoPercent")).append("%\n");
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> top = (List<Map<String, Object>>) m.get("destaques");
        if (top != null && !top.isEmpty()) {
            sb.append("\nPRODUTOS QUE MAIS FATURARAM\n");
            for (Map<String, Object> p : top) {
                sb.append("- ").append(p.get("produto"))
                    .append(": R$ ").append(money(p.get("receita")))
                    .append(" (").append(p.get("quantidade")).append(" un)\n");
            }
        }

        Object open = m.get("oportunidadesAbertas");
        if (open instanceof Number n && n.intValue() > 0) {
            sb.append("\nPENDENTE DE DECISÃO\n");
            sb.append(n).append(" oportunidades abertas");
            Object impact = m.get("impactoEstimadoTotal");
            if (impact != null) {
                sb.append(", impacto estimado de R$ ").append(money(impact));
            }
            sb.append('\n');
            @SuppressWarnings("unchecked")
            Map<String, Long> byType = (Map<String, Long>) m.get("oportunidadesPorTipo");
            if (byType != null) {
                byType.forEach((k, v) -> sb.append("- ").append(k)
                    .append(": ").append(v).append('\n'));
            }
        }

        return sb.toString();
    }

    /**
     * O resumo sem IA.
     *
     * Não é um placeholder: um lojista sem chave configurada recebe um texto
     * que descreve a semana com os mesmos números. A IA melhora a redação, não
     * cria a informação.
     */
    String buildDeterministicSummary(Map<String, Object> m) {
        StringBuilder sb = new StringBuilder();
        sb.append("A loja faturou R$ ").append(money(m.get("faturamento")))
            .append(" em ").append(m.get("cupons")).append(" compras, ")
            .append("com ticket médio de R$ ").append(money(m.get("ticketMedio"))).append('.');

        Object variation = m.get("variacaoPercent");
        if (variation instanceof BigDecimal v) {
            if (v.signum() > 0) {
                sb.append(" Foi ").append(v.abs()).append("% acima da semana anterior.");
            } else if (v.signum() < 0) {
                sb.append(" Foi ").append(v.abs()).append("% abaixo da semana anterior.");
            } else {
                sb.append(" Ficou no mesmo patamar da semana anterior.");
            }
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> top = (List<Map<String, Object>>) m.get("destaques");
        if (top != null && !top.isEmpty()) {
            sb.append(" O destaque foi ").append(top.get(0).get("produto"))
                .append(", com R$ ").append(money(top.get(0).get("receita"))).append('.');
        }

        Object open = m.get("oportunidadesAbertas");
        if (open instanceof Number n && n.intValue() > 0) {
            sb.append(" Há ").append(n)
                .append(n.intValue() == 1 ? " oportunidade aguardando" : " oportunidades aguardando")
                .append(" sua decisão na Central de Inteligência.");
        }

        return sb.toString();
    }

    private static String money(Object value) {
        if (value == null) {
            return "0,00";
        }
        BigDecimal v = value instanceof BigDecimal b ? b : new BigDecimal(value.toString());
        return String.format(Locale.forLanguageTag("pt-BR"), "%,.2f", v);
    }

    private static BigDecimal scale(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal scale0(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v.setScale(0, RoundingMode.HALF_UP);
    }

    private static String sha256(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(64);
            for (byte b : digest) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 indisponível na JVM", e);
        }
    }
}
