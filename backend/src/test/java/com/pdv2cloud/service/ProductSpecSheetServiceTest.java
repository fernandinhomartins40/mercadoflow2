package com.pdv2cloud.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.pdv2cloud.model.dto.ProductSpecAttributeDTO;
import com.pdv2cloud.model.dto.ProductSpecSheetDTO;
import com.pdv2cloud.model.entity.ProductEnrichment;
import com.pdv2cloud.repository.ProductEnrichmentRepository;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * Cobre os tres formatos de attributesJson que os coletores realmente gravam:
 * customFields (VTEX), attributeGroups (GPA) e a descricao com blocos rotulados
 * (Super Nosso). Os payloads sao recortes de registros reais de producao.
 */
@ExtendWith(MockitoExtension.class)
class ProductSpecSheetServiceTest {

    @Mock
    private ProductEnrichmentRepository repository;

    private ProductSpecSheetService service;
    private final UUID productId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new ProductSpecSheetService(repository);
    }

    private void givenEnrichment(String attributesJson, String description) {
        ProductEnrichment enrichment = new ProductEnrichment();
        enrichment.setAttributesJson(attributesJson);
        enrichment.setDescription(description);
        enrichment.setProvider("TESTE_WEB_BR");
        when(repository.findTopByProduct_IdOrderByFetchedAtDesc(any())).thenReturn(Optional.of(enrichment));
    }

    @Test
    void extraiTabelaNutricionalDoFormatoVtex() {
        givenEnrichment(
            "{\"customFields\":{\"Tipo\":[\"Mingau\"],\"Tamanho\":[\"230g\"],"
                + "\"Tabela Nutricional\":[\"<table><tr><td>Carboidratos</td><td>21g</td></tr></table>\"]}}",
            null
        );

        ProductSpecSheetDTO sheet = service.buildForProduct(productId);

        assertTrue(sheet.isHasContent());
        assertNotNull(sheet.getNutritionTableHtml());
        assertTrue(sheet.getNutritionTableHtml().contains("Carboidratos"));
        // a tabela sai da lista de atributos para nao duplicar na tela
        assertTrue(sheet.getAttributes().stream().noneMatch(a -> a.getLabel().contains("Tabela Nutricional")));
        assertTrue(sheet.getAttributes().stream().anyMatch(a -> "Tamanho".equals(a.getLabel())));
    }

    @Test
    void achataAtributoDeListaComUmValor() {
        givenEnrichment("{\"customFields\":{\"Tamanho\":[\"230g\"]}}", null);

        ProductSpecSheetDTO sheet = service.buildForProduct(productId);

        ProductSpecAttributeDTO tamanho = sheet.getAttributes().stream()
            .filter(a -> "Tamanho".equals(a.getLabel()))
            .findFirst()
            .orElseThrow();
        assertEquals("230g", tamanho.getValue());
        assertEquals("MEDIDAS", tamanho.getGroup());
    }

    @Test
    void leAtributosDoFormatoGpaComGrupos() {
        givenEnrichment(
            "{\"attributeGroups\":[{\"label\":\"Caracteristica Geral\",\"attributes\":["
                + "{\"label\":\"Composicao\",\"value\":\"Celulose, poliacrilato de sodio\"},"
                + "{\"label\":\"Peso Liquido\",\"value\":\"1.5\"},"
                + "{\"label\":\"Informacoes de Conservacao\",\"value\":\"Manter em local seco\"}]}]}",
            null
        );

        ProductSpecSheetDTO sheet = service.buildForProduct(productId);

        assertEquals("COMPOSICAO", groupOf(sheet, "Composicao"));
        assertEquals("MEDIDAS", groupOf(sheet, "Peso Liquido"));
        assertEquals("CONSERVACAO", groupOf(sheet, "Informacoes de Conservacao"));
    }

    @Test
    void extraiIngredientesDaDescricaoQuandoNaoHaAtributo() {
        givenEnrichment(
            "{}",
            "armazenagem (local): temperatura ambiente ingredientes: leite in natura e estabilizante "
                + "citrato de sodio. advertencia: este produto nao deve ser usado para alimentar criancas."
        );

        ProductSpecSheetDTO sheet = service.buildForProduct(productId);

        assertNotNull(sheet.getIngredients());
        assertTrue(sheet.getIngredients().contains("leite in natura"));
        // o bloco seguinte nao pode vazar para dentro dos ingredientes
        assertFalse(sheet.getIngredients().toLowerCase().contains("advertencia"));
    }

    @Test
    void convertehtmlDaDescricaoEmTextoLegivel() {
        givenEnrichment("{}", "<p>Primeira linha</p><p>Segunda&nbsp;linha</p>");

        ProductSpecSheetDTO sheet = service.buildForProduct(productId);

        assertNotNull(sheet.getDescription());
        assertFalse(sheet.getDescription().contains("<p>"));
        assertFalse(sheet.getDescription().contains("&nbsp;"));
        assertTrue(sheet.getDescription().contains("Primeira linha"));
        assertTrue(sheet.getDescription().contains("Segunda linha"));
    }

    @Test
    void ignoraChavesTecnicasDoColetor() {
        givenEnrichment(
            "{\"customFields\":{\"Sabor\":[\"Morango\"]},\"schemaVersion\":\"2026-03-08\",\"categoryId\":10}",
            null
        );

        ProductSpecSheetDTO sheet = service.buildForProduct(productId);

        assertTrue(sheet.getAttributes().stream().anyMatch(a -> "Sabor".equals(a.getLabel())));
        assertTrue(sheet.getAttributes().stream().noneMatch(a -> "schemaVersion".equals(a.getLabel())));
        assertTrue(sheet.getAttributes().stream().noneMatch(a -> "categoryId".equals(a.getLabel())));
    }

    @Test
    void naoQuebraComAttributesJsonInvalido() {
        givenEnrichment("{isso nao e json valido", "Descricao simples");

        ProductSpecSheetDTO sheet = service.buildForProduct(productId);

        assertTrue(sheet.getAttributes().isEmpty());
        assertEquals("Descricao simples", sheet.getDescription());
        assertTrue(sheet.isHasContent());
    }

    @Test
    void marcaSemConteudoQuandoNaoHaNadaUtil() {
        givenEnrichment("{\"schemaVersion\":\"x\"}", null);

        ProductSpecSheetDTO sheet = service.buildForProduct(productId);

        assertFalse(sheet.isHasContent());
        assertTrue(sheet.getAttributes().isEmpty());
    }

    @Test
    void devolveFichaVaziaQuandoProdutoNaoTemEnriquecimento() {
        when(repository.findTopByProduct_IdOrderByFetchedAtDesc(any())).thenReturn(Optional.empty());

        ProductSpecSheetDTO sheet = service.buildForProduct(productId);

        assertFalse(sheet.isHasContent());
        assertNull(sheet.getDescription());
        assertTrue(sheet.getAttributes().isEmpty());
    }

    private String groupOf(ProductSpecSheetDTO sheet, String label) {
        return sheet.getAttributes().stream()
            .filter(a -> label.equals(a.getLabel()))
            .map(ProductSpecAttributeDTO::getGroup)
            .findFirst()
            .orElse(null);
    }
}
