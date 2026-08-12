package com.pdv2cloud.controller;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Nenhuma rota pode ser mapeada por dois controllers.
 *
 * ESTE TESTE EXISTE POR CAUSA DE UMA QUEDA REAL (12/08/2026). Um controller
 * novo declarou {@code GET /intelligence/customers}, rota que já existia no
 * {@code IntelligenceCenterController}. O Spring recusa subir com mapeamento
 * ambíguo, o backend saiu com código 1, os demais containers travaram em
 * "Created" esperando por ele e <b>o site ficou fora do ar</b>.
 *
 * O que falhou na prevenção: {@code mvn compile} não vê conflito de rota — é
 * erro de tempo de execução — e os testes unitários usam mocks, sem carregar o
 * contexto do Spring. O defeito só apareceu em produção.
 *
 * A verificação é feita por leitura do código-fonte em vez de subir o contexto
 * porque um teste de contexto exigiria banco, e o projeto não tem infraestrutura
 * de teste de integração. Ler as anotações cobre exatamente o caso que derrubou
 * o site, sem essa dependência.
 */
class NoAmbiguousMappingTest {

    private static final Path CONTROLLERS =
        Paths.get("src/main/java/com/pdv2cloud/controller");

    /** Prefixo declarado na classe. */
    private static final Pattern CLASS_MAPPING =
        Pattern.compile("@RequestMapping\\(\"([^\"]+)\"\\)");

    /** Rota de método, com o verbo. Cobre a forma com e sem path. */
    private static final Pattern METHOD_MAPPING = Pattern.compile(
        "@(Get|Post|Put|Delete|Patch)Mapping(?:\\(\\s*(?:value\\s*=\\s*)?\"([^\"]*)\")?");

    @Test
    void nenhumaRotaEDeclaradaDuasVezes() throws IOException {
        Map<String, List<String>> byRoute = new LinkedHashMap<>();

        try (Stream<Path> files = Files.list(CONTROLLERS)) {
            for (Path file : files.filter(f -> f.toString().endsWith(".java")).toList()) {
                String source = Files.readString(file, StandardCharsets.UTF_8);
                String controller = file.getFileName().toString();

                Matcher classMatcher = CLASS_MAPPING.matcher(source);
                String prefix = classMatcher.find() ? classMatcher.group(1) : "";

                Matcher methodMatcher = METHOD_MAPPING.matcher(source);
                while (methodMatcher.find()) {
                    String verb = methodMatcher.group(1).toUpperCase();
                    String path = methodMatcher.group(2) == null ? "" : methodMatcher.group(2);

                    // Normaliza o nome da variável de path: {id} e {marketId}
                    // colidem entre si no Spring, que casa por posição.
                    String route = verb + " " + normalize(prefix + path);
                    byRoute.computeIfAbsent(route, k -> new ArrayList<>()).add(controller);
                }
            }
        }

        List<String> conflicts = new ArrayList<>();
        byRoute.forEach((route, controllers) -> {
            if (controllers.stream().distinct().count() > 1) {
                conflicts.add(route + " → " + String.join(", ", controllers.stream()
                    .distinct().toList()));
            }
        });

        assertTrue(conflicts.isEmpty(),
            "Rotas mapeadas por mais de um controller — o Spring não sobe assim:\n  "
                + String.join("\n  ", conflicts));
    }

    /**
     * {@code {marketId}} e {@code {id}} são a mesma posição para o Spring.
     * Comparar o texto literal deixaria passar o conflito.
     */
    private String normalize(String path) {
        String normalized = path.replaceAll("\\{[^}]+\\}", "{}");
        return normalized.endsWith("/") && normalized.length() > 1
            ? normalized.substring(0, normalized.length() - 1)
            : normalized;
    }
}
