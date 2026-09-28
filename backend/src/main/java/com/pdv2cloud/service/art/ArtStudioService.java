package com.pdv2cloud.service.art;

import com.pdv2cloud.exception.CustomExceptions;
import com.pdv2cloud.service.CatalogImageStorageService;
import com.pdv2cloud.tenancy.TenantContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Estúdio de encartes do mercado.
 *
 * O backend não desenha nada: guarda a marca, as campanhas e as artes que o
 * navegador exporta. O que ele sabe e o navegador não sabe são as vendas — daí
 * saem o preço atual de cada produto e a sugestão do que ofertar.
 */
@Service
public class ArtStudioService {

    private static final int MAX_CONTENT_CHARS = 300_000;
    private static final int MAX_PRODUCTS = 80;
    private static final String SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

    private final NamedParameterJdbcTemplate jdbc;
    private final ArtFileStorage storage;
    private final CatalogImageStorageService catalogImages;
    private final SecureRandom random = new SecureRandom();

    public ArtStudioService(NamedParameterJdbcTemplate jdbc, ArtFileStorage storage, CatalogImageStorageService catalogImages) {
        this.jdbc = jdbc;
        this.storage = storage;
        this.catalogImages = catalogImages;
    }

    // ── Marca ──────────────────────────────────────────────────────────────

    public record Brand(String displayName, String logoUrl, String addressLine, String phone, String whatsapp,
                        String instagram, String footerNote, String marketName) {}

    @Transactional(readOnly = true)
    public Brand brand(UUID marketId) {
        List<Map<String, Object>> market = jdbc.queryForList(
            "select name, address, city, state, contact_phone from markets where id = :id", Map.of("id", marketId));
        if (market.isEmpty()) {
            throw new CustomExceptions.NotFound("Mercado não encontrado");
        }
        Map<String, Object> m = market.get(0);
        String marketName = (String) m.get("name");
        List<Brand> rows = jdbc.query("select * from art_market_brands where market_id = :id", Map.of("id", marketId),
            (rs, i) -> new Brand(rs.getString("display_name"), rs.getString("logo_url"), rs.getString("address_line"),
                rs.getString("phone"), rs.getString("whatsapp"), rs.getString("instagram"), rs.getString("footer_note"),
                marketName));
        if (!rows.isEmpty()) {
            return rows.get(0);
        }
        // Primeira vez: sugere o que o cadastro do mercado já tem.
        String address = join((String) m.get("address"), join((String) m.get("city"), (String) m.get("state"), " - "), ", ");
        return new Brand(marketName, null, address, (String) m.get("contact_phone"), null, null, null, marketName);
    }

    @Transactional
    public Brand saveBrand(UUID marketId, Map<String, Object> body) {
        Brand current = brand(marketId);
        MapSqlParameterSource p = new MapSqlParameterSource()
            .addValue("id", marketId)
            .addValue("name", pick(body, "displayName", 120, current.displayName()))
            .addValue("logo", current.logoUrl())
            .addValue("address", pick(body, "addressLine", 200, current.addressLine()))
            .addValue("phone", pick(body, "phone", 40, current.phone()))
            .addValue("whatsapp", pick(body, "whatsapp", 40, current.whatsapp()))
            .addValue("instagram", pick(body, "instagram", 60, current.instagram()))
            .addValue("note", pick(body, "footerNote", 240, current.footerNote()));
        jdbc.update(
            "insert into art_market_brands (market_id, display_name, logo_url, address_line, phone, whatsapp, instagram, footer_note, updated_at) " +
            "values (:id, :name, :logo, :address, :phone, :whatsapp, :instagram, :note, now()) " +
            "on conflict (market_id) do update set display_name = excluded.display_name, address_line = excluded.address_line, " +
            "phone = excluded.phone, whatsapp = excluded.whatsapp, instagram = excluded.instagram, footer_note = excluded.footer_note, " +
            "updated_at = now()", p);
        return brand(marketId);
    }

