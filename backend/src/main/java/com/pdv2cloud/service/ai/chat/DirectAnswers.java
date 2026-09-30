package com.pdv2cloud.service.ai.chat;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/**
 * Respostas prontas para perguntas de número direto ("quanto vendi na
 * semana?"): a consulta roda de verdade e o texto é montado aqui, sem modelo de
 * linguagem. É a camada "texto pronto" da proposta (seção 5.3).
 *
 * Números da pergunta (período, quantidade) são lidos por código, nunca pelo
 * Jev, que erra em extrair valores de texto.
 */
@Component
public class DirectAnswers {

    /** Consultas que têm resposta pronta. {@code consultar_produto} fica fora: precisa do nome do produto. */
    public static final Set<String> SUPPORTED = Set.of(
        "resumo_de_vendas", "produtos_mais_vendidos", "vendas_por_dia_da_semana", "horario_de_movimento",
        "listar_produtos_para_comprar", "listar_capital_parado", "resumo_do_estoque",
        "listar_oportunidades", "listar_recomendacoes");

    private static final Locale BR = Locale.forLanguageTag("pt-BR");
    private static final Pattern DAYS = Pattern.compile("(\\d{1,3})\\s*dias?");
    private static final Pattern LIMIT = Pattern.compile("(?:top|os|as)\\s*(\\d{1,2})\\s*(?:produtos|itens|mais|menos)?");

    /** Argumentos da consulta tirados da pergunta (período, quantidade, ordem). */
    public Map<String, Object> argsFrom(String tool, String question) {
        String q = question == null ? "" : question.toLowerCase(BR);
        Map<String, Object> args = new LinkedHashMap<>();
        Integer days = null;
        Matcher m = DAYS.matcher(q);
        if (m.find()) {
            days = Integer.parseInt(m.group(1));
        } else if (q.contains("hoje") || q.contains("ontem")) {
            days = 1;
        } else if (q.contains("semana")) {
            days = 7;
        } else if (q.contains("quinzena")) {
            days = 15;
        } else if (q.contains("mês") || q.contains("mes ") || q.endsWith("mes") || q.contains("mensal")) {
            days = 30;
        } else if (q.contains("trimestre")) {
            days = 90;
        } else if (q.contains("ano")) {
            days = 365;
        }
        if (days != null && Set.of("resumo_de_vendas", "produtos_mais_vendidos", "vendas_por_dia_da_semana").contains(tool)) {
            args.put("dias", Math.max(1, Math.min(days, 365)));
        }
        Matcher l = LIMIT.matcher(q);
        if (l.find()) {
            args.put("limite", Math.max(1, Math.min(Integer.parseInt(l.group(1)), 30)));
        }
        if ("produtos_mais_vendidos".equals(tool)
            && (q.contains("menos vend") || q.contains("pior") || q.contains("encalh") || q.contains("não vend") || q.contains("nao vend"))) {
            args.put("ordem", "menores");
        }
        return args;
    }

