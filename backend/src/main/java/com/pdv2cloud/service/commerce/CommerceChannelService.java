package com.pdv2cloud.service.commerce;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Motor de canal: decide, para uma loja e um produto, se a oferta de um
 * vendedor chega direto, chega via distribuidor ou não chega.
 *
 * Roda antes de qualquer preço, campanha ou pedido alcançar a loja. As regras
 * vêm dos acordos de distribuição que a indústria dona do produto declarou:
 *
 *  - área EXCLUSIVA: a indústria não vende direto ali (salvo conta direta); a
 *    oferta dela chega via o distribuidor exclusivo. Outro distribuidor só é
 *    barrado quando o acordo pede (block_other_sellers);
 *  - indústria que só vende por distribuidor: a oferta chega via um
 *    distribuidor que atenda a loja, ou não chega;
 *  - loja sem endereço e produto com área exclusiva: não chega (falha fechada).
 *
 * Quem chama precisa enxergar todas as lojas: dentro de TenantContext.runAsSystem
 * no portal de vendas, ou na sessão da própria loja.
 */
@Service
public class CommerceChannelService {

    public static final String DIRETO = "DIRETO";
    public static final String DISTRIBUIDOR = "DISTRIBUIDOR";

    /** Loja vista pelo motor. */
    public record Store(UUID id, String name, String cnpj, String parentCnpj, String uf, String cityCode, String city,
                        boolean receiveCampaigns, boolean sharesData) {

        public boolean located() {
            return uf != null;
        }
    }

    public record SellerRow(UUID id, String kind, String cnpj, String name, String status, String salesMode,
                            List<String> serviceUfs, List<String> serviceCities) {
    }

    record Agreement(UUID id, UUID industrySellerId, UUID distributorSellerId, String distributorCnpj, String distributorName,
                     boolean exclusive, boolean blockOthers, List<String> ufs, List<String> cities, List<String> brands,
                     List<String> gtins, LocalDate startsOn, LocalDate endsOn) {

        boolean territorial() {
            return !ufs.isEmpty() || !cities.isEmpty();
        }

        boolean coversProduct(String gtin, String brand) {
            if (gtins.isEmpty() && brands.isEmpty()) {
                return true;
            }
            return gtins.contains(gtin) || (brand != null && brands.contains(brand.trim().toUpperCase(Locale.ROOT)));
        }

        boolean coversStore(Store s) {
            if (!territorial()) {
                return true;
            }
            return s.located() && (ufs.contains(s.uf()) || (s.cityCode() != null && cities.contains(s.cityCode())));
        }

        boolean vigente(LocalDate today) {
            return !startsOn.isAfter(today) && (endsOn == null || !endsOn.isBefore(today));
        }

        boolean is(SellerRow v) {
            return v.id().equals(distributorSellerId) || v.cnpj().equals(distributorCnpj);
        }
    }

    record Owner(UUID sellerId, String brand) {
    }

    /**
     * Resposta do motor. code é estável (para contar por motivo); reason é a
     * frase que a loja e o superadmin leem.
     */
    public record Decision(boolean allowed, String channel, UUID fulfillingSellerId, String distributorCnpj,
                           String distributorName, String code, String reason) {

        static Decision deny(String code, String reason) {
            return new Decision(false, null, null, null, null, code, reason);
        }

        static Decision direct(UUID sellerId, String code, String reason) {
            return new Decision(true, DIRETO, sellerId, null, null, code, reason);
        }
    }

    /** Fotografia das regras para uma requisição: vendedores, acordos, contas diretas e donas dos produtos. */
    public static final class Rules {
        final Map<UUID, SellerRow> sellers = new HashMap<>();
        final Map<String, UUID> sellerByCnpj = new HashMap<>();
        final Map<UUID, List<Agreement>> agreements = new HashMap<>();
        final Map<UUID, Set<String>> directAccounts = new HashMap<>();
        final Map<String, Owner> owners = new HashMap<>();
        final LocalDate today = LocalDate.now();

        public SellerRow seller(UUID id) {
            return sellers.get(id);
        }
    }

