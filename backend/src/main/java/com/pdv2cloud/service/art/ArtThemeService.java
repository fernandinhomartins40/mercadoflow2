package com.pdv2cloud.service.art;

import com.pdv2cloud.exception.CustomExceptions;
import com.pdv2cloud.service.ai.LlmClient.LlmResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Temas de encarte, montados pelo superadmin.
 *
 * Um tema é uma família visual: selo 3D, paleta da etiqueta de preço e um
 * fundo PNG por formato. Em cada fundo ficam marcadas as áreas da logo, dos
 * produtos, do rodapé e do selo — é esse "contexto" que deixa o editor do
 * mercado montar a arte sozinho.
 *
 * As áreas são encontradas em duas etapas. O navegador mede os pixels do fundo
 * e propõe retângulos calmos (onde cabe conteúdo sem brigar com o desenho); a
 * IA olha a imagem com esses retângulos numerados e diz qual serve para quê.
 * A IA só escolhe entre áreas que nós medimos: coordenada inventada por modelo
 * de linguagem não entra no banco.
 */
@Service
public class ArtThemeService {

    private static final Pattern HEX = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final Set<String> PALETTE_KEYS = Set.of("tag", "tagText", "card", "cardText", "accent");
    private static final Set<String> STATUSES = Set.of("DRAFT", "PUBLISHED");

    private final NamedParameterJdbcTemplate jdbc;
    private final ArtFileStorage storage;
    private final PlatformAiService ai;

    public ArtThemeService(NamedParameterJdbcTemplate jdbc, ArtFileStorage storage, PlatformAiService ai) {
        this.jdbc = jdbc;
        this.storage = storage;
        this.ai = ai;
    }

    // ── Leitura ────────────────────────────────────────────────────────────

    public record ThemeFormat(String format, String backgroundUrl, int width, int height,
                              Map<String, Object> regions, LocalDateTime updatedAt) {}

    public record Theme(UUID id, String name, String occasion, List<Object> tags, Map<String, Object> palette,
                        String sealUrl, Integer sealWidth, Integer sealHeight, String status, int sortOrder,
                        List<ThemeFormat> formats, LocalDateTime updatedAt) {}

