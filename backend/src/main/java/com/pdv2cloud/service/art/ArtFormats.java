package com.pdv2cloud.service.art;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Formatos de arte. O navegador tem a mesma tabela em features/art-studio/formats.ts. */
public final class ArtFormats {

    public record Format(String key, String label, int width, int height) {
        public double ratio() {
            return width / (double) height;
        }
    }

    public static final Map<String, Format> ALL = new LinkedHashMap<>();

    static {
        for (Format f : List.of(
            new Format("story", "Story e status", 1080, 1920),
            new Format("post", "Post do feed", 1080, 1350),
            new Format("square", "Quadrado", 1080, 1080),
            new Format("a4", "Folha A4", 2480, 3508),
            new Format("tv", "TV da loja", 1920, 1080))) {
            ALL.put(f.key(), f);
        }
    }

    /** Ocasiões que a IA pode escolher e o filtro dos mercados mostra. */
    public static final List<String> OCCASIONS = List.of(
        "Ofertas da semana", "Fim de semana", "Açougue", "Hortifrúti", "Padaria", "Bebidas",
        "Limpeza e higiene", "Aniversário da loja", "Carnaval", "Páscoa", "Dia das Mães",
        "Festa Junina", "Dia dos Pais", "Dia das Crianças", "Black Friday", "Natal", "Ano Novo",
        "Volta às aulas", "Outro");

    public static final List<String> REGION_KEYS = List.of("logo", "products", "footer", "seal");

    /** Animações prontas. O navegador tem a mesma lista em features/art-studio/motion.ts. */
    public static final List<String> MOTION_PRESETS = List.of("respirar", "parallax", "entrada", "selo", "zoom", "festa");

    /** Fontes do estilo do tema. O navegador tem a mesma lista em features/art-studio/style.ts (FONTS). */
    public static final List<String> FONTS = List.of(
        "anton", "bebas", "archivo-black", "alfa-slab", "passion", "titan", "oswald", "barlow-condensed", "roboto-condensed",
        "saira-condensed", "archivo-narrow", "fjalla", "teko", "barlow", "montserrat", "poppins", "inter", "rubik",
        "league-spartan", "fredoka", "lilita", "bangers", "luckiest", "righteous");

    /** Formatos que podem sair em vídeo (A4 é só impressão). */
    public static final List<String> VIDEO_FORMATS = List.of("story", "post", "square", "tv");

    private ArtFormats() {}

    public static Format require(String key) {
        Format f = key == null ? null : ALL.get(key.toLowerCase());
        if (f == null) {
            throw new IllegalArgumentException("Formato desconhecido: " + key);
        }
        return f;
    }
}