    private final NamedParameterJdbcTemplate jdbc;

    public CommerceChannelService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Rules rules() {
        Rules r = new Rules();
        for (Map<String, Object> s : jdbc.queryForList("select id, kind, cnpj, coalesce(trade_name, legal_name) as name, status, sales_mode, "
            + "service_ufs, service_cities from commerce_sellers", Map.of())) {
            SellerRow row = new SellerRow((UUID) s.get("id"), (String) s.get("kind"), (String) s.get("cnpj"), (String) s.get("name"),
                (String) s.get("status"), (String) s.get("sales_mode"), Sql.array(s.get("service_ufs")), Sql.array(s.get("service_cities")));
            r.sellers.put(row.id(), row);
            r.sellerByCnpj.put(row.cnpj(), row.id());
        }
        for (Map<String, Object> a : jdbc.queryForList("select * from commerce_distribution_agreements where status = 'ATIVO'", Map.of())) {
            Agreement ag = new Agreement((UUID) a.get("id"), (UUID) a.get("industry_seller_id"), (UUID) a.get("distributor_seller_id"),
                (String) a.get("distributor_cnpj"), (String) a.get("distributor_name"), "EXCLUSIVO".equals(a.get("exclusivity")),
                Boolean.TRUE.equals(a.get("block_other_sellers")), Sql.array(a.get("scope_ufs")), Sql.array(a.get("scope_cities")),
                Sql.array(a.get("scope_brands")).stream().map(b -> b.trim().toUpperCase(Locale.ROOT)).toList(),
                Sql.array(a.get("scope_gtins")), ((java.sql.Date) a.get("starts_on")).toLocalDate(),
                a.get("ends_on") == null ? null : ((java.sql.Date) a.get("ends_on")).toLocalDate());
            if (ag.vigente(r.today)) {
                r.agreements.computeIfAbsent(ag.industrySellerId(), k -> new ArrayList<>()).add(ag);
            }
        }
        for (Map<String, Object> d : jdbc.queryForList("select industry_seller_id, cnpj from commerce_direct_accounts", Map.of())) {
            r.directAccounts.computeIfAbsent((UUID) d.get("industry_seller_id"), k -> new HashSet<>()).add((String) d.get("cnpj"));
        }
        for (Map<String, Object> p : jdbc.queryForList("select gtin, seller_id, brand from commerce_seller_products "
            + "where owner and status in ('ATIVO', 'PAUSADO')", Map.of())) {
            r.owners.put((String) p.get("gtin"), new Owner((UUID) p.get("seller_id"), (String) p.get("brand")));
        }
        return r;
    }

    private static final String STORE_SQL = "select m.id, m.name, regexp_replace(coalesce(m.cnpj, ''), '\\D', '', 'g') as cnpj, "
        + "regexp_replace(coalesce(pm.cnpj, ''), '\\D', '', 'g') as parent_cnpj, l.uf, l.city_code, l.city, "
        + "coalesce(cp.receive_campaigns, true) as receive_campaigns, coalesce(dp.status, 'PARTICIPA') <> 'SAIU' as shares_data "
        + "from markets m left join markets pm on pm.id = m.parent_market_id left join market_locations l on l.market_id = m.id "
        + "left join market_commerce_preferences cp on cp.market_id = m.id "
        + "left join market_data_participation dp on dp.market_id = m.id where coalesce(m.is_active, true)";

    private static Store store(Map<String, Object> m) {
        return new Store((UUID) m.get("id"), (String) m.get("name"), (String) m.get("cnpj"), (String) m.get("parent_cnpj"),
            (String) m.get("uf"), (String) m.get("city_code"), (String) m.get("city"),
            Boolean.TRUE.equals(m.get("receive_campaigns")), Boolean.TRUE.equals(m.get("shares_data")));
    }