    @Transactional
    public Brand uploadLogo(UUID marketId, MultipartFile file) {
        Brand current = brand(marketId);
        ArtFileStorage.Stored stored = storage.storeImage("brands/" + marketId, file);
        jdbc.update(
            "insert into art_market_brands (market_id, display_name, logo_url, address_line, phone, updated_at) " +
            "values (:id, :name, :logo, :address, :phone, now()) " +
            "on conflict (market_id) do update set logo_url = excluded.logo_url, updated_at = now()",
            new MapSqlParameterSource().addValue("id", marketId).addValue("name", current.displayName())
                .addValue("logo", stored.url()).addValue("address", current.addressLine()).addValue("phone", current.phone()));
        storage.delete(current.logoUrl());
        return brand(marketId);
    }

    @Transactional
    public Brand removeLogo(UUID marketId) {
        Brand current = brand(marketId);
        jdbc.update("update art_market_brands set logo_url = null, updated_at = now() where market_id = :id", Map.of("id", marketId));
        storage.delete(current.logoUrl());
        return brand(marketId);
    }

    // ── Produtos e preço ───────────────────────────────────────────────────

    /**
     * @param price    último preço de venda na nota (o que o cliente pagou)
     * @param unit     "kg" quando o produto sai fracionado na nota, senão "un"
     * @param reason   por que foi sugerido (só nas sugestões)
     */
    public record ArtProduct(UUID productId, String name, String ean, String imageUrl, BigDecimal price, String unit,
                             int baskets, String reason) {}

    @Transactional(readOnly = true)
    public List<ArtProduct> searchProducts(UUID marketId, String query) {
        String q = query == null ? "" : query.trim();
        if (q.length() < 2) {
            return List.of();
        }
        String digits = q.replaceAll("\\D", "");
        String sql =
            "select p.id, p.name, p.ean, p.image_url, count(distinct ii.invoice_id) as baskets, " +
            "  (array_agg(ii.valor_unitario order by i.data_emissao desc))[1] as last_price, " +
            "  bool_or(ii.quantidade <> trunc(ii.quantidade)) as fractional " +
            "from invoice_items ii " +
            "join invoices i on i.id = ii.invoice_id " +
            "join products p on p.id = ii.product_id " +
            "where i.market_id = :marketId and i.data_emissao >= :since " +
            "  and (p.name ilike :term" + (digits.length() >= 8 ? " or p.ean = :ean" : "") + ") " +
            "group by p.id, p.name, p.ean, p.image_url " +
            "order by baskets desc limit 24";
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("since", LocalDate.now().minusDays(90).atStartOfDay())
            .addValue("term", "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%")
            .addValue("ean", digits);
        return withImages(jdbc.query(sql, params, (rs, i) -> mapProduct(rs, null)));
    }

    public record SuggestionGroup(String key, String title, String hint, List<ArtProduct> products) {}

    /**
     * O que ofertar, a partir das notas: produtos que puxam gente para a loja,
     * produtos que estão vendendo menos que no mês anterior e produtos em alta.
     */
    @Transactional(readOnly = true)
    public List<SuggestionGroup> suggestions(UUID marketId) {
        LocalDateTime now = LocalDate.now().plusDays(1).atStartOfDay();
        LocalDateTime cut = now.minusDays(28);
        LocalDateTime start = now.minusDays(56);
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId).addValue("cut", cut).addValue("start", start);

        Integer invoicesNow = jdbc.queryForObject(
            "select count(*) from invoices where market_id = :marketId and data_emissao >= :cut", params, Integer.class);
        int total = invoicesNow == null ? 0 : invoicesNow;

        record Row(ArtProduct product, int now, int before) {}
        List<Row> rows = jdbc.query(
            "select p.id, p.name, p.ean, p.image_url, " +
            "  count(distinct ii.invoice_id) filter (where i.data_emissao >= :cut) as baskets, " +
            "  count(distinct ii.invoice_id) filter (where i.data_emissao < :cut) as baskets_before, " +
            "  (array_agg(ii.valor_unitario order by i.data_emissao desc))[1] as last_price, " +
            "  bool_or(ii.quantidade <> trunc(ii.quantidade)) as fractional " +
            "from invoice_items ii " +
            "join invoices i on i.id = ii.invoice_id " +
            "join products p on p.id = ii.product_id " +
            "where i.market_id = :marketId and i.data_emissao >= :start " +
            "  and p.name is not null and p.name not ilike '%sacola%' and p.name not ilike '%sacolinha%' " +
            "group by p.id, p.name, p.ean, p.image_url",
            params,
            (rs, i) -> new Row(mapProduct(rs, null), rs.getInt("baskets"), rs.getInt("baskets_before")));

