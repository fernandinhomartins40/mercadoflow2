package com.pdv2cloud.service.ai.agents;

import com.pdv2cloud.service.art.ArtStudioService;
import com.pdv2cloud.service.opportunity.RecommendationOrderService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Agente de Promoções e encartes: junta as promoções sugeridas pelo motor e,
 * aprovado, deixa um rascunho de encarte pronto no Estúdio, com o preço de
 * oferta já calculado pelo desconto sugerido (que respeita a margem).
 */
@Component
public class PromocoesAgent extends RecommendationBundleAgent {

    private static final Logger log = LoggerFactory.getLogger(PromocoesAgent.class);

    private final ArtStudioService art;

    public PromocoesAgent(NamedParameterJdbcTemplate jdbc, RecommendationOrderService orders, ArtStudioService art) {
        super(jdbc, orders);
        this.art = art;
    }

    @Override
    public String name() {
        return "PROMOCOES";
    }

    @Override
    List<String> actionTypes() {
        return List.of("PROMOVER");
    }

    @Override
    String kind() {
        return "PROMOCAO";
    }

    @Override
    String title(int count, BigDecimal impact) {
        return count == 1 ? "Promoção sugerida: 1 produto para o encarte" : "Promoção sugerida: " + count + " produtos para o encarte";
    }

    @Override
    String line(Map<String, Object> r) {
        StringBuilder sb = new StringBuilder(String.valueOf(r.get("title")));
        if (r.get("desconto") != null) {
            sb.append(": ").append(pct(r.get("desconto"))).append(" de desconto");
            BigDecimal price = ComprasAgent.decimal(r.get("preco"));
            if (price.signum() > 0) {
                sb.append(" (").append(ComprasAgent.money(price)).append(" → ")
                    .append(ComprasAgent.money(offer(price, ComprasAgent.decimal(r.get("desconto"))))).append(')');
            }
        }
        return sb.toString();
    }

    @Override
    String closing() {
        return "Ao aprovar, o Copiloto monta o rascunho do encarte no Estúdio com esses preços. Você revisa e publica.";
    }

    @Override
    @SuppressWarnings("unchecked")
    public Map<String, Object> execute(UUID marketId, Map<String, Object> payload, String actor) {
        Map<String, Object> out = new LinkedHashMap<>(super.execute(marketId, payload, actor));
        List<String> recIds = (List<String>) payload.getOrDefault("recommendationIds", List.of());
        if (recIds.isEmpty()) {
            return out;
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select p.id, p.name, p.image_url, r.parameters->>'precoAtual' as preco, r.parameters->>'descontoPercent' as desconto "
                + "from recommendations r join products p on p.id = cast(r.parameters->>'produtoId' as uuid) "
                + "where r.market_id = :m and r.id in (:ids) and r.parameters->>'produtoId' is not null",
            new MapSqlParameterSource().addValue("m", marketId).addValue("ids", recIds.stream().map(UUID::fromString).toList()));
        List<Map<String, Object>> items = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            BigDecimal price = ComprasAgent.decimal(r.get("preco"));
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("key", UUID.randomUUID().toString());
            item.put("productId", String.valueOf(r.get("id")));
            item.put("name", r.get("name"));
            item.put("price", price.signum() > 0 ? offer(price, ComprasAgent.decimal(r.get("desconto"))) : null);
            item.put("oldPrice", price.signum() > 0 ? price.setScale(2, RoundingMode.HALF_UP) : null);
            item.put("unit", "un");
            item.put("imageUrl", r.get("image_url"));
            items.add(item);
        }
        if (items.isEmpty()) {
            return out;
        }
        try {
            ArtStudioService.Campaign c = art.createCampaign(marketId, Map.of("title", "Promoção sugerida pelo Copiloto",
                "content", Map.of("products", items, "headline", "Ofertas da semana")));
            out.put("encarteId", c.id().toString());
            out.put("encarteUrl", "/app/encartes/" + c.id());
        } catch (RuntimeException e) {
            log.warn("Rascunho de encarte não criado: {}", e.getMessage());
        }
        return out;
    }

    /** Desfaz as aceitações e apaga o rascunho do encarte, se ainda não foi publicado. */
    @Override
    public Map<String, Object> undo(UUID marketId, Map<String, Object> payload, Map<String, Object> result, String actor) {
        Map<String, Object> out = new LinkedHashMap<>(super.undo(marketId, payload, result, actor));
        Object encarte = result == null ? null : result.get("encarteId");
        if (encarte != null) {
            try {
                UUID id = UUID.fromString(String.valueOf(encarte));
                if ("DRAFT".equals(art.campaign(marketId, id).status())) {
                    art.deleteCampaign(marketId, id);
                    out.put("encarteApagado", true);
                } else {
                    out.put("encarteApagado", false);
                }
            } catch (RuntimeException e) {
                out.put("encarteApagado", false);
            }
        }
        return out;
    }

    /** Preço de oferta: desconto sobre o preço atual, em centavos. */
    public static BigDecimal offer(BigDecimal price, BigDecimal discountPercent) {
        return price.multiply(BigDecimal.ONE.subtract(discountPercent.movePointLeft(2))).setScale(2, RoundingMode.HALF_UP);
    }
}
