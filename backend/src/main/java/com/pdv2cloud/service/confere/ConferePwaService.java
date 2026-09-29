package com.pdv2cloud.service.confere;

import com.pdv2cloud.service.art.ArtFileStorage;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.imageio.ImageIO;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Ícones e manifest do PWA do Confere.
 *
 * O superadmin recorta a imagem 1:1 no navegador, que gera os PNGs nos
 * tamanhos que Android e iPhone pedem; aqui só conferimos o tamanho e
 * guardamos. O manifest sai do backend (com o Content-Type certo) já
 * apontando para os ícones configurados, ou para os padrão.
 */
@Service
public class ConferePwaService {

    /** Tipo → lado exato do PNG. */
    public static final Map<String, Integer> SIZES = Map.of("icon192", 192, "icon512", 512, "maskable", 512, "apple", 180);
    private static final Map<String, String> DEFAULTS = Map.of(
        "icon192", "/confere-app/icon-192.png",
        "icon512", "/confere-app/icon-512.png",
        "maskable", "/confere-app/icon-maskable-512.png",
        "apple", "/confere-app/apple-touch-icon.png");
    private static final Map<String, String> COLUMNS = Map.of(
        "icon192", "icon_192_url", "icon512", "icon_512_url", "maskable", "icon_maskable_url", "apple", "icon_apple_url");

    private final NamedParameterJdbcTemplate jdbc;
    private final ArtFileStorage storage;

    public ConferePwaService(NamedParameterJdbcTemplate jdbc, ArtFileStorage storage) {
        this.jdbc = jdbc;
        this.storage = storage;
    }

    public record Icons(String icon192, String icon512, String maskable, String apple, String background,
                        boolean custom, LocalDateTime updatedAt) {}

    public Icons icons() {
        return jdbc.queryForObject(
            "select icon_192_url, icon_512_url, icon_maskable_url, icon_apple_url, icon_background, icon_updated_at " +
            "from confere_settings where id = 'default'", Map.of(),
            (rs, i) -> {
                boolean custom = rs.getString("icon_192_url") != null;
                return new Icons(
                    or(rs.getString("icon_192_url"), DEFAULTS.get("icon192")),
                    or(rs.getString("icon_512_url"), DEFAULTS.get("icon512")),
                    or(rs.getString("icon_maskable_url"), DEFAULTS.get("maskable")),
                    or(rs.getString("icon_apple_url"), DEFAULTS.get("apple")),
                    or(rs.getString("icon_background"), "#15803d"), custom,
                    rs.getTimestamp("icon_updated_at") == null ? null : rs.getTimestamp("icon_updated_at").toLocalDateTime());
            });
    }

    @Transactional
    public Icons save(Map<String, MultipartFile> files, String background) {
        if (background != null && !background.matches("^#[0-9a-fA-F]{6}$")) {
            throw new IllegalArgumentException("Cor de fundo inválida");
        }
        for (String kind : SIZES.keySet()) {
            MultipartFile f = files.get(kind);
            if (f == null || f.isEmpty()) {
                throw new IllegalArgumentException("Faltou o ícone " + kind);
            }
            checkPng(kind, f);
        }
        Icons previous = icons();
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("bg", background == null ? "#15803d" : background.toLowerCase());
        for (String kind : SIZES.keySet()) {
            p.addValue(kind, storage.storeImage("pwa/confere", files.get(kind)).url());
        }
        jdbc.update(
            "update confere_settings set icon_192_url = :icon192, icon_512_url = :icon512, icon_maskable_url = :maskable, " +
            "icon_apple_url = :apple, icon_background = :bg, icon_updated_at = now() where id = 'default'", p);
        if (previous.custom()) {
            List.of(previous.icon192(), previous.icon512(), previous.maskable(), previous.apple()).forEach(storage::delete);
        }
        return icons();
    }

    @Transactional
    public Icons reset() {
        Icons previous = icons();
        jdbc.update("update confere_settings set icon_192_url = null, icon_512_url = null, icon_maskable_url = null, " +
            "icon_apple_url = null, icon_background = null, icon_updated_at = now() where id = 'default'", Map.of());
        if (previous.custom()) {
            List.of(previous.icon192(), previous.icon512(), previous.maskable(), previous.apple()).forEach(storage::delete);
        }
        return icons();
    }

    /** URL do ícone pedido (configurado ou padrão), para os redirecionamentos públicos. */
    public String iconUrl(String kind) {
        Icons i = icons();
        return switch (kind) {
            case "icon512" -> i.icon512();
            case "maskable" -> i.maskable();
            case "apple" -> i.apple();
            default -> i.icon192();
        };
    }

    public Map<String, Object> manifest() {
        Icons i = icons();
        String v = i.updatedAt() == null ? "" : "?v=" + i.updatedAt().toString().replaceAll("\\D", "");
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", "MercadoFlow Confere");
        m.put("short_name", "Confere");
        m.put("description", "Conferência de mercadoria pela nota do fornecedor: leia o código do DANFE e confira em letras grandes.");
        m.put("lang", "pt-BR");
        m.put("id", "/confere/");
        m.put("start_url", "/confere/");
        m.put("scope", "/confere/");
        m.put("display", "standalone");
        m.put("orientation", "portrait");
        m.put("background_color", "#f5f5f4");
        m.put("theme_color", "#15803d");
        m.put("categories", List.of("business", "productivity"));
        m.put("icons", List.of(
            icon(i.icon192() + v, "192x192", null),
            icon(i.icon512() + v, "512x512", null),
            icon(i.maskable() + v, "512x512", "maskable")));
        Map<String, Object> share = new LinkedHashMap<>();
        share.put("action", "/confere/importar");
        share.put("method", "POST");
        share.put("enctype", "multipart/form-data");
        share.put("params", Map.of("files", List.of(Map.of("name", "xml", "accept", List.of("text/xml", "application/xml", ".xml")))));
        m.put("share_target", share);
        return m;
    }

    private static Map<String, Object> icon(String src, String sizes, String purpose) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("src", src);
        m.put("sizes", sizes);
        m.put("type", "image/png");
        if (purpose != null) {
            m.put("purpose", purpose);
        }
        return m;
    }

    private static void checkPng(String kind, MultipartFile f) {
        try {
            byte[] bytes = f.getBytes();
            if (bytes.length < 8 || (bytes[0] & 0xff) != 0x89 || bytes[1] != 'P') {
                throw new IllegalArgumentException("O ícone " + kind + " precisa ser PNG");
            }
            BufferedImage img = ImageIO.read(new ByteArrayInputStream(bytes));
            int side = SIZES.get(kind);
            if (img == null || img.getWidth() != side || img.getHeight() != side) {
                throw new IllegalArgumentException("O ícone " + kind + " precisa ter " + side + " x " + side + " px");
            }
        } catch (IOException e) {
            throw new IllegalArgumentException("Não foi possível ler o ícone " + kind);
        }
    }

    private static String or(String v, String fallback) {
        return v == null || v.isBlank() ? fallback : v;
    }
}
