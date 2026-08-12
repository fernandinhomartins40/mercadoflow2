package com.pdv2cloud.service.ai.chat;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Ferramentas sobre vendas: faturamento, produtos que mais vendem, evolução no
 * tempo e horário de movimento.
 *
 * As consultas são SQL direto sobre {@code invoices}/{@code invoice_items} —
 * as mesmas agregações que o cockpit faz. O {@code marketId} entra sempre como
 * parâmetro vindo do contexto autenticado, nunca dos argumentos do modelo.
 */
@Component
public class SalesTools {

    /** Teto de janela. Períodos maiores custam caro e não mudam a conclusão. */
    private static final int MAX_WINDOW_DAYS = 365;

    private final NamedParameterJdbcTemplate jdbc;

    public SalesTools(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<DataTool> tools() {
        return List.of(resumoDeVendas(), maisVendidos(), vendasPorDiaDaSemana());
    }

    /** "Quanto vendi este mês?" / "Como foi a semana?" */
    private DataTool resumoDeVendas() {
        return new DataTool() {
            @Override
            public String name() {
                return "resumo_de_vendas";
            }

            @Override
            public String description() {
                return "Faturamento, número de cupons e ticket médio de um período, "
                    + "comparados com o período anterior de mesma duração. Use para "
                    + "perguntas sobre quanto a loja vendeu, se as vendas cresceram ou "
                    + "caíram, ou sobre o movimento de um período.";
            }

            @Override
            public Map<String, Object> parametersSchema() {
                return DataTool.schema(Map.of(
                    "dias", DataTool.numberParam(
                        "Tamanho do período em dias, contado até hoje. "
                            + "Ex.: 7 para a última semana, 30 para o último mês. Padrão 30")
                ), List.of());
            }

            @Override
            public Map<String, Object> execute(UUID marketId, Map<String, Object> args) {
                int days = Math.min(MAX_WINDOW_DAYS,
                    Math.max(1, DataTool.intArg(args, "dias", 30)));

                // Os dois períodos numa query só: metade do custo e garantia de
                // que ambos são medidos com a mesma régua.
                String sql = """
                    select
                      count(*) filter (where data_emissao >= :inicio) as cupons_atual,
                      coalesce(sum(valor_total) filter (where data_emissao >= :inicio), 0)
                        as receita_atual,
                      count(*) filter (where data_emissao < :inicio) as cupons_anterior,
                      coalesce(sum(valor_total) filter (where data_emissao < :inicio), 0)
                        as receita_anterior
                    from invoices
                    where market_id = :marketId
                      and data_emissao >= :inicioAnterior
                    """;

                LocalDate start = LocalDate.now().minusDays(days);
                MapSqlParameterSource params = new MapSqlParameterSource()
                    .addValue("marketId", marketId)
                    .addValue("inicio", start.atStartOfDay())
                    .addValue("inicioAnterior", start.minusDays(days).atStartOfDay());

                return jdbc.query(sql, params, rs -> {
                    Map<String, Object> out = new LinkedHashMap<>();
                    if (!rs.next()) {
                        return Map.of("resultado", "Sem vendas registradas no período.");
                    }
                    BigDecimal current = rs.getBigDecimal("receita_atual");
                    BigDecimal previous = rs.getBigDecimal("receita_anterior");
                    long coupons = rs.getLong("cupons_atual");

                    out.put("periodoDias", days);
                    out.put("faturamento", scale(current));
                    out.put("cupons", coupons);
                    if (coupons > 0) {
                        out.put("ticketMedio", current.divide(
                            BigDecimal.valueOf(coupons), 2, RoundingMode.HALF_UP));
                    }
                    out.put("faturamentoPeriodoAnterior", scale(previous));
                    if (previous != null && previous.signum() > 0) {
                        out.put("variacaoPercent", current.subtract(previous)
                            .multiply(BigDecimal.valueOf(100))
                            .divide(previous, 1, RoundingMode.HALF_UP));
                    } else {
                        out.put("variacaoPercent", null);
                        out.put("observacao", "Não há período anterior comparável.");
                    }
                    return out;
                });
            }
        };
    }

    /** "Quais são meus produtos que mais vendem?" */
    private DataTool maisVendidos() {
        return new DataTool() {
            @Override
            public String name() {
                return "produtos_mais_vendidos";
            }

            @Override
            public String description() {
                return "Os produtos que mais faturaram num período, com receita, "
                    + "quantidade vendida e preço médio. Também serve para os que menos "
                    + "vendem, invertendo a ordem. Use para rankings de produto.";
            }

            @Override
            public Map<String, Object> parametersSchema() {
                return DataTool.schema(Map.of(
                    "dias", DataTool.numberParam("Período em dias (padrão 30)"),
                    "limite", DataTool.numberParam("Quantos produtos (padrão 10)"),
                    "ordem", DataTool.enumParam(
                        "'maiores' para os que mais vendem, 'menores' para os que menos vendem",
                        List.of("maiores", "menores"))
                ), List.of());
            }

            @Override
            public Map<String, Object> execute(UUID marketId, Map<String, Object> args) {
                int days = Math.min(MAX_WINDOW_DAYS,
                    Math.max(1, DataTool.intArg(args, "dias", 30)));
                int limit = DataTool.limitArg(args);
                boolean ascending = "menores".equalsIgnoreCase(
                    String.valueOf(DataTool.stringArg(args, "ordem")));

                // A direção entra por concatenação de um literal controlado, não
                // por parâmetro: só há dois valores possíveis e ambos são nossos.
                String sql = """
                    select p.name as produto,
                           sum(ii.valor_total) as receita,
                           sum(ii.quantidade) as quantidade,
                           avg(ii.valor_unitario) as preco_medio
                    from invoice_items ii
                    join invoices i on i.id = ii.invoice_id
                    join products p on p.id = ii.product_id
                    where i.market_id = :marketId
                      and i.data_emissao >= :inicio
                    group by p.name
                    order by sum(ii.valor_total) """ + (ascending ? "asc" : "desc") + """

                    limit :limite
                    """;

                MapSqlParameterSource params = new MapSqlParameterSource()
                    .addValue("marketId", marketId)
                    .addValue("inicio", LocalDate.now().minusDays(days).atStartOfDay())
                    .addValue("limite", limit);

                List<Map<String, Object>> items = new ArrayList<>();
                jdbc.query(sql, params, rs -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("produto", rs.getString("produto"));
                    item.put("receita", scale(rs.getBigDecimal("receita")));
                    item.put("quantidade", scale0(rs.getBigDecimal("quantidade")));
                    item.put("precoMedio", scale(rs.getBigDecimal("preco_medio")));
                    items.add(item);
                });

                if (items.isEmpty()) {
                    return Map.of("resultado", "Sem vendas no período informado.");
                }

                Map<String, Object> out = new LinkedHashMap<>();
                out.put("periodoDias", days);
                out.put("ordem", ascending ? "menores" : "maiores");
                out.put("produtos", items);
                return out;
            }
        };
    }

