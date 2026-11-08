package com.pdv2cloud.service.art;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ArtThemeLayersTest {

    private final UUID theme = UUID.fromString("11111111-2222-3333-4444-555555555555");
    private final String own = ArtFileStorage.PUBLIC_PREFIX + "themes/" + theme + "/a.png";

    @Test
    void acceptsOwnLayerAndClampsNumbers() {
        List<Object> out = ArtThemeService.layers(theme, List.of(
            Map.of("id", "orn sup!", "url", own, "role", "base", "cx", 9, "width", 0, "opacity", 4, "hidden", true)));
        @SuppressWarnings("unchecked")
        Map<String, Object> layer = (Map<String, Object>) out.get(0);
        assertThat(layer.get("id")).isEqualTo("orn-sup-");
        assertThat(layer.get("role")).isEqualTo("base");
        assertThat(layer.get("cx")).isEqualTo(2.0);
        assertThat(layer.get("width")).isEqualTo(0.005);
        assertThat(layer.get("opacity")).isEqualTo(1.0);
        assertThat(layer.get("hidden")).isEqualTo(true);
        // Fundo chega travado quando ninguém disse o contrário; enfeite chega animando.
        assertThat(layer.get("still")).isEqualTo(true);
        @SuppressWarnings("unchecked")
        Map<String, Object> element = (Map<String, Object>) ArtThemeService.layers(theme, List.of(Map.of("url", own))).get(0);
        assertThat(element.get("still")).isEqualTo(false);
        @SuppressWarnings("unchecked")
        Map<String, Object> freed = (Map<String, Object>) ArtThemeService.layers(theme, List.of(Map.of("url", own, "role", "base", "still", false))).get(0);
        assertThat(freed.get("still")).isEqualTo(false);
    }

    @Test
    void rejectsFileFromAnotherThemeOrMarket() {
        String other = ArtFileStorage.PUBLIC_PREFIX + "themes/" + UUID.randomUUID() + "/a.png";
        assertThatThrownBy(() -> ArtThemeService.layers(theme, List.of(Map.of("url", other))))
            .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> ArtThemeService.layers(theme, List.of(Map.of("url", own.replace("a.png", "../../brands/x.png")))))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void styleKeepsValidFieldsAndRefusesBadOnes() {
        Map<String, Object> raw = new java.util.HashMap<>();
        raw.put("fonts", Map.of("price", "bebas", "nada", "x"));
        Map<String, Object> tag = new java.util.HashMap<>();
        tag.put("shape", "burst");
        tag.put("tilt", -5);
        tag.put("border", null);
        tag.put("inventado", 1);
        raw.put("tag", tag);
        raw.put("name", Map.of("weight", 799.6, "case", "title"));
        raw.put("grupoDesconhecido", Map.of("a", 1));

        Map<String, Object> out = ArtThemeService.style(raw);
        assertThat(out).containsOnlyKeys("fonts", "tag", "name");
        assertThat(out.get("fonts")).isEqualTo(Map.of("price", "bebas"));
        @SuppressWarnings("unchecked")
        Map<String, Object> t = (Map<String, Object>) out.get("tag");
        assertThat(t).containsEntry("shape", "burst").containsEntry("tilt", -5.0).containsKey("border").doesNotContainKey("inventado");
        assertThat(t.get("border")).isNull();
        assertThat(((Map<?, ?>) out.get("name")).get("weight")).isEqualTo(800);

        assertThatThrownBy(() -> ArtThemeService.style(Map.of("fonts", Map.of("price", "comic-sans"))))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("fonts.price");
        assertThatThrownBy(() -> ArtThemeService.style(Map.of("tag", Map.of("tilt", 90))))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("tag.tilt");
        assertThatThrownBy(() -> ArtThemeService.style(Map.of("footer", Map.of("color", "vermelho"))))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("footer.color");
        assertThatThrownBy(() -> ArtThemeService.style(Map.of("card", Map.of("shadow", "sim"))))
            .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("card.shadow");
    }

    @Test
    void animationKeepsOnlyKnownPresets() {
        Map<String, Object> out = ArtThemeService.animation(Map.of("presets", List.of("festa", "x", "festa"), "defaultPreset", "x", "duration", 99));
        assertThat(out.get("presets")).isEqualTo(List.of("festa"));
        assertThat(out.get("defaultPreset")).isEqualTo("festa");
        assertThat(out.get("duration")).isEqualTo(15L);
        assertThat(ArtThemeService.animation(Map.of("presets", List.of("x")))).isEmpty();
    }
}
