package com.pdv2cloud.service.ai.chat;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Amostra do "Pergunte aos dados" para quem ainda não assinou.
 *
 * A tela do chat permanece visível no plano gratuito, com três perguntas já
 * respondidas — e respondidas com os NÚMEROS REAIS da loja de quem está olhando.
 * Ver a resposta que teria gera desejo; uma tela trancada não gera, porque o
 * lojista nem descobre o que está perdendo.
 *
 * <b>Nenhuma chamada a provedor de IA acontece aqui.</b> As respostas são
 * montadas a partir das mesmas {@link DataTool} que o chat usa, com redação
 * determinística. Três razões:
 *
 * <ol>
 *   <li>o gratuito não tem chave configurada — não haveria com que chamar;</li>
 *   <li>mesmo com chave, gastar tokens do cliente para vender a ele o plano
 *       pago seria cobrar pela própria propaganda;</li>
 *   <li>a resposta fica idêntica a cada visita, sem custo e sem espera.</li>
 * </ol>
 *
 * O que o pago acrescenta não é o número — é poder perguntar QUALQUER coisa, com
 * a redação e o encadeamento que só o modelo dá.
 */
@Service
@Slf4j
public class ChatDemoService {

    private final CapitalTools capitalTools;
    private final SalesTools salesTools;

    public ChatDemoService(CapitalTools capitalTools, SalesTools salesTools) {
        this.capitalTools = capitalTools;
        this.salesTools = salesTools;
    }

    /**
     * Uma pergunta de exemplo já respondida.
     *
     * @param resposta texto pronto, com os números da loja
     * @param consulta qual ferramenta produziu — a mesma marcação de origem que
     *                 o chat de verdade mostra
     */
    public record DemoAnswer(String pergunta, String resposta, String consulta) { }

    /**
     * As três perguntas de demonstração, respondidas com dados do mercado.
     *
     * Escolhidas por cobrirem os três eixos que o produto resolve: comprar,
     * liberar capital e entender a venda. Uma loja sem dados suficientes recebe
     * a explicação do que falta, nunca um texto vazio.
     */
    public List<DemoAnswer> demoAnswers(UUID marketId) {
        List<DemoAnswer> out = new ArrayList<>(3);
        out.add(compras(marketId));
        out.add(capitalParado(marketId));
        out.add(vendas(marketId));
        return out;
    }

    private DemoAnswer compras(UUID marketId) {
        String pergunta = "O que eu preciso comprar essa semana?";
        try {
            Map<String, Object> data = tool(capitalTools, "listar_produtos_para_comprar")
                .execute(marketId, Map.of("limite", 3));

            List<?> produtos = asList(data.get("produtos"));
            if (produtos.isEmpty()) {
                return new DemoAnswer(pergunta,
                    "Nenhum produto está pedindo reposição agora — o estoque cobre "
                        + "a venda dos próximos dias.",
                    "listar_produtos_para_comprar");
            }

            StringBuilder sb = new StringBuilder();
            sb.append("Há ").append(produtos.size() == 1 ? "1 produto" : produtos.size() + " produtos")
                .append(" pedindo reposição");
            Object total = data.get("valorTotalDaLista");
            if (total instanceof BigDecimal v && v.signum() > 0) {
                sb.append(", somando ").append(money(v)).append(" de compra");
            }
            sb.append(". ");

            Map<?, ?> primeiro = (Map<?, ?>) produtos.get(0);
            sb.append("O mais urgente é ").append(primeiro.get("produto"))
                .append(": ").append(fmt(primeiro.get("quantidadeSugerida"))).append(" unidades");
            Object cobertura = primeiro.get("coberturaDias");
            if (cobertura != null) {
                sb.append(", com estoque para apenas ").append(fmt(cobertura)).append(" dias");
            }
            sb.append('.');

            return new DemoAnswer(pergunta, sb.toString(), "listar_produtos_para_comprar");
        } catch (Exception e) {
            return unavailable(pergunta, "listar_produtos_para_comprar");
        }
    }