    /** "Qual meu melhor dia da semana?" */
    private DataTool vendasPorDiaDaSemana() {
        return new DataTool() {
            @Override
            public String name() {
                return "vendas_por_dia_da_semana";
            }

            @Override
            public String description() {
                return "Faturamento médio por dia da semana, mostrando quais dias "
                    + "movimentam mais. Use para perguntas sobre melhor dia, dia fraco, "
                    + "quando promover ou quando escalar equipe.";
            }

            @Override
            public Map<String, Object> parametersSchema() {
                return DataTool.schema(Map.of(
                    "dias", DataTool.numberParam("Período analisado em dias (padrão 90)")
                ), List.of());
            }

            @Override
            public Map<String, Object> execute(UUID marketId, Map<String, Object> args) {
                int days = Math.min(MAX_WINDOW_DAYS,
                    Math.max(7, DataTool.intArg(args, "dias", 90)));

                // Média POR DATA e depois por dia da semana: somar direto faria um
                // período com cinco sábados parecer melhor que um com quatro.
                String sql = """
                    with por_dia as (
                      select date(data_emissao) as dia,
                             extract(dow from data_emissao)::int as dow,
                             sum(valor_total) as receita,
                             count(*) as cupons
                      from invoices
                      where market_id = :marketId and data_emissao >= :inicio
                      group by 1, 2
                    )
                    select dow, avg(receita) as receita_media, avg(cupons) as cupons_medio,
                           count(*) as datas
                    from por_dia group by dow order by dow
                    """;

                MapSqlParameterSource params = new MapSqlParameterSource()
                    .addValue("marketId", marketId)
                    .addValue("inicio", LocalDate.now().minusDays(days).atStartOfDay());

                String[] names = {"domingo", "segunda", "terça", "quarta",
                    "quinta", "sexta", "sábado"};

                List<Map<String, Object>> items = new ArrayList<>();
                jdbc.query(sql, params, rs -> {
                    int dow = rs.getInt("dow");
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("dia", names[Math.max(0, Math.min(6, dow))]);
                    item.put("faturamentoMedio", scale(rs.getBigDecimal("receita_media")));
                    item.put("cuponsMedio", scale0(rs.getBigDecimal("cupons_medio")));
                    item.put("datasObservadas", rs.getInt("datas"));
                    items.add(item);
                });

                if (items.isEmpty()) {
                    return Map.of("resultado", "Sem vendas suficientes no período.");
                }

                Map<String, Object> out = new LinkedHashMap<>();
                out.put("periodoDias", days);
                out.put("porDiaDaSemana", items);
                return out;
            }
        };
    }

    private static BigDecimal scale(BigDecimal v) {
        return v == null ? null : v.setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal scale0(BigDecimal v) {
        return v == null ? null : v.setScale(0, RoundingMode.HALF_UP);
    }
}
