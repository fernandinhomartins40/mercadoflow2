package com.pdv2cloud.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.dto.SuperAdminCrawlerCategoryOptionDTO;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.text.Normalizer;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class CatalogCrawlerCategoryService {

    private static final Duration CACHE_TTL = Duration.ofMinutes(30);
    private static final Pattern KOCH_CATEGORY_PATTERN = Pattern.compile(
        "href=\"(/categorias/[^\"]+)\"[^>]*>\\s*<div class=\"category-name\">(.*?)</div>",
        Pattern.CASE_INSENSITIVE | Pattern.DOTALL
    );

    private final HttpClient httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(20))
        .followRedirects(HttpClient.Redirect.NORMAL)
        .build();

    private final Map<String, CachedCategories> cache = new ConcurrentHashMap<>();

    @Autowired
    private ObjectMapper objectMapper;

    public List<SuperAdminCrawlerCategoryOptionDTO> listCategories(String provider) {
        String normalizedProvider = normalizeKey(provider);
        if (normalizedProvider.isBlank()) {
            return List.of();
        }
        CachedCategories cached = cache.get(normalizedProvider);
        if (cached != null && !cached.isExpired()) {
            return cached.categories();
        }
        List<SuperAdminCrawlerCategoryOptionDTO> categories = fetchCategories(normalizedProvider);
        cache.put(normalizedProvider, new CachedCategories(categories, Instant.now().plus(CACHE_TTL)));
        return categories;
    }

    private List<SuperAdminCrawlerCategoryOptionDTO> fetchCategories(String provider) {
        return switch (provider) {
            case "PAODEACUCAR_WEB_BR" -> fetchGpaCategories(
                "https://api.vendas.gpa.digital/pa/v4/products/categories/ecom?storeId=461",
                Set.of()
            );
            case "EXTRA_WEB_BR" -> fetchGpaCategories(
                "https://api.vendas.gpa.digital/ex/v4/products/categories/ecom?storeId=483",
                Set.of()
            );
            case "CARREFOUR_WEB_BR" -> fetchVtexCategories(
                "https://carrefourbrfood.vtexcommercestable.com.br/api/catalog_system/pub/category/tree/20",
                Set.of()
            );
            case "ATACADAO_WEB_BR" -> fetchVtexCategories(
                "https://www.atacadao.com.br/api/catalog_system/pub/category/tree/20",
                Set.of()
            );
            case "SUPERMUFFATO_WEB_BR" -> fetchVtexCategories(
                "https://www.supermuffato.com.br/api/catalog_system/pub/category/tree/20",
                Set.of()
            );
            case "AMIGAO_WEB_BR" -> fetchVtexCategories(
                "https://amigao.vtexcommercestable.com.br/api/catalog_system/pub/category/tree/20",
                Set.of()
            );
            case "DROGARIASP_WEB_BR" -> fetchVtexCategories(
                "https://www.drogariasaopaulo.com.br/api/catalog_system/pub/category/tree/20",
                Set.of()
            );
            case "SUPERKOCH_WEB_BR" -> fetchKochCategories("https://www.superkoch.com.br/categorias/");
            default -> List.of();
        };
    }

    private List<SuperAdminCrawlerCategoryOptionDTO> fetchGpaCategories(String url, Set<String> allowedRoots) {
        JsonNode root = fetchJson(url);
        JsonNode content = root.path("content");
        if (!content.isArray()) {
            return List.of();
        }
        Set<String> allowed = normalizeSet(allowedRoots);
        List<SuperAdminCrawlerCategoryOptionDTO> result = new ArrayList<>();
        for (JsonNode node : content) {
            String rootName = clean(node.path("name").asText());
            if (rootName.isBlank()) {
                continue;
            }
            if (!allowed.isEmpty() && !allowed.contains(normalizeKey(rootName))) {
                continue;
            }
            appendGpaNode(node, new ArrayList<>(), result);
        }
        return dedupeByValue(result);
    }

    private void appendGpaNode(
        JsonNode node,
        List<String> parentTrail,
        List<SuperAdminCrawlerCategoryOptionDTO> result
    ) {
        String name = clean(node.path("name").asText());
        if (name.isBlank()) {
            return;
        }
        List<String> trail = new ArrayList<>(parentTrail);
        trail.add(name);
        JsonNode children = node.path("subCategories");
        result.add(new SuperAdminCrawlerCategoryOptionDTO(String.join(" > ", trail), String.join(" > ", trail), children.isArray() ? children.size() : 0));
        if (!children.isArray()) {
            return;
        }
        for (JsonNode child : children) {
            appendGpaNode(child, trail, result);
        }
    }

    private List<SuperAdminCrawlerCategoryOptionDTO> fetchVtexCategories(String url, Set<String> preferredRoots) {
        JsonNode root = fetchJson(url);
        if (!root.isArray()) {
            return List.of();
        }
        Set<String> preferred = normalizeSet(preferredRoots);
        List<SuperAdminCrawlerCategoryOptionDTO> result = new ArrayList<>();
        for (JsonNode node : root) {
            String rootName = clean(node.path("name").asText());
            if (rootName.isBlank()) {
                continue;
            }
            if (!preferred.isEmpty() && !preferred.contains(normalizeKey(rootName))) {
                continue;
            }
            appendVtexNode(node, new ArrayList<>(), result);
        }
        return dedupeByValue(result);
    }

    private void appendVtexNode(
        JsonNode node,
        List<String> parentTrail,
        List<SuperAdminCrawlerCategoryOptionDTO> result
    ) {
        String name = clean(node.path("name").asText());
        if (name.isBlank()) {
            return;
        }
        List<String> trail = new ArrayList<>(parentTrail);
        trail.add(name);
        JsonNode children = node.path("children");
        result.add(new SuperAdminCrawlerCategoryOptionDTO(String.join(" > ", trail), String.join(" > ", trail), children.isArray() ? children.size() : 0));
        if (!children.isArray()) {
            return;
        }
        for (JsonNode child : children) {
            appendVtexNode(child, trail, result);
        }
    }

    private List<SuperAdminCrawlerCategoryOptionDTO> fetchKochCategories(String url) {
        String html = fetchText(url, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
        Matcher matcher = KOCH_CATEGORY_PATTERN.matcher(html);
        List<SuperAdminCrawlerCategoryOptionDTO> result = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        while (matcher.find()) {
            String label = decodeHtml(clean(matcher.group(2))).replaceAll("\\s+", " ").trim();
            String normalized = normalizeKey(label);
            if (label.isBlank() || normalized.isBlank() || !seen.add(normalized)) {
                continue;
            }
            result.add(new SuperAdminCrawlerCategoryOptionDTO(label, label, 0));
        }
        return result;
    }

    private JsonNode fetchJson(String url) {
        try {
            HttpResponse<String> response = httpClient.send(
                buildRequest(url, "application/json, text/plain, */*"),
                HttpResponse.BodyHandlers.ofString()
            );
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalArgumentException("Falha ao buscar categorias do provider: HTTP " + response.statusCode());
            }
            return objectMapper.readTree(response.body());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalArgumentException("Falha ao buscar categorias do provider");
        } catch (IOException ex) {
            throw new IllegalArgumentException("Falha ao buscar categorias do provider");
        }
    }

    private String fetchText(String url, String accept) {
        try {
            HttpResponse<String> response = httpClient.send(
                buildRequest(url, accept),
                HttpResponse.BodyHandlers.ofString()
            );
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalArgumentException("Falha ao buscar categorias do provider: HTTP " + response.statusCode());
            }
            return response.body();
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalArgumentException("Falha ao buscar categorias do provider");
        } catch (IOException ex) {
            throw new IllegalArgumentException("Falha ao buscar categorias do provider");
        }
    }

    private HttpRequest buildRequest(String url, String accept) {
        return HttpRequest.newBuilder(URI.create(url))
            .GET()
            .timeout(Duration.ofSeconds(45))
            .header("User-Agent", "Mozilla/5.0 (compatible; MercadoFlowBackend/1.0)")
            .header("Accept", accept)
            .build();
    }

    private Set<String> normalizeSet(Set<String> values) {
        Set<String> normalized = new LinkedHashSet<>();
        for (String value : values) {
            String normalizedValue = normalizeKey(value);
            if (!normalizedValue.isBlank()) {
                normalized.add(normalizedValue);
            }
        }
        return normalized;
    }

    private List<SuperAdminCrawlerCategoryOptionDTO> dedupeByValue(List<SuperAdminCrawlerCategoryOptionDTO> items) {
        Map<String, SuperAdminCrawlerCategoryOptionDTO> unique = new LinkedHashMap<>();
        for (SuperAdminCrawlerCategoryOptionDTO item : items) {
            String key = normalizeKey(item.getValue());
            if (!key.isBlank()) {
                unique.putIfAbsent(key, item);
            }
        }
        return new ArrayList<>(unique.values());
    }

    private String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private String decodeHtml(String value) {
        return value
            .replace("&amp;", "&")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&apos;", "'")
            .replace("&nbsp;", " ");
    }

    private String normalizeKey(String value) {
        String cleaned = decodeHtml(clean(value)).toLowerCase(Locale.ROOT);
        if (cleaned.isBlank()) {
            return "";
        }
        return Normalizer.normalize(cleaned, Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "")
            .replaceAll("[^a-z0-9]+", " ")
            .trim();
    }

    private record CachedCategories(List<SuperAdminCrawlerCategoryOptionDTO> categories, Instant expiresAt) {
        boolean isExpired() {
            return Instant.now().isAfter(expiresAt);
        }
    }
}