    @Transactional(readOnly = true)
    public List<Theme> list(boolean onlyPublished) {
        String where = onlyPublished ? "where status = 'PUBLISHED' " : "";
        List<Theme> themes = jdbc.query(
            "select * from art_themes " + where + "order by sort_order, updated_at desc",
            new MapSqlParameterSource(), (rs, i) -> mapTheme(rs, new ArrayList<>()));
        if (themes.isEmpty()) {
            return themes;
        }
        Map<UUID, List<ThemeFormat>> byTheme = new LinkedHashMap<>();
        jdbc.query("select * from art_theme_formats where theme_id in (:ids) order by format",
            Map.of("ids", themes.stream().map(Theme::id).toList()),
            rs -> {
                byTheme.computeIfAbsent((UUID) rs.getObject("theme_id"), k -> new ArrayList<>()).add(mapFormat(rs));
            });
        List<Theme> out = new ArrayList<>();
        for (Theme t : themes) {
            List<ThemeFormat> formats = byTheme.getOrDefault(t.id(), List.of());
            if (onlyPublished && formats.stream().noneMatch(ArtThemeService::hasProducts)) {
                continue;
            }
            out.add(withFormats(t, sortFormats(formats)));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public Theme get(UUID id) {
        List<Theme> rows = jdbc.query("select * from art_themes where id = :id", Map.of("id", id),
            (rs, i) -> mapTheme(rs, new ArrayList<>()));
        if (rows.isEmpty()) {
            throw new CustomExceptions.NotFound("Tema não encontrado");
        }
        List<ThemeFormat> formats = jdbc.query("select * from art_theme_formats where theme_id = :id",
            Map.of("id", id), (rs, i) -> mapFormat(rs));
        return withFormats(rows.get(0), sortFormats(formats));
    }

    // ── Escrita ────────────────────────────────────────────────────────────

    @Transactional
    public Theme create(Map<String, Object> body) {
        String name = ArtJson.str(body.get("name"), 120);
        UUID id = UUID.randomUUID();
        jdbc.update(
            "insert into art_themes (id, name, occasion, palette, sort_order) values (:id, :name, :occasion, cast(:palette as jsonb), " +
            "coalesce((select max(sort_order) + 1 from art_themes), 0))",
            new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("name", name == null ? "Tema sem nome" : name)
                .addValue("occasion", occasion(body.get("occasion")))
                .addValue("palette", ArtJson.write(defaultPalette())));
        return get(id);
    }

    @Transactional
    public Theme update(UUID id, Map<String, Object> body) {
        Theme current = get(id);
        String name = body.containsKey("name") ? ArtJson.str(body.get("name"), 120) : current.name();
        String occasion = body.containsKey("occasion") ? occasion(body.get("occasion")) : current.occasion();
        Object tags = body.containsKey("tags") ? tags(body.get("tags")) : current.tags();
        Map<String, Object> palette = body.containsKey("palette") ? palette(body.get("palette"), current.palette()) : current.palette();
        int sort = body.containsKey("sortOrder") ? (int) ArtJson.num(body.get("sortOrder"), current.sortOrder()) : current.sortOrder();
        String status = current.status();
        if (body.containsKey("status")) {
            status = String.valueOf(body.get("status")).toUpperCase(Locale.ROOT);
            if (!STATUSES.contains(status)) {
                throw new IllegalArgumentException("Situação inválida");
            }
            if ("PUBLISHED".equals(status) && current.formats().stream().noneMatch(ArtThemeService::hasProducts)) {
                throw new IllegalArgumentException("Para publicar, o tema precisa de pelo menos um fundo com a área de produtos marcada");
            }
        }
        jdbc.update(
            "update art_themes set name = :name, occasion = :occasion, tags = cast(:tags as jsonb), palette = cast(:palette as jsonb), " +
            "status = :status, sort_order = :sort, updated_at = now() where id = :id",
            new MapSqlParameterSource()
                .addValue("id", id)
                .addValue("name", name == null ? current.name() : name)
                .addValue("occasion", occasion)
                .addValue("tags", ArtJson.write(tags))
                .addValue("palette", ArtJson.write(palette))
                .addValue("status", status)
                .addValue("sort", sort));
        return get(id);
    }

    @Transactional
    public void delete(UUID id) {
        Theme t = get(id);
        jdbc.update("delete from art_themes where id = :id", Map.of("id", id));
        storage.delete(t.sealUrl());
        t.formats().forEach(f -> storage.delete(f.backgroundUrl()));
    }

    @Transactional
    public Theme uploadSeal(UUID id, MultipartFile file) {
        Theme t = get(id);
        ArtFileStorage.Stored stored = storage.storeImage("themes/" + id, file);
        jdbc.update("update art_themes set seal_url = :url, seal_width = :w, seal_height = :h, updated_at = now() where id = :id",
            new MapSqlParameterSource().addValue("id", id).addValue("url", stored.url())
                .addValue("w", stored.width()).addValue("h", stored.height()));
        storage.delete(t.sealUrl());
        return get(id);
    }

    @Transactional
    public Theme removeSeal(UUID id) {
        Theme t = get(id);
        jdbc.update("update art_themes set seal_url = null, seal_width = null, seal_height = null, updated_at = now() where id = :id",
            Map.of("id", id));
        storage.delete(t.sealUrl());
        return get(id);
    }

    /** Troca o fundo de um formato. As áreas antigas são apagadas: valiam para o desenho anterior. */
    @Transactional
    public Theme uploadBackground(UUID id, String formatKey, MultipartFile file) {
        ArtFormats.Format format = ArtFormats.require(formatKey);
        Theme t = get(id);
        ArtFileStorage.Stored stored = storage.storeImage("themes/" + id, file);
        if (stored.width() > 0 && stored.height() > 0) {
            double ratio = stored.width() / (double) stored.height();
            if (Math.abs(ratio - format.ratio()) / format.ratio() > 0.06) {
                storage.delete(stored.url());
                throw new IllegalArgumentException(String.format(Locale.ROOT,
                    "O fundo de %s precisa ter a proporção de %d x %d px (enviado: %d x %d)",
                    format.label(), format.width(), format.height(), stored.width(), stored.height()));
            }
        }
        String previous = t.formats().stream().filter(f -> f.format().equals(format.key()))
            .map(ThemeFormat::backgroundUrl).findFirst().orElse(null);
        jdbc.update(
            "insert into art_theme_formats (theme_id, format, background_url, width, height, regions) " +
            "values (:id, :format, :url, :w, :h, '{}'::jsonb) " +
            "on conflict (theme_id, format) do update set background_url = excluded.background_url, width = excluded.width, " +
            "height = excluded.height, regions = '{}'::jsonb, analysis = null, updated_at = now()",
            new MapSqlParameterSource().addValue("id", id).addValue("format", format.key()).addValue("url", stored.url())
                .addValue("w", stored.width() > 0 ? stored.width() : format.width())
                .addValue("h", stored.height() > 0 ? stored.height() : format.height()));
        jdbc.update("update art_themes set updated_at = now() where id = :id", Map.of("id", id));
        if (previous != null) {
            storage.delete(previous);
        }
        return get(id);
    }

    @Transactional
    public Theme saveRegions(UUID id, String formatKey, Map<String, Object> body) {
        ArtFormats.Format format = ArtFormats.require(formatKey);
        get(id);
        Map<String, Object> regions = regions(body.get("regions"));
        int updated = jdbc.update(
            "update art_theme_formats set regions = cast(:regions as jsonb), analysis = coalesce(cast(:analysis as jsonb), analysis), " +
            "updated_at = now() where theme_id = :id and format = :format",
            new MapSqlParameterSource().addValue("id", id).addValue("format", format.key())
                .addValue("regions", ArtJson.write(regions))
                .addValue("analysis", body.get("analysis") == null ? null : ArtJson.write(body.get("analysis"))));
        if (updated == 0) {
            throw new IllegalArgumentException("Envie o fundo de " + format.label() + " antes de marcar as áreas");
        }
        jdbc.update("update art_themes set updated_at = now() where id = :id", Map.of("id", id));
        return get(id);
    }

    @Transactional
    public Theme deleteFormat(UUID id, String formatKey) {
        ArtFormats.Format format = ArtFormats.require(formatKey);
        Theme t = get(id);
        t.formats().stream().filter(f -> f.format().equals(format.key())).findFirst().ifPresent(f -> {
            jdbc.update("delete from art_theme_formats where theme_id = :id and format = :format",
                Map.of("id", id, "format", format.key()));
            storage.delete(f.backgroundUrl());
        });
        Theme after = get(id);
        if ("PUBLISHED".equals(after.status()) && after.formats().stream().noneMatch(ArtThemeService::hasProducts)) {
            jdbc.update("update art_themes set status = 'DRAFT' where id = :id", Map.of("id", id));
            after = get(id);
        }
        return after;
    }

    // ── IA ─────────────────────────────────────────────────────────────────

    private static final String SYSTEM_PROMPT = """
        Você é diretor de arte de encartes de supermercado no Brasil.
        Recebe o fundo de um tema de encarte com retângulos numerados desenhados por cima.
        Os retângulos são áreas calmas, medidas nos pixels, onde cabe conteúdo sem cobrir o desenho.
        Escolha qual retângulo serve para cada papel:
        - products: a maior área limpa, onde entram as fotos e os preços dos produtos (obrigatório);
        - logo: área pequena, em geral no alto, para a logo do mercado;
        - footer: faixa estreita embaixo para endereço, telefone e validade das ofertas;
        - seal: área para o selo do tema (ex.: "Ofertas de Aniversário"), perto do título ou num canto.
        Um retângulo não pode ter dois papéis. Use null quando nenhum servir.
        Também sugira nome curto do tema, a ocasião, até 5 palavras-chave e as cores da etiqueta de preço
        que combinem com o fundo e tenham bom contraste (hex #RRGGBB):
        tag = fundo da etiqueta de preço, tagText = número do preço, card = fundo do cartão do produto,
        cardText = nome do produto, accent = detalhes (unidade, "de/por").
        Responda SOMENTE com JSON, sem comentários:
        {"products":1,"logo":2,"footer":3,"seal":4,"name":"...","occasion":"...","tags":["..."],
         "palette":{"tag":"#...","tagText":"#...","card":"#...","cardText":"#...","accent":"#..."},
         "notes":"uma frase explicando a escolha"}
        """;

    public record Suggestion(Map<String, Object> assignment, String name, String occasion, List<String> tags,
                             Map<String, Object> palette, String notes, long latencyMs) {}

    public Suggestion suggest(UUID id, Map<String, Object> body) {
        Theme theme = get(id);
        ArtFormats.Format format = ArtFormats.require(String.valueOf(body.get("format")));
        String image = String.valueOf(body.get("image"));
        if (!image.startsWith("data:image/jpeg;base64,") && !image.startsWith("data:image/png;base64,")) {
            throw new IllegalArgumentException("Imagem da análise em formato inválido");
        }
        if (image.length() > 3_000_000) {
            throw new IllegalArgumentException("Imagem da análise grande demais; reduza antes de enviar");
        }
        List<Map<String, Object>> candidates = new ArrayList<>();
        Set<Integer> ids = new HashSet<>();
        if (body.get("candidates") instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> m && candidates.size() < 12) {
                    int cid = (int) ArtJson.num(m.get("id"), -1);
                    if (cid < 1 || !ids.add(cid)) {
                        continue;
                    }
                    Map<String, Object> c = new LinkedHashMap<>();
                    c.put("id", cid);
                    for (String k : List.of("x", "y", "w", "h")) {
                        c.put(k, Math.round(clamp01(ArtJson.num(m.get(k), 0)) * 1000) / 1000.0);
                    }
                    candidates.add(c);
                }
            }
        }
        if (candidates.isEmpty()) {
            throw new IllegalArgumentException("Nenhuma área candidata para a IA avaliar");
        }

        StringBuilder user = new StringBuilder();
        user.append("Formato: ").append(format.label()).append(" (").append(format.width()).append(" x ")
            .append(format.height()).append(" px).\n");
        user.append(theme.sealUrl() == null ? "O tema ainda não tem selo.\n" : "O tema tem selo 3D; reserve a área dele.\n");
        user.append("Ocasiões possíveis: ").append(String.join(", ", ArtFormats.OCCASIONS)).append(".\n");
        user.append("Retângulos (x, y, largura e altura de 0 a 1 sobre a imagem):\n");
        for (Map<String, Object> c : candidates) {
            user.append(String.format(Locale.ROOT, "%s: x=%.3f y=%.3f w=%.3f h=%.3f%n",
                c.get("id"), c.get("x"), c.get("y"), c.get("w"), c.get("h")));
        }

        LlmResponse response = ai.askWithImage(SYSTEM_PROMPT, user.toString(), image, 500);
        if (!response.success()) {
            throw new IllegalArgumentException("A IA não respondeu: " + response.errorMessage());
        }
        Map<String, Object> parsed = ArtJson.map(extractJson(response.content()));
        if (parsed.isEmpty()) {
            throw new IllegalArgumentException("A IA respondeu fora do formato esperado. Tente de novo.");
        }

        Map<String, Object> assignment = new LinkedHashMap<>();
        Set<Integer> used = new HashSet<>();
        for (String role : List.of("products", "logo", "footer", "seal")) {
            Object v = parsed.get(role);
            int cid = v == null ? -1 : (int) ArtJson.num(v, -1);
            if (ids.contains(cid) && used.add(cid)) {
                assignment.put(role, cid);
            } else {
                assignment.put(role, null);
            }
        }
        List<String> tags = new ArrayList<>();
        if (parsed.get("tags") instanceof List<?> tl) {
            for (Object o : tl) {
                String s = ArtJson.str(o, 30);
                if (s != null && tags.size() < 5) {
                    tags.add(s.toLowerCase(Locale.ROOT));
                }
            }
        }
        Map<String, Object> palette = new LinkedHashMap<>();
        if (parsed.get("palette") instanceof Map<?, ?> pm) {
            for (String k : PALETTE_KEYS) {
                Object c = pm.get(k);
                if (c != null && HEX.matcher(String.valueOf(c)).matches()) {
                    palette.put(k, String.valueOf(c).toLowerCase(Locale.ROOT));
                }
            }
        }
        return new Suggestion(assignment, ArtJson.str(parsed.get("name"), 60), occasion(parsed.get("occasion")),
            tags, palette, ArtJson.str(parsed.get("notes"), 300), response.latencyMs());
    }

