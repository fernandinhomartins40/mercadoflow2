package com.pdv2cloud.service.commerce;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Quem é o vendedor da sessão. Entra pelo portal de vendas o usuário de
 * vendedor (SELLER_USER) e o usuário de indústria (INDUSTRY_USER) cuja empresa
 * tem um vendedor ligado.
 */
@Service
public class SellerAccessService {

    /** Vendedor visto pela sessão. */
    public record Seller(UUID id, String kind, String cnpj, String name, String status, UUID industryId, String salesMode,
                         String userEmail) {

        public boolean industry() {
            return "INDUSTRIA".equals(kind);
        }

        public boolean active() {
            return "ATIVO".equals(status);
        }
    }

    public static class Denied extends RuntimeException {
        private final int status;

        public Denied(int status, String message) {
            super(message);
            this.status = status;
        }

        public int status() {
            return status;
        }
    }

    private final NamedParameterJdbcTemplate jdbc;

    public SellerAccessService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Vendedor do usuário em qualquer situação (o portal explica o que falta). */
    public Seller of(String email) {
        List<Map<String, Object>> rows = jdbc.queryForList("select s.id, s.kind, s.cnpj, coalesce(s.trade_name, s.legal_name) as name, "
            + "s.status, s.industry_id, s.sales_mode from users u join commerce_sellers s on "
            + "(u.role = 'SELLER_USER' and s.id = u.seller_id) or (u.role = 'INDUSTRY_USER' and s.industry_id = u.industry_id) "
            + "where lower(u.email) = lower(:e) and coalesce(u.is_active, true) limit 1", Map.of("e", email));
        if (rows.isEmpty()) {
            throw new Denied(403, "Este acesso não está ligado a um vendedor. Fale com o MercadoFlow para ativar as vendas.");
        }
        Map<String, Object> r = rows.get(0);
        return new Seller((UUID) r.get("id"), (String) r.get("kind"), (String) r.get("cnpj"), (String) r.get("name"),
            (String) r.get("status"), (UUID) r.get("industry_id"), (String) r.get("sales_mode"), email);
    }

    /** Vendedor aprovado: exigido para publicar, vender e ver clientes. */
    public Seller active(String email) {
        Seller s = of(email);
        if (!s.active()) {
            throw new Denied(403, "SUSPENSO".equals(s.status())
                ? "As vendas da sua empresa estão suspensas. Fale com o MercadoFlow."
                : "O cadastro da sua empresa ainda está em análise.");
        }
        return s;
    }
}
