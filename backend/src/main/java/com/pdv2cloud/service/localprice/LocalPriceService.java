package com.pdv2cloud.service.localprice;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.tenancy.TenantContext;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.sql.Date;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Preço da vizinhança: o preço dos produtos da loja nas lojas próximas, pelo
 * código de barras, no Menor Preço do Nota Paraná.
 *
 * Por que só o Paraná (análise de 07/10/2026): é o único portal estadual com
 * API aberta, sem login nem captcha, que busca por GTIN e por localização. O
 * Preço da Hora (BA) recusa sem sessão validada por captcha; o Menor Preço
 * Brasil exige login GOV.BR; o Busca Preço (AM) não tem código de barras.
 *
 * O preço que vem da nota de cada loja é ruidoso (código de barras de outro
 * produto, fardo no lugar da unidade, bar e posto misturados, preço absurdo),
 * então nada é guardado cru: só o que passa pela limpeza vira mediana, faixa
 * típica (25% a 75%) e o mais barato, e abaixo de 3 lojas não opinamos.
 */
@Service
@Slf4j
public class LocalPriceService {

    public static final String PROVIDER = "MENOR_PRECO_PR";
    public static final String PROVIDER_LABEL = "Menor Preço, do Nota Paraná";
    public static final String ONLY_PR =
        "Disponível só para lojas no Paraná: o Menor Preço, do Nota Paraná, é o único portal estadual aberto que busca preço por código de barras e localização.";