    // ── Apoio ──────────────────────────────────────────────────────────────

    private static String extractJson(String content) {
        if (content == null) {
            return "";
        }
        int start = content.indexOf('{');
        int end = content.lastIndexOf('}');
        return start >= 0 && end > start ? content.substring(start, end + 1) : "";
    }

    private static boolean hasProducts(ThemeFormat f) {
        return f.regions() != null && f.regions().get("products") instanceof Map<?, ?>;
    }

    private static List<ThemeFormat> sortFormats(List<ThemeFormat> formats) {
        List<String> order = new ArrayList<>(ArtFormats.ALL.keySet());
        List<ThemeFormat> copy = new ArrayList<>(formats);
        copy.sort((a, b) -> Integer.compare(order.indexOf(a.format()), order.indexOf(b.format())));
        return copy;
    }

    private static Theme withFormats(Theme t, List<ThemeFormat> formats) {
        return new Theme(t.id(), t.name(), t.occasion(), t.tags(), t.palette(), t.sealUrl(), t.sealWidth(), t.sealHeight(),
            t.status(), t.sortOrder(), formats, t.updatedAt());
    }

    private static Theme mapTheme(ResultSet rs, List<ThemeFormat> formats) throws SQLException {
        Timestamp updated = rs.getTimestamp("updated_at");
        return new Theme(
            (UUID) rs.getObject("id"), rs.getString("name"), rs.getString("occasion"),
            ArtJson.list(rs.getString("tags")), ArtJson.map(rs.getString("palette")),
            rs.getString("seal_url"), (Integer) rs.getObject("seal_width"), (Integer) rs.getObject("seal_height"),
            rs.getString("status"), rs.getInt("sort_order"), formats,
            updated == null ? null : updated.toLocalDateTime());
    }

