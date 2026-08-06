package com.pdv2cloud.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.dto.ProductSpecAttributeDTO;
import com.pdv2cloud.model.dto.ProductSpecSheetDTO;
import com.pdv2cloud.model.entity.ProductEnrichment;
import com.pdv2cloud.repository.ProductEnrichmentRepository;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Monta a ficha tecnica do produto a partir de product_enrichments.
 *
 * Cada plataforma grava os atributos em um formato diferente dentro de
 * attributesJson: VTEX usa customFields (mapa de listas), o GPA usa
 * attributeGroups (lista de grupos com label/value) e alguns coletores usam
 * attributesFlat. Este servico normaliza os tres em pares rotulo/valor e isola
 * tabela nutricional e ingredientes, que merecem tratamento proprio na tela.
 */
@Service
public class ProductSpecSheetService {

    private static final Logger logger = LoggerFactory.getLogger(ProductSpecSheetService.class);

    private static final ObjectMapper MAPPER = new ObjectMapper();

    /** Chaves tecnicas do coletor que nao interessam ao usuario final. */
    private static final List<String> IGNORED_LABELS = List.of(
        "schemaversion",
        "categoryid",
        "categoriesids",
        "brandid",
        "brandimageurl",
        "productid",
        "productreference",
        "productreferencecode",
        "itemid",
        "referenceid",
        "sku",
        "storeid",
        "linktext",
        "urldetails",
        "thumbpath",
        "commercialstructure",
        "imageurls",
        "sellercount",
        "offer",
        "releasedate",
        "productclusters",
        "clusterhighlights",
        "searchableclusters",
        "especificações",
        "especificacoes",
        "subcategoria_key",
        "custom_label_0"
    );

    private static final List<String> MEASURE_HINTS = List.of(
        "peso", "volume", "altura", "largura", "profundidade", "dimens",
        "conteudo", "conteúdo", "quantidade", "tamanho", "medida", "unid"
    );
    private static final List<String> COMPOSITION_HINTS = List.of(
        "composi", "ingrediente", "material", "sabor", "fragran", "fragrân",
        "principio ativo", "princípio ativo", "teor"
    );
    private static final List<String> STORAGE_HINTS = List.of(
        "conserva", "armazenagem", "armazenamento", "validade", "advert", "consumo"
    );

    private final ProductEnrichmentRepository productEnrichmentRepository;

    public ProductSpecSheetService(ProductEnrichmentRepository productEnrichmentRepository) {
        this.productEnrichmentRepository = productEnrichmentRepository;
    }

    public ProductSpecSheetDTO buildForProduct(UUID productId) {
        ProductSpecSheetDTO sheet = new ProductSpecSheetDTO();
        sheet.setAttributes(List.of());
        if (productId == null) {
            return sheet;
        }

        Optional<ProductEnrichment> found =
            productEnrichmentRepository.findTopByProduct_IdOrderByFetchedAtDesc(productId);
        if (found.isEmpty()) {
            return sheet;
        }
        ProductEnrichment enrichment = found.get();

        sheet.setDescription(cleanText(enrichment.getDescription()));
        sheet.setBrand(trimToNull(enrichment.getBrand()));
        sheet.setManufacturer(trimToNull(enrichment.getManufacturer()));
        sheet.setNcm(trimToNull(enrichment.getNcm()));
        sheet.setUnit(trimToNull(enrichment.getUnit()));
        sheet.setPackageDescription(trimToNull(enrichment.getPackageDescription()));
        sheet.setProvider(trimToNull(enrichment.getProvider()));
        sheet.setSourceLicense(trimToNull(enrichment.getSourceLicense()));

        Map<String, String> attributes = extractAttributes(enrichment.getAttributesJson());

        // Nutricional e ingredientes saem do mapa geral: a tela os renderiza
        // em blocos proprios, entao repeti-los na lista seria ruido.
        sheet.setNutritionTableHtml(takeMatching(attributes, "tabela nutricional", "nutricional"));
        String ingredients = takeMatching(attributes, "ingredientes", "ingrediente");
        if (ingredients == null) {
            ingredients = extractIngredientsFromDescription(sheet.getDescription());
        }
        sheet.setIngredients(ingredients);

        sheet.setAttributes(toAttributeList(attributes));
        sheet.setHasContent(
            isNotBlank(sheet.getDescription())
                || isNotBlank(sheet.getNutritionTableHtml())
                || isNotBlank(sheet.getIngredients())
                || !sheet.getAttributes().isEmpty()
                || isNotBlank(sheet.getPackageDescription())
                || isNotBlank(sheet.getManufacturer())
        );
        return sheet;
    }