    static final String API = "https://menorpreco.notaparana.pr.gov.br/api/v1/produtos";
    static final int RADIUS_KM = 10;
    static final int WIDE_RADIUS_KM = 20;
    static final int MIN_STORES = 3;
    static final int MAX_AGE_DAYS = 15;
    static final int REFRESH_DAYS = 6;
    static final long PAUSE_MS = 1500;

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
    private final Map<String, double[]> centroids = loadCentroids();
    private final ExecutorService background = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "local-price");
        t.setDaemon(true);
        return t;
    });
    private final Map<UUID, AtomicBoolean> running = new java.util.concurrent.ConcurrentHashMap<>();

    public LocalPriceService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ---------------------------------------------------------------- local da loja

    public record Location(String uf, String city, String cityCode, Double latitude, Double longitude, String geoSource) {
        public boolean inParana() {
            return "PR".equalsIgnoreCase(uf) || (cityCode != null && cityCode.startsWith("41"));
        }
    }

    private static Map<String, double[]> loadCentroids() {
        Map<String, double[]> out = new HashMap<>();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(
                new ClassPathResource("geo/municipios-pr.csv").getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                if (line.startsWith("#") || line.startsWith("codigo")) continue;
                String[] p = line.split(",");
                if (p.length >= 4) out.put(p[0], new double[] { Double.parseDouble(p[2]), Double.parseDouble(p[3]) });
            }
        } catch (Exception e) {
            log.warn("Tabela de municípios do PR indisponível: {}", e.getMessage());
        }
        return out;
    }

    public Location location(UUID marketId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select uf, city, city_code, latitude, longitude, geo_source from market_locations where market_id = :m",
            new MapSqlParameterSource("m", marketId));
        if (rows.isEmpty()) return new Location(null, null, null, null, null, null);
        Map<String, Object> r = rows.get(0);
        Double lat = r.get("latitude") == null ? null : ((Number) r.get("latitude")).doubleValue();
        Double lon = r.get("longitude") == null ? null : ((Number) r.get("longitude")).doubleValue();
        String source = (String) r.get("geo_source");
        String code = (String) r.get("city_code");
        if ((lat == null || lon == null) && code != null && centroids.containsKey(code)) {
            double[] c = centroids.get(code);
            lat = c[0];
            lon = c[1];
            source = "MUNICIPIO";
        }
        return new Location((String) r.get("uf"), (String) r.get("city"), code, lat, lon, source);
    }

    /** O dono marca a loja no mapa (GPS do navegador). Só vale dentro do Paraná. */
    public Location setCoordinates(UUID marketId, double lat, double lon) {
        if (lat < -26.8 || lat > -22.4 || lon < -54.7 || lon > -47.9) {
            throw new IllegalArgumentException("Essa localização está fora do Paraná. " + ONLY_PR);
        }
        int n = jdbc.update("update market_locations set latitude = :lat, longitude = :lon, geo_source = 'LOJA', updated_at = now() "
                + "where market_id = :m",
            new MapSqlParameterSource("m", marketId).addValue("lat", lat).addValue("lon", lon));
        if (n == 0) {
            jdbc.update("insert into market_locations (market_id, uf, latitude, longitude, geo_source, source) "
                    + "values (:m, 'PR', :lat, :lon, 'LOJA', 'MANUAL')",
                new MapSqlParameterSource("m", marketId).addValue("lat", lat).addValue("lon", lon));
        }
        return location(marketId);
    }

    // ---------------------------------------------------------------- coleta

    public record RunResult(int products, int ok, int fewStores, int noData, int errors) { }

    /** Coleta em segundo plano (botão "Atualizar agora"). Devolve false se já está rodando. */
    public boolean collectInBackground(UUID marketId, int maxProducts) {
        AtomicBoolean flag = running.computeIfAbsent(marketId, k -> new AtomicBoolean());
        if (!flag.compareAndSet(false, true)) return false;
        background.submit(() -> {
            TenantContext.set(new TenantContext.TenantInfo(marketId, false));
            try {
                collect(marketId, maxProducts);
            } catch (Exception e) {
                log.warn("Preço da vizinhança falhou (mercado {}): {}", marketId, e.getMessage());
            } finally {
                TenantContext.clear();
                flag.set(false);
            }
        });
        return true;
    }

    public boolean isRunning(UUID marketId) {
        AtomicBoolean f = running.get(marketId);
        return f != null && f.get();
    }

    /** Lojas do Paraná com endereço conhecido (o job percorre todas). */
    public List<UUID> parana() {
        return TenantContext.runAsSystem(() -> jdbc.queryForList(
            "select l.market_id from market_locations l join markets m on m.id = l.market_id "
                + "where coalesce(m.is_active, true) and (upper(l.uf) = 'PR' or l.city_code like '41%')",
            Map.of(), UUID.class));
    }

    /**
     * Os produtos que mais vendem (90 dias), com GTIN válido e sem coleta nos
     * últimos {@link #REFRESH_DAYS} dias, até {@code maxProducts}.
     */
    public RunResult collect(UUID marketId, int maxProducts) {
        Location loc = location(marketId);
        if (!loc.inParana() || loc.latitude() == null) {
            return new RunResult(0, 0, 0, 0, 0);
        }
        String geohash = Geohash.encode(loc.latitude(), loc.longitude(), 7);
        List<Map<String, Object>> products = jdbc.queryForList(
            "select p.id, p.ean, p.name, sum(it.valor_total) / nullif(sum(it.quantidade), 0) as own_price_90, "
                + "  sum(it.valor_total) filter (where i.data_emissao >= now() - interval '14 days') "
                + "    / nullif(sum(it.quantidade) filter (where i.data_emissao >= now() - interval '14 days'), 0) as own_price_14 "
                + "from invoice_items it join invoices i on i.id = it.invoice_id join products p on p.id = it.product_id "
                + "where i.market_id = :m and i.data_emissao >= now() - interval '90 days' and p.ean ~ '^[0-9]{8,14}$' "
                + "and not exists (select 1 from local_price_snapshots s where s.market_id = :m and s.product_id = p.id "
                + "  and s.collected_on > current_date - " + REFRESH_DAYS + ") "
                + "group by p.id, p.ean, p.name order by sum(it.valor_total) desc limit :n",
            new MapSqlParameterSource("m", marketId).addValue("n", maxProducts));
        int ok = 0, few = 0, none = 0, errors = 0;
        for (Map<String, Object> p : products) {
            String gtin = String.valueOf(p.get("ean"));
            if (!validGtin(gtin)) continue;
            try {
                Snapshot s = query(gtin, String.valueOf(p.get("name")), geohash, RADIUS_KM);
                if (s.stores() < MIN_STORES) {
                    Snapshot wide = query(gtin, String.valueOf(p.get("name")), geohash, WIDE_RADIUS_KM);
                    if (wide.stores() > s.stores()) s = wide;
                }
                BigDecimal own = p.get("own_price_14") != null ? (BigDecimal) p.get("own_price_14") : (BigDecimal) p.get("own_price_90");
                save(marketId, (UUID) p.get("id"), s, own);
                switch (s.status()) {
                    case "OK" -> ok++;
                    case "POUCAS_LOJAS" -> few++;
                    default -> none++;
                }
            } catch (Exception e) {
                errors++;
                log.debug("Menor Preço falhou para {}: {}", gtin, e.getMessage());
                if (errors >= 10 && errors > ok) {
                    log.warn("Menor Preço instável: parando a coleta do mercado {} após {} erros", marketId, errors);
                    break;
                }
            }
        }
        log.info("Preço da vizinhança (mercado {}): {} produtos, {} com referência, {} com poucas lojas, {} sem dados, {} erros",
            marketId, products.size(), ok, few, none, errors);
        return new RunResult(products.size(), ok, few, none, errors);
    }

    public record Offer(String store, String description, BigDecimal price, double distanceKm, LocalDate seen) { }

    public record Snapshot(String status, int radiusKm, int stores, int discarded, BigDecimal median, BigDecimal p25,
                           BigDecimal p75, Offer cheapest, LocalDate newest) { }

    Snapshot query(String gtin, String ourName, String geohash, int radiusKm) throws Exception {
        List<JsonNode> raw = new ArrayList<>();
        for (int offset = 0; offset < 100; offset += 50) {
            String url = API + "?local=" + geohash + "&gtin=" + URLEncoder.encode(gtin, StandardCharsets.UTF_8)
                + "&offset=" + offset + "&raio=" + radiusKm + "&data=-1&ordem=1";
            Thread.sleep(PAUSE_MS);
            HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(25))
                .header("User-Agent", "MercadoFlow/1.0 (+https://mercadoflow.com)").header("Accept", "application/json")
                .GET().build(), HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() != 200) throw new IllegalStateException("HTTP " + r.statusCode());
            JsonNode page = json.readTree(r.body()).path("produtos");
            if (!page.isArray() || page.isEmpty()) break;
            page.forEach(raw::add);
            if (page.size() < 25) break;
        }
        return summarize(raw, ourName, radiusKm);
    }

    /** Limpeza e resumo (público no pacote para os testes). */
    static Snapshot summarize(List<JsonNode> raw, String ourName, int radiusKm) {
        LocalDate oldest = LocalDate.now().minusDays(MAX_AGE_DAYS);
        Map<String, Offer> byStore = new LinkedHashMap<>();
        int discarded = 0;
        for (JsonNode n : raw) {
            JsonNode e = n.path("estabelecimento");
            String storeId = e.path("codigo").asText("");
            String store = !e.path("nm_fan").asText("").isBlank() ? e.path("nm_fan").asText() : e.path("nm_emp").asText("");
            String desc = n.path("desc").asText("");
            BigDecimal price;
            LocalDate seen;
            try {
                price = new BigDecimal(n.path("valor").asText("0"));
                seen = OffsetDateTime.parse(n.path("datahora").asText()).toLocalDate();
            } catch (Exception ex) {
                discarded++;
                continue;
            }
            if (price.signum() <= 0 || seen.isBefore(oldest) || storeId.isBlank()
                || TextMatch.notGrocery(store + " " + e.path("nm_emp").asText("")) || !TextMatch.sameProduct(ourName, desc)) {
                discarded++;
                continue;
            }
            Offer o = new Offer(store.isBlank() ? "Loja" : store, desc, price, n.path("distkm").asDouble(0), seen);
            Offer prev = byStore.get(storeId);
            if (prev == null || o.seen().isAfter(prev.seen())) {
                if (prev != null) discarded++;
                byStore.put(storeId, o);
            } else {
                discarded++;
            }
        }
        List<Offer> offers = new ArrayList<>(byStore.values());
        // Preço absurdo (erro de digitação, brinde, fardo): fora de metade a dobro da mediana.
        if (offers.size() >= 3) {
            BigDecimal med = percentile(offers.stream().map(Offer::price).sorted().toList(), 0.5);
            List<Offer> kept = offers.stream()
                .filter(o -> o.price().compareTo(med.multiply(BigDecimal.valueOf(0.5))) >= 0
                    && o.price().compareTo(med.multiply(BigDecimal.valueOf(2))) <= 0)
                .toList();
            discarded += offers.size() - kept.size();
            offers = new ArrayList<>(kept);
        }
        if (offers.isEmpty()) {
            return new Snapshot("SEM_DADOS", radiusKm, 0, discarded, null, null, null, null, null);
        }
        List<BigDecimal> prices = offers.stream().map(Offer::price).sorted().toList();
        Offer cheapest = Collections.min(offers, (a, b) -> a.price().compareTo(b.price()) != 0
            ? a.price().compareTo(b.price()) : Double.compare(a.distanceKm(), b.distanceKm()));
        LocalDate newest = offers.stream().map(Offer::seen).max(LocalDate::compareTo).orElse(null);
        return new Snapshot(offers.size() >= MIN_STORES ? "OK" : "POUCAS_LOJAS", radiusKm, offers.size(), discarded,
            percentile(prices, 0.5), percentile(prices, 0.25), percentile(prices, 0.75), cheapest, newest);
    }

    static BigDecimal percentile(List<BigDecimal> sorted, double q) {
        if (sorted.isEmpty()) return null;
        double pos = q * (sorted.size() - 1);
        int lo = (int) Math.floor(pos);
        int hi = (int) Math.ceil(pos);
        BigDecimal a = sorted.get(lo);
        BigDecimal b = sorted.get(hi);
        return a.add(b.subtract(a).multiply(BigDecimal.valueOf(pos - lo))).setScale(2, RoundingMode.HALF_UP);
    }

    private void save(UUID marketId, UUID productId, Snapshot s, BigDecimal own) {
        jdbc.update("insert into local_price_snapshots (market_id, product_id, collected_on, provider, status, radius_km, stores, discarded, "
                + "median_price, p25_price, p75_price, min_price, min_store, min_distance_km, own_price, newest_seen) "
                + "values (:m, :p, current_date, '" + PROVIDER + "', :st, :r, :n, :d, :med, :p25, :p75, :min, :ms, :md, :own, :nw) "
                + "on conflict (market_id, product_id, collected_on) do update set status = excluded.status, radius_km = excluded.radius_km, "
                + "stores = excluded.stores, discarded = excluded.discarded, median_price = excluded.median_price, p25_price = excluded.p25_price, "
                + "p75_price = excluded.p75_price, min_price = excluded.min_price, min_store = excluded.min_store, "
                + "min_distance_km = excluded.min_distance_km, own_price = excluded.own_price, newest_seen = excluded.newest_seen",
            new MapSqlParameterSource("m", marketId).addValue("p", productId).addValue("st", s.status()).addValue("r", s.radiusKm())
                .addValue("n", s.stores()).addValue("d", s.discarded()).addValue("med", s.median()).addValue("p25", s.p25())
                .addValue("p75", s.p75()).addValue("min", s.cheapest() == null ? null : s.cheapest().price())
                .addValue("ms", s.cheapest() == null ? null : truncate(s.cheapest().store(), 160))
                .addValue("md", s.cheapest() == null ? null : BigDecimal.valueOf(s.cheapest().distanceKm()).setScale(2, RoundingMode.HALF_UP))
                .addValue("own", own == null ? null : own.setScale(2, RoundingMode.HALF_UP))
                .addValue("nw", s.newest() == null ? null : Date.valueOf(s.newest())));
    }

    private static String truncate(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }

    static boolean validGtin(String g) {
        if (g == null || !(g.length() == 8 || g.length() == 12 || g.length() == 13 || g.length() == 14)) return false;
        if (g.chars().distinct().count() == 1) return false;
        int sum = 0;
        for (int i = 0; i < g.length() - 1; i++) {
            int d = g.charAt(g.length() - 2 - i) - '0';
            sum += (i % 2 == 0) ? d * 3 : d;
        }
        return (10 - sum % 10) % 10 == g.charAt(g.length() - 1) - '0';
    }

    // ---------------------------------------------------------------- leitura

    /** Último resumo de cada produto pedido (até 15 dias). */
    public Map<UUID, Map<String, Object>> latest(UUID marketId, List<UUID> productIds) {
        Map<UUID, Map<String, Object>> out = new LinkedHashMap<>();
        if (productIds.isEmpty()) return out;
        jdbc.queryForList(
            "select distinct on (product_id) product_id, collected_on, status, radius_km, stores, discarded, median_price, p25_price, "
                + "p75_price, min_price, min_store, min_distance_km, own_price, newest_seen from local_price_snapshots "
                + "where market_id = :m and product_id = any(cast(:ids as uuid[])) and collected_on > current_date - 15 "
                + "order by product_id, collected_on desc",
            new MapSqlParameterSource("m", marketId).addValue("ids",
                productIds.stream().map(UUID::toString).collect(java.util.stream.Collectors.joining(",", "{", "}"))))
            .forEach(r -> out.put((UUID) r.get("product_id"), r));
        return out;
    }
}