    private static ThemeFormat mapFormat(ResultSet rs) throws SQLException {
        Timestamp updated = rs.getTimestamp("updated_at");
        return new ThemeFormat(rs.getString("format"), rs.getString("background_url"), rs.getInt("width"),
            rs.getInt("height"), ArtJson.map(rs.getString("regions")), updated == null ? null : updated.toLocalDateTime());
    }

    private static Map<String, Object> defaultPalette() {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("tag", "#e3161f");
        p.put("tagText", "#ffffff");
        p.put("card", "#ffffff");
        p.put("cardText", "#1c1917");
        p.put("accent", "#ffd21f");
        return p;
    }

    private static String occasion(Object value) {
        String s = ArtJson.str(value, 60);
        if (s == null) {
            return null;
        }
        for (String o : ArtFormats.OCCASIONS) {
            if (o.equalsIgnoreCase(s)) {
                return o;
            }
        }
        return "Outro";
    }

    private static List<String> tags(Object value) {
        List<String> out = new ArrayList<>();
        if (value instanceof List<?> list) {
            for (Object o : list) {
                String s = ArtJson.str(o, 30);
                if (s != null && out.size() < 8 && !out.contains(s.toLowerCase(Locale.ROOT))) {
                    out.add(s.toLowerCase(Locale.ROOT));
                }
            }
        }
        return out;
    }