    private DemoAnswer capitalParado(UUID marketId) {
        String pergunta = "Onde está meu dinheiro parado?";
        try {
            Map<String, Object> data = tool(capitalTools, "listar_capital_parado")
                .execute(marketId, Map.of("limite", 3));

            List<?> produtos = asList(data.get("produtos"));
            if (produtos.isEmpty()) {
                return new DemoAnswer(pergunta,
                    "Nenhum produto está classificado como capital parado — o estoque "
                        + "está girando.",
                    "listar_capital_parado");
            }

            StringBuilder sb = new StringBuilder();
            Object total = data.get("valorTotalParado");
            if (total instanceof BigDecimal v && v.signum() > 0) {
                sb.append(money(v)).append(" estão parados na prateleira");
            } else {
                sb.append("Há produtos parados na prateleira");
            }
            sb.append(". ");

            Map<?, ?> primeiro = (Map<?, ?>) produtos.get(0);
            sb.append("O caso mais pesado é ").append(primeiro.get("produto"));
            Object valor = primeiro.get("valorParado");
            if (valor != null) {
                sb.append(", com ").append(money(valor)).append(" imobilizados");
            }
            Object cobertura = primeiro.get("coberturaDias");
            if (cobertura != null) {
                sb.append(" e estoque para ").append(fmt(cobertura)).append(" dias de venda");
            }
            sb.append('.');

            return new DemoAnswer(pergunta, sb.toString(), "listar_capital_parado");
        } catch (Exception e) {
            return unavailable(pergunta, "listar_capital_parado");
        }
    }

    private DemoAnswer vendas(UUID marketId) {
        String pergunta = "Como foram as vendas do último mês?";
        try {
            Map<String, Object> data = tool(salesTools, "resumo_de_vendas")
                .execute(marketId, Map.of("dias", 30));

            Object faturamento = data.get("faturamento");
            if (faturamento == null) {
                return new DemoAnswer(pergunta,
                    "Ainda não há vendas registradas no período.", "resumo_de_vendas");
            }

            StringBuilder sb = new StringBuilder();
            sb.append("A loja faturou ").append(money(faturamento));
            Object cupons = data.get("cupons");
            if (cupons != null) {
                sb.append(" em ").append(fmt(cupons)).append(" compras");
            }
            Object ticket = data.get("ticketMedio");
            if (ticket != null) {
                sb.append(", com ticket médio de ").append(money(ticket));
            }
            sb.append('.');

            Object variacao = data.get("variacaoPercent");
            if (variacao instanceof BigDecimal v) {
                if (v.signum() > 0) {
                    sb.append(" Foi ").append(v.abs()).append("% acima do mês anterior.");
                } else if (v.signum() < 0) {
                    sb.append(" Foi ").append(v.abs()).append("% abaixo do mês anterior.");
                }
            }

            return new DemoAnswer(pergunta, sb.toString(), "resumo_de_vendas");
        } catch (Exception e) {
            return unavailable(pergunta, "resumo_de_vendas");
        }
    }

    /**
     * Falha na consulta vira texto honesto, nunca exceção.
     *
     * A tela é uma demonstração: quebrar aqui daria ao candidato a cliente
     * exatamente a impressão oposta da pretendida.
     */
    private DemoAnswer unavailable(String pergunta, String consulta) {
        return new DemoAnswer(pergunta,
            "Ainda não há dados suficientes para responder. Assim que o agente "
                + "enviar mais notas, esta resposta aparece com os números da sua loja.",
            consulta);
    }

    private DataTool tool(Object provider, String name) {
        List<DataTool> tools = provider instanceof CapitalTools c
            ? c.tools()
            : ((SalesTools) provider).tools();
        return tools.stream()
            .filter(t -> t.name().equals(name))
            .findFirst()
            .orElseThrow(() -> new IllegalStateException("Ferramenta ausente: " + name));
    }

    private static List<?> asList(Object value) {
        return value instanceof List<?> list ? list : List.of();
    }

    private static String money(Object value) {
        BigDecimal v = value instanceof BigDecimal b ? b : new BigDecimal(String.valueOf(value));
        return "R$ " + String.format(Locale.forLanguageTag("pt-BR"), "%,.2f", v);
    }

    private static String fmt(Object value) {
        if (value instanceof BigDecimal bd) {
            return bd.stripTrailingZeros().toPlainString();
        }
        return String.valueOf(value);
    }
}
