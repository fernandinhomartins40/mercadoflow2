package com.pdv2cloud.service.ai.chat;

import com.pdv2cloud.model.entity.ProductCapitalMetric.CapitalStatus;
import com.pdv2cloud.service.WorkingCapitalService.CapitalMetric;
import com.pdv2cloud.service.intelligence.CapitalMetricsReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Ferramentas sobre capital de giro e compra — as perguntas que o dono de
 * supermercado mais faz: o que comprar, o que está parado, quanto vale o
 * estoque.
 *
 * Todas leem o {@link CapitalMetricsReader}, que serve as tabelas
 * materializadas pela Fase 2 com fallback para o cálculo on-line. Consultar
 * daqui custa o mesmo que abrir a tela de capital — nenhuma query nova foi
 * inventada para o chat.
 */
@Component
public class CapitalTools {

    /** Janela padrão das métricas, a mesma das telas. */
    private static final int WINDOW_DAYS = 90;

    private final CapitalMetricsReader reader;

    public CapitalTools(CapitalMetricsReader reader) {
        this.reader = reader;
    }

    /** As ferramentas que este componente publica. */
    public List<DataTool> tools() {
        return List.of(comprar(), capitalParado(), resumoDoPortfolio(), sobreProduto());
    }

    /** "O que eu preciso comprar?" */
    private DataTool comprar() {
        return new DataTool() {
            @Override
            public String name() {
                return "listar_produtos_para_comprar";
            }

            @Override
            public String description() {
                return "Lista os produtos que precisam de reposição, com a quantidade "
                    + "sugerida, o valor estimado da compra e há quantos dias o estoque "
                    + "ainda cobre a venda. Use para perguntas sobre o que comprar, "
                    + "reposição, risco de faltar produto ou pedido a fornecedor.";
            }

            @Override
            public Map<String, Object> parametersSchema() {
                return DataTool.schema(Map.of(
                    "limite", DataTool.numberParam(
                        "Quantos produtos listar (padrão 10, máximo 25)")
                ), List.of());
            }

            @Override
            public Map<String, Object> execute(UUID marketId, Map<String, Object> args) {
                int limit = DataTool.limitArg(args);

                List<CapitalMetric> candidates = reader.portfolio(marketId, WINDOW_DAYS).stream()
                    .filter(m -> m.suggestedOrderUnits() != null
                        && m.suggestedOrderUnits().signum() > 0)
                    // Cobertura curta primeiro: é o que falta antes.
                    .sorted(Comparator.comparing(
                        (CapitalMetric m) -> m.coverageDays() == null
                            ? BigDecimal.valueOf(999) : m.coverageDays()))
                    .limit(limit)
                    .toList();

                if (candidates.isEmpty()) {
                    return Map.of("resultado",
                        "Nenhum produto com reposição sugerida no momento.");
                }

                List<Map<String, Object>> items = new ArrayList<>();
                BigDecimal total = BigDecimal.ZERO;
                for (CapitalMetric m : candidates) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("produto", m.name());
                    item.put("quantidadeSugerida", round(m.suggestedOrderUnits(), 0));
                    item.put("valorEstimado", round(m.suggestedOrderValue(), 2));
                    item.put("coberturaDias", round(m.coverageDays(), 1));
                    item.put("vendaPorDia", round(m.dailyVelocity(), 2));
                    item.put("classeAbc", m.abcClass());
                    items.add(item);
                    if (m.suggestedOrderValue() != null) {
                        total = total.add(m.suggestedOrderValue());
                    }
                }

                Map<String, Object> out = new LinkedHashMap<>();
                out.put("produtos", items);
                out.put("valorTotalDaLista", round(total, 2));
                out.put("observacao", "Quantidades calculadas a partir da venda média "
                    + "e do estoque estimado. O estoque é teórico: depende do cadastro "
                    + "de compras estar em dia.");
                return out;
            }
        };
    }

    /** "Onde meu dinheiro está parado?" */
    private DataTool capitalParado() {
        return new DataTool() {
            @Override
            public String name() {
                return "listar_capital_parado";
            }

            @Override
            public String description() {
                return "Lista os produtos com dinheiro parado no estoque — os que o "
                    + "sistema classificou como LIQUIDAR ou REDUZIR, com o valor "
                    + "imobilizado em cada um. Use para perguntas sobre estoque parado, "
                    + "capital imobilizado, produtos encalhados ou o que liquidar.";
            }

            @Override
            public Map<String, Object> parametersSchema() {
                return DataTool.schema(Map.of(
                    "limite", DataTool.numberParam("Quantos produtos listar (padrão 10)")
                ), List.of());
            }

            @Override
            public Map<String, Object> execute(UUID marketId, Map<String, Object> args) {
                int limit = DataTool.limitArg(args);

                List<CapitalMetric> frozen = reader.portfolio(marketId, WINDOW_DAYS).stream()
                    .filter(m -> m.capitalStatus() == CapitalStatus.LIQUIDAR
                        || m.capitalStatus() == CapitalStatus.REDUZIR)
                    .sorted(Comparator.comparing(
                        (CapitalMetric m) -> m.inventoryValue() == null
                            ? BigDecimal.ZERO : m.inventoryValue()).reversed())
                    .limit(limit)
                    .toList();

                if (frozen.isEmpty()) {
                    return Map.of("resultado",
                        "Nenhum produto classificado como capital parado.");
                }

                List<Map<String, Object>> items = new ArrayList<>();
                BigDecimal total = BigDecimal.ZERO;
                for (CapitalMetric m : frozen) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("produto", m.name());
                    item.put("veredito", m.capitalStatus().name());
                    item.put("valorParado", round(m.inventoryValue(), 2));
                    item.put("coberturaDias", round(m.coverageDays(), 1));
                    item.put("vendaPorDia", round(m.dailyVelocity(), 2));
                    item.put("motivo", m.capitalReason());
                    items.add(item);
                    if (m.inventoryValue() != null) {
                        total = total.add(m.inventoryValue());
                    }
                }

                Map<String, Object> out = new LinkedHashMap<>();
                out.put("produtos", items);
                out.put("valorTotalParado", round(total, 2));
                return out;
            }
        };
    }

    /** "Como está minha loja no geral?" */
    private DataTool resumoDoPortfolio() {
        return new DataTool() {
            @Override
            public String name() {
                return "resumo_do_estoque";
            }

            @Override
            public String description() {
                return "Visão geral do estoque da loja: quantos produtos existem, "
                    + "quanto vale o estoque, quanto está saudável e quanto está parado, "
                    + "e a distribuição entre as classes A, B e C. Use para perguntas "
                    + "amplas sobre a situação da loja ou do capital investido.";
            }

            @Override
            public Map<String, Object> parametersSchema() {
                return DataTool.schema(Map.of(), List.of());
            }

            @Override
            public Map<String, Object> execute(UUID marketId, Map<String, Object> args) {
                List<CapitalMetric> portfolio = reader.portfolio(marketId, WINDOW_DAYS);
                if (portfolio.isEmpty()) {
                    return Map.of("resultado", "Ainda não há métricas de estoque "
                        + "calculadas para esta loja.");
                }

                BigDecimal totalValue = BigDecimal.ZERO;
                BigDecimal frozenValue = BigDecimal.ZERO;
                Map<String, Integer> byClass = new LinkedHashMap<>();
                Map<String, Integer> byStatus = new LinkedHashMap<>();

                for (CapitalMetric m : portfolio) {
                    if (m.inventoryValue() != null) {
                        totalValue = totalValue.add(m.inventoryValue());
                        if (m.capitalStatus() == CapitalStatus.LIQUIDAR
                            || m.capitalStatus() == CapitalStatus.REDUZIR) {
                            frozenValue = frozenValue.add(m.inventoryValue());
                        }
                    }
                    byClass.merge(m.abcClass() == null ? "?" : m.abcClass(), 1, Integer::sum);
                    byStatus.merge(m.capitalStatus().name(), 1, Integer::sum);
                }

                Map<String, Object> out = new LinkedHashMap<>();
                out.put("totalDeProdutos", portfolio.size());
                out.put("valorDoEstoque", round(totalValue, 2));
                out.put("valorParado", round(frozenValue, 2));
                if (totalValue.signum() > 0) {
                    out.put("percentualParado", frozenValue
                        .multiply(BigDecimal.valueOf(100))
                        .divide(totalValue, 1, RoundingMode.HALF_UP));
                }
                out.put("produtosPorClasseAbc", byClass);
                out.put("produtosPorVeredito", byStatus);
                out.put("observacao", "Valores baseados em estoque teórico, calculado "
                    + "a partir das compras registradas menos as vendas.");
                return out;
            }
        };
    }

    /** "Como está o produto X?" */
    private DataTool sobreProduto() {
        return new DataTool() {
            @Override
            public String name() {
                return "consultar_produto";
            }

            @Override
            public String description() {
                return "Consulta os números de um produto específico pelo nome: quanto "
                    + "vende por dia, cobertura de estoque, classe ABC, margem, GMROI, "
                    + "veredito do sistema e quantidade sugerida de compra. Use quando "
                    + "a pergunta cita um produto pelo nome.";
            }

            @Override
            public Map<String, Object> parametersSchema() {
                return DataTool.schema(Map.of(
                    "nome", DataTool.stringParam(
                        "Nome ou parte do nome do produto, como o lojista falaria")
                ), List.of("nome"));
            }

            @Override
            public Map<String, Object> execute(UUID marketId, Map<String, Object> args) {
                String query = DataTool.stringArg(args, "nome");
                if (query == null) {
                    return Map.of("erro", "Informe o nome do produto.");
                }
                String needle = query.toLowerCase(Locale.ROOT);

                List<CapitalMetric> matches = reader.portfolio(marketId, WINDOW_DAYS).stream()
                    .filter(m -> m.name() != null
                        && m.name().toLowerCase(Locale.ROOT).contains(needle))
                    .sorted(Comparator.comparing(
                        (CapitalMetric m) -> m.revenue() == null
                            ? BigDecimal.ZERO : m.revenue()).reversed())
                    .limit(5)
                    .toList();

                if (matches.isEmpty()) {
                    return Map.of("resultado",
                        "Nenhum produto encontrado com '" + query + "'.");
                }

                List<Map<String, Object>> items = new ArrayList<>();
                for (CapitalMetric m : matches) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("produto", m.name());
                    item.put("receitaNoPeriodo", round(m.revenue(), 2));
                    item.put("quantidadeVendida", round(m.quantitySold(), 0));
                    item.put("vendaPorDia", round(m.dailyVelocity(), 2));
                    item.put("coberturaDias", round(m.coverageDays(), 1));
                    item.put("classeAbc", m.abcClass());
                    item.put("classeXyz", m.xyzClass());
                    item.put("margemPercent", round(m.grossMarginPercent(), 1));
                    item.put("gmroi", round(m.gmroi(), 2));
                    item.put("veredito", m.capitalStatus().name());
                    item.put("quantidadeSugerida", round(m.suggestedOrderUnits(), 0));
                    item.put("ultimaVenda", m.lastSaleDate());
                    items.add(item);
                }

                Map<String, Object> out = new LinkedHashMap<>();
                out.put("janelaDias", WINDOW_DAYS);
                out.put("encontrados", items);
                return out;
            }
        };
    }

    /**
     * Arredonda para o modelo não receber casas decimais irrelevantes.
     *
     * Um "0,8333333333" no contexto gasta tokens e às vezes reaparece
     * literalmente na resposta ao lojista.
     */
    private static BigDecimal round(BigDecimal value, int scale) {
        return value == null ? null : value.setScale(scale, RoundingMode.HALF_UP);
    }
}