        List<Row> priced = rows.stream().filter(r -> r.product().price() != null && r.product().price().signum() > 0).toList();

        List<ArtProduct> traffic = priced.stream()
            .filter(r -> r.now() > 0)
            .sorted(Comparator.comparingInt(Row::now).reversed())
            .limit(10)
            .map(r -> withReason(r.product(), total > 0
                ? String.format(Locale.ROOT, "Está em %s das compras do mês", percent(r.now(), total))
                : r.now() + " compras no mês"))
            .toList();

        List<ArtProduct> falling = priced.stream()
            .filter(r -> r.before() >= 6 && r.now() <= r.before() * 0.65)
            .sorted(Comparator.comparingDouble((Row r) -> r.now() / (double) r.before()))
            .limit(10)
            .map(r -> withReason(r.product(), String.format(Locale.ROOT, "Vendeu %s menos que no mês anterior",
                percent(r.before() - r.now(), r.before()))))
            .toList();

        List<ArtProduct> rising = priced.stream()
            .filter(r -> r.before() >= 4 && r.now() >= r.before() * 1.4)
            .sorted(Comparator.comparingDouble((Row r) -> -r.now() / (double) r.before()))
            .limit(10)
            .map(r -> withReason(r.product(), String.format(Locale.ROOT, "Vendeu %s mais que no mês anterior",
                percent(r.now() - r.before(), r.before()))))
            .toList();