    private static Map<String, Object> palette(Object value, Map<String, Object> current) {
        Map<String, Object> out = new LinkedHashMap<>(current == null ? defaultPalette() : current);
        if (value instanceof Map<?, ?> m) {
            for (String k : PALETTE_KEYS) {
                Object c = m.get(k);
                if (c != null) {
                    if (!HEX.matcher(String.valueOf(c)).matches()) {
                        throw new IllegalArgumentException("Cor inválida em " + k + ": use #RRGGBB");
                    }
                    out.put(k, String.valueOf(c).toLowerCase(Locale.ROOT));
                }
            }
        }
        return out;
    }

    private static Map<String, Object> regions(Object value) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (!(value instanceof Map<?, ?> m)) {
            return out;
        }
        for (String key : ArtFormats.REGION_KEYS) {
            if (!(m.get(key) instanceof Map<?, ?> r)) {
                continue;
            }
            double x = clamp01(ArtJson.num(r.get("x"), 0));
            double y = clamp01(ArtJson.num(r.get("y"), 0));
            double w = Math.min(ArtJson.num(r.get("w"), 0), 1 - x);
            double h = Math.min(ArtJson.num(r.get("h"), 0), 1 - y);
            if (w < 0.02 || h < 0.02) {
                throw new IllegalArgumentException("A área " + key + " ficou pequena demais");
            }
            Map<String, Object> rect = new LinkedHashMap<>();
            rect.put("x", round4(x));
            rect.put("y", round4(y));
            rect.put("w", round4(w));
            rect.put("h", round4(h));
            out.put(key, rect);
        }
        return out;
    }

    private static double clamp01(double v) {
        return Math.max(0, Math.min(1, v));
    }

    private static double round4(double v) {
        return Math.round(v * 10000) / 10000.0;
    }
}
