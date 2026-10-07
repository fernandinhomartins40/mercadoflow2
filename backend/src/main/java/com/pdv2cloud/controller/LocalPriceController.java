package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.localprice.LocalPriceService;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Preço da vizinhança (só Paraná): estado da função, local da loja e os resumos por produto. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{id}/local-prices")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class LocalPriceController {

    private final LocalPriceService prices;
    private final MarketAccessService access;
    private final NamedParameterJdbcTemplate jdbc;

    public LocalPriceController(LocalPriceService prices, MarketAccessService access, NamedParameterJdbcTemplate jdbc) {
        this.prices = prices;
        this.access = access;
        this.jdbc = jdbc;
    }

    @GetMapping
    public Map<String, Object> status(@PathVariable("id") UUID id, Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        LocalPriceService.Location loc = prices.location(id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("available", loc.inParana() && loc.latitude() != null);
        out.put("inParana", loc.inParana());
        out.put("knownLocation", loc.uf() != null);
        out.put("onlyParana", LocalPriceService.ONLY_PR);
        out.put("provider", LocalPriceService.PROVIDER_LABEL);
        out.put("providerUrl", "https://menorpreco.notaparana.pr.gov.br/");
        out.put("uf", loc.uf());
        out.put("city", loc.city());
        out.put("geoSource", loc.geoSource());
        out.put("running", prices.isRunning(id));
        out.putAll(jdbc.queryForMap(
            "select count(distinct product_id) filter (where status = 'OK') as \"productsWithReference\", "
                + "count(distinct product_id) as \"productsChecked\", max(collected_on) as \"lastCollectedOn\" "
                + "from local_price_snapshots where market_id = :m and collected_on > current_date - 15",
            new MapSqlParameterSource("m", id)));
        return out;
    }

    /** Localização marcada pelo dono (GPS do navegador), mais precisa que o centro do município. */
    @PutMapping("/location")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'ADMIN')")
    public Map<String, Object> location(@PathVariable("id") UUID id, @RequestBody Map<String, Object> body, Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        if (!(body.get("latitude") instanceof Number lat) || !(body.get("longitude") instanceof Number lon)) {
            throw new IllegalArgumentException("Envie latitude e longitude.");
        }
        prices.setCoordinates(id, lat.doubleValue(), lon.doubleValue());
        return status(id, authentication);
    }

    /** Busca agora os 60 produtos que mais vendem e ainda não têm referência recente (leva alguns minutos). */
    @PostMapping("/refresh")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'ADMIN')")
    public ResponseEntity<Map<String, Object>> refresh(@PathVariable("id") UUID id, Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        LocalPriceService.Location loc = prices.location(id);
        if (!loc.inParana()) throw new IllegalArgumentException(LocalPriceService.ONLY_PR);
        if (loc.latitude() == null) throw new IllegalArgumentException("Marque a localização da loja primeiro.");
        boolean started = prices.collectInBackground(id, 60);
        return ResponseEntity.accepted().body(Map.of("started", started, "running", true));
    }

    @GetMapping("/products")
    public List<Map<String, Object>> products(@PathVariable("id") UUID id, @RequestParam("ids") String ids, Authentication authentication) {
        access.assertCanAccessMarket(id, authentication);
        List<UUID> list = Arrays.stream(ids.split(",")).map(String::trim).filter(s -> !s.isEmpty()).limit(200).map(UUID::fromString).toList();
        return List.copyOf(prices.latest(id, list).values());
    }
}