        List<ArtProduct> all = new ArrayList<>();
        all.addAll(traffic);
        all.addAll(falling);
        all.addAll(rising);
        Map<UUID, CatalogInfo> images = imagesFor(all);
        return List.of(
            new SuggestionGroup("traffic", "Puxam clientes para a loja",
                "Os mais presentes nas compras. Um preço bom aqui traz gente, e ela leva o resto.",
                applyImages(traffic, images)),
            new SuggestionGroup("falling", "Precisam girar",
                "Venderam bem menos que no mês anterior. Uma oferta ajuda a desovar o estoque.",
                applyImages(falling, images)),
            new SuggestionGroup("rising", "Em alta",
                "Vendas subindo. Destacar agora aproveita o embalo.",
                applyImages(rising, images)));
    }

    // ── Campanhas ──────────────────────────────────────────────────────────

    public record Campaign(UUID id, String title, UUID themeId, Map<String, Object> content, LocalDate validFrom,
                           LocalDate validUntil, String status, String publicSlug, List<Object> publishedImages,
                           LocalDateTime publishedAt, LocalDateTime updatedAt) {}

    @Transactional(readOnly = true)
    public List<Campaign> campaigns(UUID marketId) {
        return jdbc.query("select * from art_campaigns where market_id = :m order by updated_at desc limit 60",
            Map.of("m", marketId), (rs, i) -> mapCampaign(rs));
    }

    @Transactional(readOnly = true)
    public Campaign campaign(UUID marketId, UUID id) {
        List<Campaign> rows = jdbc.query("select * from art_campaigns where id = :id and market_id = :m",
            Map.of("id", id, "m", marketId), (rs, i) -> mapCampaign(rs));
        if (rows.isEmpty()) {
            throw new CustomExceptions.NotFound("Encarte não encontrado");
        }
        return rows.get(0);
    }

    @Transactional
    public Campaign createCampaign(UUID marketId, Map<String, Object> body) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into art_campaigns (id, market_id, title) values (:id, :m, :title)",
            new MapSqlParameterSource().addValue("id", id).addValue("m", marketId)
                .addValue("title", "Ofertas da semana"));
        return saveCampaign(marketId, id, body);
    }

    @Transactional
    public Campaign saveCampaign(UUID marketId, UUID id, Map<String, Object> body) {
        Campaign current = campaign(marketId, id);
        String title = body.containsKey("title") ? ArtJson.str(body.get("title"), 160) : current.title();
        UUID themeId = current.themeId();
        if (body.containsKey("themeId")) {
            themeId = body.get("themeId") == null ? null : UUID.fromString(String.valueOf(body.get("themeId")));
        }
        Map<String, Object> content = current.content();
        if (body.get("content") instanceof Map<?, ?> c) {
            content = sanitizeContent(c);
        }
        LocalDate from = body.containsKey("validFrom") ? date(body.get("validFrom")) : current.validFrom();
        LocalDate until = body.containsKey("validUntil") ? date(body.get("validUntil")) : current.validUntil();
        if (from != null && until != null && until.isBefore(from)) {
            throw new IllegalArgumentException("A validade termina antes de começar");
        }
        jdbc.update(
            "update art_campaigns set title = :title, theme_id = :theme, content = cast(:content as jsonb), valid_from = :from, " +
            "valid_until = :until, updated_at = now() where id = :id and market_id = :m",
            new MapSqlParameterSource().addValue("id", id).addValue("m", marketId)
                .addValue("title", title == null ? "Ofertas" : title).addValue("theme", themeId)
                .addValue("content", ArtJson.write(content)).addValue("from", from).addValue("until", until));
        return campaign(marketId, id);
    }

    @Transactional
    public Campaign duplicateCampaign(UUID marketId, UUID id) {
        Campaign c = campaign(marketId, id);
        UUID copy = UUID.randomUUID();
        jdbc.update(
            "insert into art_campaigns (id, market_id, title, theme_id, content, valid_from, valid_until) " +
            "values (:id, :m, :title, :theme, cast(:content as jsonb), null, null)",
            new MapSqlParameterSource().addValue("id", copy).addValue("m", marketId)
                .addValue("title", truncate(c.title() + " (cópia)", 160)).addValue("theme", c.themeId())
                .addValue("content", ArtJson.write(c.content())));
        return campaign(marketId, copy);
    }

    @Transactional
    public void deleteCampaign(UUID marketId, UUID id) {
        Campaign c = campaign(marketId, id);
        jdbc.update("delete from art_campaigns where id = :id and market_id = :m", Map.of("id", id, "m", marketId));
        deleteImages(c.publishedImages());
    }

    /**
     * Publica as artes que o navegador exportou. {@code formats[i]} diz o
     * formato de {@code files[i]}. As artes anteriores são trocadas.
     */
    @Transactional
    public Campaign publish(UUID marketId, UUID id, List<MultipartFile> files, List<String> formats) {
        Campaign c = campaign(marketId, id);
        if (files == null || files.isEmpty() || formats == null || formats.size() != files.size()) {
            throw new IllegalArgumentException("Envie as artes para publicar");
        }
        if (files.size() > 12) {
            throw new IllegalArgumentException("No máximo 12 artes por encarte");
        }
        List<Map<String, Object>> images = new ArrayList<>();
        for (int i = 0; i < files.size(); i++) {
            String format = formats.get(i);
            if (!"poster".equals(format)) {
                ArtFormats.require(format);
            }
            ArtFileStorage.Stored stored = storage.storeImage("campaigns/" + marketId + "/" + id, files.get(i));
            Map<String, Object> image = new LinkedHashMap<>();
            image.put("format", format);
            image.put("url", stored.url());
            image.put("width", stored.width());
            image.put("height", stored.height());
            images.add(image);
        }
        String slug = c.publicSlug() == null ? newSlug() : c.publicSlug();
        jdbc.update(
            "update art_campaigns set status = 'PUBLISHED', public_slug = :slug, published_images = cast(:images as jsonb), " +
            "published_at = now(), updated_at = now() where id = :id and market_id = :m",
            new MapSqlParameterSource().addValue("id", id).addValue("m", marketId).addValue("slug", slug)
                .addValue("images", ArtJson.write(images)));
        deleteImages(c.publishedImages());
        return campaign(marketId, id);
    }

    @Transactional
    public Campaign unpublish(UUID marketId, UUID id) {
        campaign(marketId, id);
        jdbc.update("update art_campaigns set status = 'DRAFT', updated_at = now() where id = :id and market_id = :m",
            Map.of("id", id, "m", marketId));
        return campaign(marketId, id);
    }

    // ── Página pública ─────────────────────────────────────────────────────

    public record PublicProduct(String name, String detail, Object price, Object oldPrice, String unit, String deal,
                                String imageUrl) {}

    public record PublicCampaign(String title, String marketName, String logoUrl, String addressLine, String phone,
                                 String whatsapp, String instagram, LocalDate validFrom, LocalDate validUntil,
                                 List<Object> images, List<PublicProduct> products, LocalDateTime publishedAt) {}

    /**
     * Encarte publicado, sem login. Roda como sistema porque não há tenant na
     * requisição; o filtro é o slug aleatório + status PUBLISHED, e só sai o
     * que o próprio mercado pôs na arte.
     */
    public PublicCampaign publicCampaign(String slug) {
        if (slug == null || !slug.matches("[a-z0-9]{6,40}")) {
            throw new CustomExceptions.NotFound("Encarte não encontrado");
        }
        return TenantContext.runAsSystem(() -> {
            List<Map<String, Object>> rows = jdbc.queryForList(
                "select c.*, coalesce(b.display_name, m.name) as market_name, b.logo_url, b.address_line, b.phone, " +
                "b.whatsapp, b.instagram from art_campaigns c join markets m on m.id = c.market_id " +
                "left join art_market_brands b on b.market_id = c.market_id " +
                "where c.public_slug = :slug and c.status = 'PUBLISHED'",
                Map.of("slug", slug));
            if (rows.isEmpty()) {
                throw new CustomExceptions.NotFound("Encarte não encontrado");
            }
            Map<String, Object> r = rows.get(0);
            Map<String, Object> content = ArtJson.map(String.valueOf(r.get("content")));
            List<PublicProduct> products = new ArrayList<>();
            if (content.get("products") instanceof List<?> list) {
                for (Object o : list) {
                    if (o instanceof Map<?, ?> p) {
                        products.add(new PublicProduct(ArtJson.str(p.get("name"), 120), ArtJson.str(p.get("detail"), 60),
                            p.get("price"), p.get("oldPrice"), ArtJson.str(p.get("unit"), 8), ArtJson.str(p.get("deal"), 40),
                            ArtJson.str(p.get("imageUrl"), 600)));
                    }
                }
            }
            return new PublicCampaign(
                (String) r.get("title"), (String) r.get("market_name"), (String) r.get("logo_url"),
                (String) r.get("address_line"), (String) r.get("phone"), (String) r.get("whatsapp"), (String) r.get("instagram"),
                r.get("valid_from") == null ? null : ((java.sql.Date) r.get("valid_from")).toLocalDate(),
                r.get("valid_until") == null ? null : ((java.sql.Date) r.get("valid_until")).toLocalDate(),
                ArtJson.list(String.valueOf(r.get("published_images"))), products,
                r.get("published_at") == null ? null : ((Timestamp) r.get("published_at")).toLocalDateTime());
        });
    }

    // ── Apoio ──────────────────────────────────────────────────────────────

    private Map<String, Object> sanitizeContent(Map<?, ?> raw) {
        Map<String, Object> content = new LinkedHashMap<>();
        raw.forEach((k, v) -> content.put(String.valueOf(k), v));
        if (content.get("products") instanceof List<?> list && list.size() > MAX_PRODUCTS) {
            throw new IllegalArgumentException("No máximo " + MAX_PRODUCTS + " produtos por encarte");
        }
        if (ArtJson.write(content).length() > MAX_CONTENT_CHARS) {
            throw new IllegalArgumentException("Encarte grande demais");
        }
        return content;
    }

    private ArtProduct mapProduct(ResultSet rs, String reason) throws SQLException {
        BigDecimal price = rs.getBigDecimal("last_price");
        boolean fractional = rs.getBoolean("fractional");
        return new ArtProduct((UUID) rs.getObject("id"), rs.getString("name"), rs.getString("ean"),
            rs.getString("image_url"), price == null ? null : price.setScale(2, RoundingMode.HALF_UP),
            fractional ? "kg" : "un", rs.getInt("baskets"), reason);
    }

    private static ArtProduct withReason(ArtProduct p, String reason) {
        return new ArtProduct(p.productId(), p.name(), p.ean(), p.imageUrl(), p.price(), p.unit(), p.baskets(), reason);
    }

    private List<ArtProduct> withImages(List<ArtProduct> products) {
        return applyImages(products, imagesFor(products));
    }

    /** Foto e nome do catálogo enriquecido (o mais recente) de cada produto. */
    private record CatalogInfo(String imageUrl, String name) {}

    private Map<UUID, CatalogInfo> imagesFor(List<ArtProduct> products) {
        Map<UUID, CatalogInfo> out = new HashMap<>();
        if (products.isEmpty()) {
            return out;
        }
        List<UUID> ids = products.stream().map(ArtProduct::productId).distinct().toList();
        Map<UUID, String[]> enriched = new HashMap<>();
        jdbc.query(
            "select distinct on (pe.product_id) pe.product_id, pe.image_url, pe.image_storage_key, pe.canonical_name " +
            "from product_enrichments pe where pe.product_id in (:ids) " +
            "order by pe.product_id, pe.fetched_at desc, pe.id desc",
            Map.of("ids", ids),
            rs -> {
                enriched.put((UUID) rs.getObject("product_id"),
                    new String[] {rs.getString("image_url"), rs.getString("image_storage_key"), rs.getString("canonical_name")});
            });
        for (ArtProduct p : products) {
            String[] e = enriched.get(p.productId());
            String url = e != null && e[0] != null ? e[0] : p.imageUrl();
            String key = e == null ? null : e[1];
            String resolved = null;
            try {
                resolved = catalogImages.resolveCatalogImageUrl(url, key);
            } catch (RuntimeException ignored) {
                // Sem foto o cartão sai com o nome em destaque.
            }
            String name = e != null && e[2] != null && !e[2].isBlank() ? e[2] : null;
            out.put(p.productId(), new CatalogInfo(resolved == null || resolved.isBlank() ? null : resolved, name));
        }
        return out;
    }

    private static List<ArtProduct> applyImages(List<ArtProduct> products, Map<UUID, CatalogInfo> info) {
        return products.stream().map(p -> {
            CatalogInfo i = info.get(p.productId());
            return new ArtProduct(p.productId(), i != null && i.name() != null ? i.name() : p.name(), p.ean(),
                i == null ? null : i.imageUrl(), p.price(), p.unit(), p.baskets(), p.reason());
        }).toList();
    }

    // ── Catálogo global ────────────────────────────────────────────────────

    /**
     * Busca no catálogo global da plataforma (todos os produtos conhecidos, com
     * nome canônico e foto), por código de barras ou nome. Traz o preço da
     * última venda deste mercado quando ele já vendeu o produto.
     */
    @Transactional(readOnly = true)
    public List<ArtProduct> searchCatalog(UUID marketId, String query) {
        String q = query == null ? "" : query.trim();
        if (q.length() < 2) {
            return List.of();
        }
        String digits = q.replaceAll("\\D", "");
        boolean byEan = digits.length() >= 8 && digits.length() == q.replaceAll("\\s", "").length();
        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("since", LocalDate.now().minusDays(90).atStartOfDay());
        String where;
        if (byEan) {
            // EAN com ou sem zeros à esquerda (GTIN-13 x GTIN-14).
            where = "ltrim(p.ean, '0') = ltrim(:ean, '0')";
            params.addValue("ean", digits);
        } else {
            where = "(lower(coalesce(le.canonical_name, '')) like :term or lower(p.name) like :term or lower(coalesce(le.brand, p.brand, '')) like :term)";
            params.addValue("term", "%" + q.toLowerCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        String sql =
            "with candidates as ( " +
            "  select p.id, p.name, p.ean, p.image_url, le.canonical_name, le.image_url as e_url, le.image_storage_key " +
            "  from products p " +
            "  left join lateral (select pe.canonical_name, pe.brand, pe.image_url, pe.image_storage_key from product_enrichments pe " +
            "    where pe.product_id = p.id order by pe.fetched_at desc, pe.id desc limit 1) le on true " +
            "  where p.ean is not null and " + where + " " +
            "  order by (coalesce(le.image_storage_key, le.image_url, p.image_url) is null), length(coalesce(le.canonical_name, p.name)) " +
            "  limit 30 " +
            ") " +
            "select c.*, s.last_price, coalesce(s.baskets, 0) as baskets, coalesce(s.fractional, false) as fractional " +
            "from candidates c left join lateral ( " +
            "  select (array_agg(ii.valor_unitario order by i.data_emissao desc))[1] as last_price, " +
            "    count(distinct ii.invoice_id) as baskets, bool_or(ii.quantidade <> trunc(ii.quantidade)) as fractional " +
            "  from invoice_items ii join invoices i on i.id = ii.invoice_id " +
            "  where ii.product_id = c.id and i.market_id = :marketId and i.data_emissao >= :since " +
            ") s on true " +
            "order by coalesce(s.baskets, 0) desc limit 24";
        return jdbc.query(sql, params, (rs, i) -> {
            String image = null;
            try {
                image = catalogImages.resolveCatalogImageUrl(
                    rs.getString("e_url") != null ? rs.getString("e_url") : rs.getString("image_url"),
                    rs.getString("image_storage_key"));
            } catch (RuntimeException ignored) {
                // sem foto
            }
            String canonical = rs.getString("canonical_name");
            BigDecimal price = rs.getBigDecimal("last_price");
            return new ArtProduct((UUID) rs.getObject("id"),
                canonical != null && !canonical.isBlank() ? canonical : rs.getString("name"),
                rs.getString("ean"), image == null || image.isBlank() ? null : image,
                price == null ? null : price.setScale(2, RoundingMode.HALF_UP),
                rs.getBoolean("fractional") ? "kg" : "un", rs.getInt("baskets"), null);
        });
    }

    /** Foto própria para um item do encarte (o mercado fotografou o produto). */
    public String uploadItemImage(UUID marketId, MultipartFile file) {
        return storage.storeImage("items/" + marketId, file).url();
    }

    private Campaign mapCampaign(ResultSet rs) throws SQLException {
        java.sql.Date from = rs.getDate("valid_from");
        java.sql.Date until = rs.getDate("valid_until");
        Timestamp published = rs.getTimestamp("published_at");
        Timestamp updated = rs.getTimestamp("updated_at");
        return new Campaign((UUID) rs.getObject("id"), rs.getString("title"), (UUID) rs.getObject("theme_id"),
            ArtJson.map(rs.getString("content")), from == null ? null : from.toLocalDate(),
            until == null ? null : until.toLocalDate(), rs.getString("status"), rs.getString("public_slug"),
            ArtJson.list(rs.getString("published_images")), published == null ? null : published.toLocalDateTime(),
            updated == null ? null : updated.toLocalDateTime());
    }

    private void deleteImages(List<Object> images) {
        for (Object o : images) {
            if (o instanceof Map<?, ?> m && m.get("url") != null) {
                storage.delete(String.valueOf(m.get("url")));
            }
        }
    }

    private String newSlug() {
        for (int attempt = 0; attempt < 5; attempt++) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 10; i++) {
                sb.append(SLUG_ALPHABET.charAt(random.nextInt(SLUG_ALPHABET.length())));
            }
            String slug = sb.toString();
            // O RLS só deixa ver os encartes do próprio mercado; a restrição
            // UNIQUE do banco é quem garante de fato (31^10 combinações).
            Integer taken = jdbc.queryForObject(
                "select count(*) from art_campaigns where public_slug = :s", Map.of("s", slug), Integer.class);
            if (taken == null || taken == 0) {
                return slug;
            }
        }
        throw new IllegalStateException("Não foi possível gerar o link do encarte");
    }

    private static String percent(int part, int whole) {
        return Math.round(part * 100.0 / Math.max(1, whole)) + "%";
    }

    private static LocalDate date(Object value) {
        String s = ArtJson.str(value, 10);
        if (s == null) {
            return null;
        }
        try {
            return LocalDate.parse(s);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("Data inválida: " + s);
        }
    }

    private static String pick(Map<String, Object> body, String key, int max, String fallback) {
        return body.containsKey(key) ? ArtJson.str(body.get(key), max) : fallback;
    }

    private static String truncate(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }

    private static String join(String a, String b, String sep) {
        boolean ha = a != null && !a.isBlank();
        boolean hb = b != null && !b.isBlank();
        if (ha && hb) {
            return a.trim() + sep + b.trim();
        }
        return ha ? a.trim() : hb ? b.trim() : null;
    }
}