    public Store store(UUID marketId) {
        List<Map<String, Object>> rows = jdbc.queryForList(STORE_SQL + " and m.id = :m", Map.of("m", marketId));
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Loja não encontrada.");
        }
        return store(rows.get(0));
    }

    /** Todas as lojas ativas (só como sistema). */
    public List<Store> stores() {
        return jdbc.queryForList(STORE_SQL, Map.of()).stream().map(CommerceChannelService::store).toList();
    }

    /** O que a loja decidiu sobre cada vendedor: AUTORIZADA ou BLOQUEADA. */
    public Map<UUID, String> consents(UUID marketId) {
        Map<UUID, String> out = new HashMap<>();
        for (Map<String, Object> c : jdbc.queryForList("select seller_id, status from market_seller_consents where market_id = :m",
            Map.of("m", marketId))) {
            out.put((UUID) c.get("seller_id"), (String) c.get("status"));
        }
        return out;
    }

    /** O que todas as lojas decidiram sobre um vendedor (só como sistema). */
    public Map<UUID, String> consentsOf(UUID sellerId) {
        Map<UUID, String> out = new HashMap<>();
        for (Map<String, Object> c : jdbc.queryForList("select market_id, status from market_seller_consents where seller_id = :s",
            Map.of("s", sellerId))) {
            out.put((UUID) c.get("market_id"), (String) c.get("status"));
        }
        return out;
    }

    /**
     * A decisão para um vendedor, uma loja e um produto.
     *
     * @param consent o que a loja decidiu sobre este vendedor (null = nada)
     */
    public Decision decide(Rules r, SellerRow v, Store s, String gtin, String consent) {
        if (!"ATIVO".equals(v.status())) {
            return Decision.deny("VENDEDOR_INATIVO", "O vendedor não está ativo na plataforma.");
        }
        if ("BLOQUEADA".equals(consent)) {
            return Decision.deny("LOJA_BLOQUEOU", "A loja bloqueou este vendedor.");
        }
        if (!v.serviceUfs().isEmpty() || !v.serviceCities().isEmpty()) {
            if (!s.located()) {
                return Decision.deny("SEM_LOCALIZACAO", "A loja não tem endereço cadastrado para conferir a área de entrega.");
            }
            if (!v.serviceUfs().contains(s.uf()) && (s.cityCode() == null || !v.serviceCities().contains(s.cityCode()))) {
                return Decision.deny("FORA_DA_AREA", v.name() + " não entrega em " + place(s) + ".");
            }
        }

        Owner owner = r.owners.get(gtin);
        if (owner == null) {
            return Decision.direct(v.id(), "DIRETO", "Sem acordo de distribuição para este produto.");
        }
        boolean isOwner = v.id().equals(owner.sellerId());
        SellerRow industry = r.sellers.get(owner.sellerId());
        List<Agreement> all = r.agreements.getOrDefault(owner.sellerId(), List.of()).stream()
            .filter(a -> a.coversProduct(gtin, owner.brand())).toList();

        if (!s.located() && all.stream().anyMatch(a -> a.exclusive() && a.territorial())) {
            return Decision.deny("SEM_LOCALIZACAO",
                "A loja não tem endereço cadastrado e este produto tem área de distribuição exclusiva.");
        }
        List<Agreement> covering = all.stream().filter(a -> a.coversStore(s)).toList();
        List<Agreement> exclusive = covering.stream().filter(Agreement::exclusive).toList();
        boolean directAccount = isOwner && isDirectAccount(r, owner.sellerId(), s);

        if (!exclusive.isEmpty()) {
            if (isOwner) {
                if (directAccount) {
                    return Decision.direct(v.id(), "CONTA_DIRETA", "Conta atendida direto pela indústria.");
                }
                Agreement ag = pick(exclusive, s, gtin);
                return via(r, ag, place(s) + " é área exclusiva de " + ag.distributorName() + ".");
            }
            if (exclusive.stream().anyMatch(a -> a.is(v))) {
                return Decision.direct(v.id(), "DISTRIBUIDOR_EXCLUSIVO", v.name() + " é o distribuidor exclusivo da área.");
            }
            if (exclusive.stream().anyMatch(Agreement::blockOthers)) {
                return Decision.deny("AREA_EXCLUSIVA", "Produto com distribuição exclusiva nesta área"
                    + (industry == null ? "." : ", definida por " + industry.name() + "."));
            }
            return Decision.direct(v.id(), "DIRETO", "Há distribuidor exclusivo na área, sem restrição a outros vendedores.");
        }

        if (isOwner && "DISTRIBUIDOR".equals(v.salesMode())) {
            if (directAccount) {
                return Decision.direct(v.id(), "CONTA_DIRETA", "Conta atendida direto pela indústria.");
            }
            if (covering.isEmpty()) {
                return Decision.deny("SEM_DISTRIBUIDOR", v.name() + " vende por distribuidor e não tem distribuidor para "
                    + (s.located() ? place(s) : "esta loja") + ".");
            }
            Agreement ag = pick(covering, s, gtin);
            return via(r, ag, v.name() + " vende por distribuidor; " + ag.distributorName() + " atende " + place(s) + ".");
        }
        return Decision.direct(v.id(), "DIRETO", "Venda direta.");
    }

    private Decision via(Rules r, Agreement ag, String reason) {
        UUID fulfilling = ag.distributorSellerId() != null ? ag.distributorSellerId() : r.sellerByCnpj.get(ag.distributorCnpj());
        SellerRow d = fulfilling == null ? null : r.sellers.get(fulfilling);
        if (d == null || !"ATIVO".equals(d.status())) {
            fulfilling = null;
        }
        return new Decision(true, DISTRIBUIDOR, fulfilling, ag.distributorCnpj(), ag.distributorName(), "VIA_DISTRIBUIDOR", reason);
    }

    private static boolean isDirectAccount(Rules r, UUID industrySellerId, Store s) {
        Set<String> accounts = r.directAccounts.get(industrySellerId);
        if (accounts == null) {
            return false;
        }
        return (!s.cnpj().isEmpty() && accounts.contains(s.cnpj())) || (!s.parentCnpj().isEmpty() && accounts.contains(s.parentCnpj()));
    }

    /** Entre vários distribuidores possíveis, prefere o que já abastece a loja (NF-e de entrada); senão, o acordo mais antigo. */
    private Agreement pick(List<Agreement> options, Store s, String gtin) {
        if (options.size() == 1) {
            return options.get(0);
        }
        Set<String> suppliers = suppliersOf(s.id(), gtin);
        return options.stream().filter(a -> suppliers.contains(a.distributorCnpj())).findFirst()
            .orElseGet(() -> options.stream().min(Comparator.comparing(Agreement::startsOn)).orElseThrow());
    }

    /** CNPJs de quem vendeu o produto à loja nos últimos 180 dias, pelas notas de entrada. */
    private Set<String> suppliersOf(UUID marketId, String gtin) {
        return new HashSet<>(jdbc.queryForList("select distinct supplier_cnpj from nfe_document_items where market_id = :m "
            + "and supplier_cnpj is not null and issued_at >= now() - interval '180 days' and gtin is not null and "
            + Sql.canon("gtin") + " = :g", new MapSqlParameterSource().addValue("m", marketId).addValue("g", gtin), String.class));
    }

    private static String place(Store s) {
        return s.city() == null ? (s.uf() == null ? "a região da loja" : s.uf()) : s.city() + " (" + s.uf() + ")";
    }

    /**
     * Decisão para um conjunto de produtos (campanha): todos precisam chegar à
     * loja pelo mesmo canal e, se for via distribuidor, pelo mesmo distribuidor.
     */
    public Decision decideAll(Rules r, SellerRow v, Store s, List<String> gtins, String consent) {
        Decision first = null;
        for (String g : gtins) {
            Decision d = decide(r, v, s, g, consent);
            if (!d.allowed()) {
                return d;
            }
            if (first == null) {
                first = d;
            } else if (!first.channel().equals(d.channel())
                || (DISTRIBUIDOR.equals(d.channel()) && !first.distributorCnpj().equals(d.distributorCnpj()))) {
                return Decision.deny("CANAIS_DIFERENTES", "Os produtos desta campanha chegam à loja por canais diferentes.");
            }
        }
        return first == null ? Decision.deny("SEM_PRODUTOS", "Campanha sem produtos.") : first;
    }
}
