package com.pdv2cloud.service.partner;

import com.pdv2cloud.tenancy.TenantContext;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Desconto no plano do MercadoFlow para quem é cliente ativo do parceiro da
 * casa (Bipae). Vale enquanto as três coisas forem verdade:
 *  - a loja (ou uma filial da rede) está vinculada ao parceiro;
 *  - o parceiro diz que ela é cliente ativo dele;
 *  - o super admin definiu um percentual para o parceiro.
 * Só o plano tem desconto; adicionais e pacotes do Confere, não.
 */
@Service
public class PartnerDiscount {

    public record Discount(UUID partnerId, String partnerName, int percent) { }

    private final NamedParameterJdbcTemplate jdbc;

    public PartnerDiscount(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** O maior desconto em vigor para a assinatura da rede; null quando não há. */
    public Discount forRoot(UUID rootId) {
        if (rootId == null) return null;
        List<Discount> found = TenantContext.runAsSystem(() -> jdbc.query(
            "select p.id, p.name, p.plan_discount_percent from partner_market_links l " +
            "join integration_partners p on p.id = l.partner_id join markets m on m.id = l.market_id " +
            "where (m.id = :r or m.parent_market_id = :r) and l.status = 'ATIVO' and l.customer_active " +
            "and p.first_party and p.status <> 'SUSPENSO' and p.plan_discount_percent > 0 " +
            "order by p.plan_discount_percent desc limit 1",
            new MapSqlParameterSource("r", rootId),
            (rs, n) -> new Discount(rs.getObject("id", UUID.class), rs.getString("name"), rs.getInt("plan_discount_percent"))));
        return found.isEmpty() ? null : found.get(0);
    }

    /** Preço com o desconto, arredondado para o centavo. */
    public static int apply(int cents, Discount d) {
        if (d == null || d.percent() <= 0 || cents <= 0) return cents;
        int percent = Math.min(d.percent(), 100);
        return cents - Math.round(cents * percent / 100f);
    }

    public int planPrice(UUID rootId, int cents) {
        return apply(cents, forRoot(rootId));
    }
}