    /** Texto pronto a partir do resultado da consulta; vazio quando não há modelo para ela. */
    @SuppressWarnings("unchecked")
    public Optional<String> render(String tool, Map<String, Object> r) {
        if (r == null) {
            return Optional.empty();
        }
        if (r.get("resultado") instanceof String s) {
            return Optional.of(s);
        }
        if (r.get("erro") != null) {
            return Optional.empty();
        }
        StringBuilder sb = new StringBuilder();
        switch (tool) {
            case "resumo_de_vendas" -> {
                int days = intOf(r.get("periodoDias"));
                sb.append(days <= 1 ? "No último dia" : "Nos últimos " + days + " dias")
                    .append(" você faturou ").append(money(r.get("faturamento")))
                    .append(" em ").append(integer(r.get("cupons"))).append(" cupons");
                if (r.get("ticketMedio") != null) {
                    sb.append(", ticket médio de ").append(money(r.get("ticketMedio")));
                }
                sb.append('.');
                if (r.get("variacaoPercent") != null) {
                    double v = number(r.get("variacaoPercent"));
                    sb.append(" Está ")
                        .append(percent(Math.abs(v))).append(v >= 0 ? " acima" : " abaixo")
                        .append(" do período anterior (").append(money(r.get("faturamentoPeriodoAnterior"))).append(").");
                }
            }
            case "produtos_mais_vendidos" -> {
                List<Map<String, Object>> items = (List<Map<String, Object>>) r.getOrDefault("produtos", List.of());
                boolean worst = "menores".equals(r.get("ordem"));
                sb.append(worst ? "Os produtos que menos venderam" : "Os produtos que mais venderam")
                    .append(" nos últimos ").append(intOf(r.get("periodoDias"))).append(" dias:");
                int i = 1;
                for (Map<String, Object> it : items) {
                    sb.append('\n').append(i++).append(". ").append(it.get("produto")).append(": ")
                        .append(money(it.get("receita"))).append(" (").append(integer(it.get("quantidade"))).append(" un.)");
                }
            }
            case "vendas_por_dia_da_semana" -> {
                List<Map<String, Object>> items = new ArrayList<>((List<Map<String, Object>>) r.getOrDefault("porDiaDaSemana", List.of()));
                if (items.isEmpty()) {
                    return Optional.empty();
                }
                items.sort((a, b) -> Double.compare(number(b.get("faturamentoMedio")), number(a.get("faturamentoMedio"))));
                Map<String, Object> best = items.get(0);
                Map<String, Object> worst = items.get(items.size() - 1);
                sb.append("Nos últimos ").append(intOf(r.get("periodoDias"))).append(" dias, o dia mais forte é ")
                    .append(best.get("dia")).append(" (média de ").append(money(best.get("faturamentoMedio")))
                    .append(") e o mais fraco é ").append(worst.get("dia")).append(" (").append(money(worst.get("faturamentoMedio"))).append(").");
            }
            case "horario_de_movimento" -> {
                if (r.get("resumo") == null) {
                    return Optional.empty();
                }
                sb.append(r.get("resumo"));
            }
            case "listar_produtos_para_comprar" -> {
                List<Map<String, Object>> items = (List<Map<String, Object>>) r.getOrDefault("produtos", List.of());
                sb.append("Para repor agora: ").append(items.size()).append(items.size() == 1 ? " produto" : " produtos")
                    .append(", somando ").append(money(r.get("valorTotalDaLista"))).append('.');
                int i = 1;
                for (Map<String, Object> it : items) {
                    sb.append('\n').append(i++).append(". ").append(it.get("produto")).append(": comprar ")
                        .append(integer(it.get("quantidadeSugerida"))).append(" un. (dura ").append(decimal(it.get("coberturaDias"))).append(" dias hoje)");
                }
            }
            case "listar_capital_parado" -> {
                List<Map<String, Object>> items = (List<Map<String, Object>>) r.getOrDefault("produtos", List.of());
                sb.append("Você tem ").append(money(r.get("valorTotalParado"))).append(" de dinheiro parado na prateleira. Os maiores:");
                int i = 1;
                for (Map<String, Object> it : items) {
                    sb.append('\n').append(i++).append(". ").append(it.get("produto")).append(": ").append(money(it.get("valorParado")))
                        .append(" (vende ").append(decimal(it.get("vendaPorDia"))).append(" por dia)");
                }
            }
            case "resumo_do_estoque" -> {
                sb.append("Seu estoque vale ").append(money(r.get("valorDoEstoque"))).append(" em ")
                    .append(integer(r.get("totalDeProdutos"))).append(" produtos; ").append(money(r.get("valorParado")))
                    .append(" estão parados");
                if (r.get("percentualParado") != null) {
                    sb.append(" (").append(percent(number(r.get("percentualParado")))).append(')');
                }
                sb.append('.');
                if (r.get("observacao") != null) {
                    sb.append(' ').append(r.get("observacao"));
                }
            }
            case "listar_oportunidades" -> {
                List<Map<String, Object>> items = (List<Map<String, Object>>) r.getOrDefault("oportunidades", List.of());
                sb.append("Há ").append(integer(r.get("totalAbertas"))).append(" oportunidades abertas. As principais:");
                int i = 1;
                for (Map<String, Object> it : items) {
                    sb.append('\n').append(i++).append(". ").append(it.get("resumo"));
                    if (it.get("impactoEstimado") != null) {
                        sb.append(" (").append(money(it.get("impactoEstimado"))).append(')');
                    }
                }
            }
            case "listar_recomendacoes" -> {
                List<Map<String, Object>> items = (List<Map<String, Object>>) r.getOrDefault("recomendacoes", List.of());
                sb.append(integer(r.get("totalPendentes"))).append(" recomendações esperando sua decisão");
                if (r.get("somaDoRetornoEsperado") != null) {
                    sb.append(", com retorno esperado de ").append(money(r.get("somaDoRetornoEsperado")));
                }
                sb.append(':');
                int i = 1;
                for (Map<String, Object> it : items) {
                    sb.append('\n').append(i++).append(". ").append(it.get("resumo"));
                }
                sb.append("\nVocê decide cada uma na Central de Inteligência.");
            }
            default -> {
                return Optional.empty();
            }
        }
        return Optional.of(sb.toString());
    }

    // ── Formatação ─────────────────────────────────────────────────────────

    static String money(Object v) {
        return NumberFormat.getCurrencyInstance(BR).format(number(v)).replace(' ', ' ');
    }

    static String integer(Object v) {
        return NumberFormat.getIntegerInstance(BR).format(Math.round(number(v)));
    }

    static String decimal(Object v) {
        NumberFormat f = NumberFormat.getNumberInstance(BR);
        f.setMaximumFractionDigits(1);
        return f.format(number(v));
    }

    static String percent(double v) {
        NumberFormat f = NumberFormat.getNumberInstance(BR);
        f.setMaximumFractionDigits(1);
        return f.format(v) + "%";
    }

    static double number(Object v) {
        if (v instanceof Number n) {
            return n.doubleValue();
        }
        if (v == null) {
            return 0;
        }
        try {
            return new BigDecimal(String.valueOf(v)).doubleValue();
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static int intOf(Object v) {
        return (int) Math.round(number(v));
    }
}