    /** Le os tres formatos conhecidos de attributesJson em um unico mapa ordenado. */
    private Map<String, String> extractAttributes(String attributesJson) {
        Map<String, String> result = new LinkedHashMap<>();
        if (attributesJson == null || attributesJson.isBlank()) {
            return result;
        }
        JsonNode root;
        try {
            root = MAPPER.readTree(attributesJson);
        } catch (Exception ex) {
            logger.debug("attributesJson invalido ignorado: {}", ex.getMessage());
            return result;
        }
        if (root == null || !root.isObject()) {
            return result;
        }

        // GPA: attributeGroups -> [{ label, attributes: [{ label, value }] }]
        JsonNode groups = root.get("attributeGroups");
        if (groups != null && groups.isArray()) {
            for (JsonNode group : groups) {
                JsonNode groupAttributes = group.get("attributes");
                if (groupAttributes == null || !groupAttributes.isArray()) {
                    continue;
                }
                for (JsonNode attribute : groupAttributes) {
                    putAttribute(result, text(attribute.get("label")), text(attribute.get("value")));
                }
            }
        }

        // Coletores que ja achatam os atributos
        readFlatObject(root.get("attributesFlat"), result);
        // VTEX: customFields -> { "Peso": ["1kg"], ... }
        readFlatObject(root.get("customFields"), result);

        return result;
    }

    private void readFlatObject(JsonNode node, Map<String, String> target) {
        if (node == null || !node.isObject()) {
            return;
        }
        Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            putAttribute(target, entry.getKey(), text(entry.getValue()));
        }
    }

    private void putAttribute(Map<String, String> target, String label, String value) {
        String cleanLabel = trimToNull(label);
        String cleanValue = trimToNull(value);
        if (cleanLabel == null || cleanValue == null) {
            return;
        }
        if (IGNORED_LABELS.contains(cleanLabel.toLowerCase(Locale.ROOT))) {
            return;
        }
        // primeira ocorrencia vence: attributeGroups (mais descritivo) e lido antes
        target.putIfAbsent(cleanLabel, cleanValue);
    }

    /** Converte um valor JSON em texto legivel, achatando listas de um item. */
    private String text(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isArray()) {
            List<String> parts = new ArrayList<>();
            for (JsonNode item : node) {
                String value = text(item);
                if (value != null && !value.isBlank()) {
                    parts.add(value);
                }
            }
            return parts.isEmpty() ? null : String.join(", ", parts);
        }
        if (node.isObject()) {
            // objetos aninhados nao viram linha de ficha tecnica
            return null;
        }
        return node.asText(null);
    }

    /** Remove do mapa a primeira chave que casa com algum dos termos e devolve o valor. */
    private String takeMatching(Map<String, String> attributes, String... needles) {
        for (String needle : needles) {
            for (Map.Entry<String, String> entry : attributes.entrySet()) {
                if (entry.getKey().toLowerCase(Locale.ROOT).contains(needle)) {
                    String value = entry.getValue();
                    attributes.remove(entry.getKey());
                    return value;
                }
            }
        }
        return null;
    }

    /**
     * Alguns mercados (Super Nosso) publicam os ingredientes dentro da descricao,
     * em blocos "ingredientes: ...". Extrai esse trecho para exibir destacado.
     */
    private String extractIngredientsFromDescription(String description) {
        if (description == null || description.isBlank()) {
            return null;
        }
        String lowered = description.toLowerCase(Locale.ROOT);
        int start = lowered.indexOf("ingredientes:");
        if (start < 0) {
            return null;
        }
        String tail = description.substring(start + "ingredientes:".length()).trim();
        // corta no proximo rotulo do mesmo estilo ("advertencia:", "tipo:", ...)
        int cut = tail.length();
        for (String marker : List.of(
            "advert", "recomenda", "tipo:", "corante", "nome principal",
            "organico", "orgânico", "armazenagem", "conserva"
        )) {
            int index = tail.toLowerCase(Locale.ROOT).indexOf(marker);
            if (index > 0 && index < cut) {
                cut = index;
            }
        }
        String value = tail.substring(0, cut).trim();
        return value.isBlank() ? null : value;
    }

    private List<ProductSpecAttributeDTO> toAttributeList(Map<String, String> attributes) {
        List<ProductSpecAttributeDTO> list = new ArrayList<>();
        for (Map.Entry<String, String> entry : attributes.entrySet()) {
            list.add(new ProductSpecAttributeDTO(entry.getKey(), entry.getValue(), classify(entry.getKey())));
        }
        return list;
    }

    private String classify(String label) {
        String lowered = label.toLowerCase(Locale.ROOT);
        if (MEASURE_HINTS.stream().anyMatch(lowered::contains)) {
            return "MEDIDAS";
        }
        if (COMPOSITION_HINTS.stream().anyMatch(lowered::contains)) {
            return "COMPOSICAO";
        }
        if (STORAGE_HINTS.stream().anyMatch(lowered::contains)) {
            return "CONSERVACAO";
        }
        return "GERAL";
    }

    /** Descricoes vem com HTML dos sites; converte em texto corrido legivel. */
    private String cleanText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String text = value
            .replaceAll("(?i)<br\\s*/?>", "\n")
            .replaceAll("(?i)</p\\s*>", "\n")
            .replaceAll("(?i)</li\\s*>", "\n")
            .replaceAll("<[^>]+>", " ");
        text = text
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'");
        text = text.replaceAll("[ \\t]+", " ").replaceAll("\\n{3,}", "\n\n").trim();
        return text.isBlank() ? null : text;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isBlank() ? null : trimmed;
    }

    private boolean isNotBlank(String value) {
        return value != null && !value.isBlank();
    }
}
