package com.pdv2cloud.service.partner;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.tenancy.TenantContext;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Avisos que saem para o ERP: só o que o DONO decidiu — pedido enviado ao
 * fornecedor e preço aprovado. Nunca o porquê, o giro ou a sugestão original.
 *
 * Fila em partner_webhook_events; o envio (job) assina o corpo com HMAC-SHA256
 * do segredo do parceiro e tenta de novo com espera crescente (até 8 vezes).
 */
@Service
@Slf4j
public class PartnerWebhookService {

    public static final String EVENT_ORDER_SENT = "order.sent";
    public static final String EVENT_PRICE_APPROVED = "price.approved";
    static final int MAX_ATTEMPTS = 8;

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public PartnerWebhookService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Enfileira para cada parceiro autorizado pela loja com o escopo do evento e com webhook configurado. */
    public int enqueue(UUID marketId, String event, Map<String, Object> payload) {
        String scope = EVENT_ORDER_SENT.equals(event) ? "orders:read" : "prices:read";
        return TenantContext.runAsSystem(() -> {
            List<UUID> partners = jdbc.query(
                "select l.partner_id from partner_market_links l join integration_partners p on p.id = l.partner_id " +
                "where l.market_id = :m and l.status = 'ATIVO' and :s = any(l.scopes) and p.webhook_url is not null and p.status <> 'SUSPENSO'",
                new MapSqlParameterSource("m", marketId).addValue("s", scope), (rs, n) -> rs.getObject("partner_id", UUID.class));
            String body;
            try {
                Map<String, Object> envelope = new LinkedHashMap<>();
                envelope.put("event", event);
                envelope.put("marketId", marketId);
                envelope.put("occurredAt", LocalDateTime.now().toString());
                envelope.put("data", payload);
                body = json.writeValueAsString(envelope);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
            for (UUID p : partners) {
                jdbc.update("insert into partner_webhook_events (partner_id, market_id, event, payload) values (:p, :m, :e, cast(:b as jsonb))",
                    new MapSqlParameterSource("p", p).addValue("m", marketId).addValue("e", event).addValue("b", body));
            }
            return partners.size();
        });
    }

    /** Pedido enviado ao fornecedor (o ERP dá entrada sem digitar). */
    public void orderSent(UUID marketId, UUID orderId) {
        try {
            Map<String, Object> order = TenantContext.runAsSystem(() -> jdbc.queryForMap(
                "select so.order_number, so.sent_at, so.total_value, s.cnpj, s.razao_social from supplier_orders so " +
                "join suppliers s on s.id = so.supplier_id where so.id = :o and so.market_id = :m",
                new MapSqlParameterSource("o", orderId).addValue("m", marketId)));
            List<Map<String, Object>> items = TenantContext.runAsSystem(() -> jdbc.queryForList(
                "select p.ean as gtin, p.name as description, i.quantity_requested as quantity, i.unit_type, i.units_per_pack, i.unit_cost " +
                "from supplier_order_items i join products p on p.id = i.product_id where i.supplier_order_id = :o",
                new MapSqlParameterSource("o", orderId)));
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("orderNumber", order.get("order_number"));
            data.put("sentAt", String.valueOf(order.get("sent_at")));
            data.put("supplierCnpj", order.get("cnpj"));
            data.put("supplierName", order.get("razao_social"));
            data.put("totalValue", order.get("total_value"));
            data.put("items", items);
            enqueue(marketId, EVENT_ORDER_SENT, data);
        } catch (RuntimeException e) {
            // O aviso ao ERP nunca pode impedir o pedido de sair.
            log.warn("Aviso de pedido ao ERP falhou (mercado {}, pedido {}): {}", marketId, orderId, e.getMessage());
        }
    }

    /** Preço aprovado pelo dono (o ERP atualiza a etiqueta e o caixa). */
    public void priceApproved(UUID marketId, UUID productId, BigDecimal price, String approvedBy) {
        if (productId == null || price == null || price.signum() <= 0) return;
        try {
            String gtin = TenantContext.runAsSystem(() -> jdbc.queryForObject("select ean from products where id = :p",
                new MapSqlParameterSource("p", productId), String.class));
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("gtin", gtin);
            data.put("price", price);
            data.put("approvedBy", approvedBy);
            enqueue(marketId, EVENT_PRICE_APPROVED, data);
        } catch (RuntimeException e) {
            log.warn("Aviso de preço ao ERP falhou (mercado {}, produto {}): {}", marketId, productId, e.getMessage());
        }
    }

    /** Preço aprovado a partir de uma recomendação de ajuste de preço aceita. */
    public void priceApprovedFromRecommendation(UUID marketId, UUID recommendationId, String approvedBy) {
        try {
            List<Map<String, Object>> r = TenantContext.runAsSystem(() -> jdbc.queryForList(
                "select coalesce(op.product_id, cast(r.parameters->>'produtoId' as uuid)) as product_id, " +
                "  coalesce(r.parameters->>'precoInformado', r.parameters->>'precoNovo', r.parameters->>'precoReferencia') as price " +
                "from recommendations r join opportunities op on op.id = r.opportunity_id " +
                "where r.id = :r and r.market_id = :m and r.action_type = 'AJUSTAR_PRECO' and r.status in ('ACEITA', 'EXECUTADA')",
                new MapSqlParameterSource("r", recommendationId).addValue("m", marketId)));
            if (r.isEmpty() || r.get(0).get("price") == null) return;
            priceApproved(marketId, (UUID) r.get(0).get("product_id"), new BigDecimal(String.valueOf(r.get(0).get("price"))), approvedBy);
        } catch (RuntimeException e) {
            log.warn("Aviso de preço ao ERP falhou (recomendação {}): {}", recommendationId, e.getMessage());
        }
    }

    static String sign(String secret, String body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Envia o que está na fila e venceu a espera. Devolve quantos foram entregues. */
    public int deliverDue() {
        return TenantContext.runAsSystem(() -> {
            List<Map<String, Object>> due = jdbc.queryForList(
                "select e.id, e.event, e.payload::text as body, e.attempts, p.webhook_url, p.webhook_secret from partner_webhook_events e " +
                "join integration_partners p on p.id = e.partner_id where e.status = 'PENDENTE' and e.next_attempt_at <= now() " +
                "and p.webhook_url is not null order by e.created_at limit 50", Map.of());
            int delivered = 0;
            for (Map<String, Object> e : due) {
                String body = String.valueOf(e.get("body"));
                String error = null;
                try {
                    HttpRequest req = HttpRequest.newBuilder(URI.create(String.valueOf(e.get("webhook_url"))))
                        .timeout(Duration.ofSeconds(15))
                        .header("Content-Type", "application/json")
                        .header("X-MercadoFlow-Event", String.valueOf(e.get("event")))
                        .header("X-MercadoFlow-Delivery", String.valueOf(e.get("id")))
                        .header("X-MercadoFlow-Signature", "sha256=" + sign(String.valueOf(e.get("webhook_secret")), body))
                        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)).build();
                    HttpResponse<Void> res = http.send(req, HttpResponse.BodyHandlers.discarding());
                    if (res.statusCode() / 100 != 2) error = "HTTP " + res.statusCode();
                } catch (Exception ex) {
                    error = ex.getClass().getSimpleName() + ": " + ex.getMessage();
                }
                int attempts = ((Number) e.get("attempts")).intValue() + 1;
                if (error == null) {
                    jdbc.update("update partner_webhook_events set status = 'ENTREGUE', attempts = :a, delivered_at = now(), last_error = null where id = :id",
                        new MapSqlParameterSource("a", attempts).addValue("id", e.get("id")));
                    delivered++;
                } else {
                    jdbc.update("update partner_webhook_events set attempts = :a, last_error = :err, " +
                        "status = case when :a >= " + MAX_ATTEMPTS + " then 'FALHOU' else 'PENDENTE' end, " +
                        "next_attempt_at = now() + make_interval(mins => :wait) where id = :id",
                        new MapSqlParameterSource("a", attempts).addValue("err", error.length() > 500 ? error.substring(0, 500) : error)
                            .addValue("wait", attempts * attempts).addValue("id", e.get("id")));
                }
            }
            return delivered;
        });
    }
}
