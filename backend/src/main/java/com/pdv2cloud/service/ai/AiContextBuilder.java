package com.pdv2cloud.service.ai;

import com.pdv2cloud.model.entity.Opportunity;
import com.pdv2cloud.model.entity.Recommendation;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.stereotype.Component;

/**
 * Monta o texto que vai ao modelo — e, mais importante, decide o que NÃO vai.
 *
 * Esta classe é o ponto único por onde dados da loja saem para um provedor
 * externo. A regra da auditoria (§27) e do plano (§14) é minimização: o modelo
 * recebe métricas agregadas já calculadas, nunca dado bruto. Por isso a
 * filtragem é por **allowlist** e não por blocklist: um detector novo que
 * coloque CPF, chave de NFe ou CNPJ dentro de {@code evidence} simplesmente não
 * atravessa daqui — o campo desconhecido é descartado, e ninguém precisa se
 * lembrar de proibi-lo.
 *
 * O nome do produto atravessa de propósito: sem ele a interpretação seria
 * inútil ("o produto X está parado" não ajuda ninguém). Nome de produto é dado
 * de catálogo, não dado pessoal.
 */
@Component
public class AiContextBuilder {

    /**
     * Campos de {@code evidence} que podem ser enviados ao modelo.
     *
     * Todos são métricas derivadas, jamais identificadores. Ao adicionar um
     * detector, o campo novo precisa ser incluído aqui conscientemente — o
     * silêncio é seguro por construção.
     */
    private static final Set<String> ALLOWED_EVIDENCE_FIELDS = Set.of(
        // capital / compra
        "classeAbc", "classeXyz", "giroDiario", "coberturaDias", "gmroi",
        "riscoEstagnacao", "valorEstoque", "confiancaEstoque", "pontoReposicao",
        "quantidadeSugerida", "valorSugerido", "diasSemVenda", "leadTimeDias",
        "estoqueEmTransito", "origemDemanda",
        // promoção
        "objetivo", "precoAtual", "descontoSugerido", "margemPercent",
        "capitalEmRisco", "produtosAfetados", "puxaVendaDe", "elasticidade",
        "scoreEfetividade", "classificacao",
        // sinais de venda
        "data", "receitaRealizada", "receitaEsperada", "desvioPercent", "zScore",
        "transacoes", "tendenciaPercent", "momentum",
        // preço vs mercado
        "precoPraticado", "medianaMercado", "menorPrecoObservado", "acimaPercent",
        "observacoes", "ultimaObservacao", "receitaEmRisco"
    );

    /** Contexto pronto para o modelo, com o hash que identifica o cache. */
    public record AiContext(String prompt, String hash) { }

    /**
     * Contexto de uma oportunidade e das recomendações que ela gerou.
     *
     * O hash cobre exatamente o que foi enviado. Se um número mudar, o hash
     * muda e a interpretação é refeita; se nada mudou, o cache responde e o
     * cliente não paga o token de novo.
     */
    public AiContext forOpportunity(Opportunity opportunity, List<Recommendation> recommendations) {
        StringBuilder sb = new StringBuilder();

        sb.append("SITUAÇÃO DETECTADA NA LOJA\n");
        sb.append("Tipo: ").append(opportunity.getType()).append('\n');
        sb.append("Resumo: ").append(opportunity.getTitle()).append('\n');

        if (opportunity.getProduct() != null && opportunity.getProduct().getName() != null) {
            sb.append("Produto: ").append(opportunity.getProduct().getName()).append('\n');
        }
        if (opportunity.getCategory() != null) {
            sb.append("Categoria: ").append(opportunity.getCategory()).append('\n');
        }
        if (opportunity.getDescription() != null && !opportunity.getDescription().isBlank()) {
            sb.append("Leitura do sistema: ").append(opportunity.getDescription()).append('\n');
        }

        appendMoney(sb, "Impacto estimado", opportunity.getExpectedImpactValue());
        appendPercent(sb, "Confiança do cálculo", opportunity.getConfidence());

        // Persistência importa para o tom da interpretação: algo que reaparece
        // há semanas merece urgência diferente do que apareceu ontem.
        if (opportunity.getDetectionCount() != null && opportunity.getDetectionCount() > 1) {
            sb.append("Situação já detectada ")
                .append(opportunity.getDetectionCount())
                .append(" vezes (persiste desde ")
                .append(opportunity.getFirstDetectedAt().toLocalDate())
                .append(")\n");
        }

        Map<String, Object> evidence = filterEvidence(opportunity.getEvidence());
        if (!evidence.isEmpty()) {
            sb.append("\nNÚMEROS QUE SUSTENTAM\n");
            evidence.forEach((k, v) -> sb.append("- ").append(humanize(k))
                .append(": ").append(format(v)).append('\n'));
        }

        if (recommendations != null && !recommendations.isEmpty()) {
            sb.append("\nAÇÃO QUE O SISTEMA CALCULOU\n");
            for (Recommendation r : recommendations) {
                sb.append("- ").append(r.getActionType()).append(": ")
                    .append(r.getTitle()).append('\n');
                if (r.getCalculationTrace() != null && !r.getCalculationTrace().isBlank()) {
                    sb.append("  Como foi calculado: ")
                        .append(r.getCalculationTrace()).append('\n');
                }
                appendMoney(sb, "  Retorno esperado", r.getExpectedImpactValue());
            }
        }

        String prompt = sb.toString();
        return new AiContext(prompt, sha256(prompt));
    }

    /**
     * Aplica a allowlist e ordena as chaves.
     *
     * A ordenação não é estética: sem ela, a mesma evidência produziria hashes
     * diferentes conforme a ordem de iteração do mapa, e o cache nunca acertaria.
     *
     * Público porque o "Pergunte aos dados" também expõe evidência de
     * oportunidade ao modelo, por outro caminho. Toda saída de dado da loja
     * para um provedor externo deve passar por AQUI — um segundo filtro,
     * escrito à parte, divergiria do primeiro na primeira mudança.
     */
    public Map<String, Object> filterEvidence(Map<String, Object> evidence) {
        Map<String, Object> filtered = new TreeMap<>();
        if (evidence == null) {
            return filtered;
        }
        evidence.forEach((k, v) -> {
            if (k != null && v != null && ALLOWED_EVIDENCE_FIELDS.contains(k)) {
                filtered.put(k, v);
            }
        });
        return new LinkedHashMap<>(filtered);
    }

    private void appendMoney(StringBuilder sb, String label, BigDecimal value) {
        if (value != null && value.signum() != 0) {
            sb.append(label).append(": R$ ")
                .append(String.format(Locale.forLanguageTag("pt-BR"), "%,.2f", value))
                .append('\n');
        }
    }

    private void appendPercent(StringBuilder sb, String label, BigDecimal fraction) {
        if (fraction != null) {
            sb.append(label).append(": ")
                .append(fraction.multiply(BigDecimal.valueOf(100))
                    .setScale(0, java.math.RoundingMode.HALF_UP))
                .append("%\n");
        }
    }

    /** camelCase → "camel case", para o modelo ler rótulo e não identificador. */
    private String humanize(String key) {
        return key.replaceAll("([a-z])([A-Z])", "$1 $2").toLowerCase(Locale.ROOT);
    }

    private String format(Object value) {
        if (value instanceof BigDecimal bd) {
            return bd.stripTrailingZeros().toPlainString();
        }
        return String.valueOf(value);
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
