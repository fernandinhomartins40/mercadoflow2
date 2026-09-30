package com.pdv2cloud.service.confere;

import java.sql.Date;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Agregado anônimo de entrada de mercadoria (sell-in) para a inteligência de
 * produto: quanto de cada GTIN entrou em cada bairro, cidade e UF, por semana.
 *
 * Regras de anonimização (LGPD):
 *  - nenhuma coluna guarda o mercado nem o fornecedor;
 *  - só mercados que aceitaram os termos do Confere entram;
 *  - célula com menos lojas que confere_settings.min_stores_per_cell não entra;
 *  - célula em que uma loja sozinha tem mais de {@value #MAX_STORE_SHARE} das
 *    unidades não entra (daria para deduzir a loja).
 */
@Service
public class SellInAggregator {

    static final double MAX_STORE_SHARE = 0.7;

    private final NamedParameterJdbcTemplate jdbc;

    public SellInAggregator(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record Result(LocalDate from, int cells, int minStores) {}

    /** Recalcula as semanas a partir de {@code weeksBack} semanas atrás. */
    @Transactional
    public Result rebuild(int weeksBack) {
        LocalDate from = LocalDate.now().minusWeeks(Math.max(1, weeksBack)).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        int min = minStores();
        MapSqlParameterSource p = new MapSqlParameterSource()
            .addValue("from", Date.valueOf(from)).addValue("min", min).addValue("share", MAX_STORE_SHARE);
        jdbc.update("delete from mf_sellin_weekly where week_start >= :from", p);
        int cells = jdbc.update(
            "with per_store as (" +
            "  select date_trunc('week', i.issued_at)::date as week_start, i.gtin, i.market_id, l.uf, l.city_code, l.city, " +
            "         coalesce(nullif(l.neighborhood, ''), '') as neighborhood, " +
            "         sum(coalesce(i.tax_quantity, i.quantity)) as units, " +
            "         sum(coalesce(i.total, 0) - coalesce(i.discount, 0)) as value, " +
            "         min(i.unit_cost) as mn, max(i.unit_cost) as mx " +
            "  from nfe_document_items i " +
            "  join market_locations l on l.market_id = i.market_id " +
            "  join confere_accounts a on a.market_id = i.market_id and a.terms_version is not null " +
            "  where i.gtin is not null and i.issued_at >= :from and l.uf is not null and l.city_code is not null " +
            // Só venda de mercadoria (x1xx e x4xx); remessa, bonificação e devolução ficam fora.
            "    and (i.cfop is null or substr(i.cfop, 2, 1) in ('1', '4')) " +
            "  group by 1, 2, 3, 4, 5, 6, 7" +
            "), levels as (" +
            "  select week_start, gtin, 'BAIRRO' as level, uf, city_code, city, neighborhood, market_id, units, value, mn, mx " +
            "    from per_store where neighborhood <> '' " +
            "  union all select week_start, gtin, 'CIDADE', uf, city_code, city, '*', market_id, units, value, mn, mx from per_store " +
            "  union all select week_start, gtin, 'UF', uf, '*', null, '*', market_id, units, value, mn, mx from per_store" +
            "), by_store as (" +
            "  select week_start, gtin, level, uf, city_code, max(city) as city, neighborhood, market_id, " +
            "         sum(units) as units, sum(value) as value, min(mn) as mn, max(mx) as mx " +
            "  from levels group by week_start, gtin, level, uf, city_code, neighborhood, market_id" +
            ") " +
            "insert into mf_sellin_weekly (week_start, gtin, level, uf, region, city_code, city, neighborhood, stores, units, value, " +
            "  min_unit_cost, avg_unit_cost, max_unit_cost) " +
            "select week_start, gtin, level, uf, " +
            "  case when uf in ('AC','AM','AP','PA','RO','RR','TO') then 'NORTE' " +
            "       when uf in ('AL','BA','CE','MA','PB','PE','PI','RN','SE') then 'NORDESTE' " +
            "       when uf in ('DF','GO','MS','MT') then 'CENTRO-OESTE' " +
            "       when uf in ('ES','MG','RJ','SP') then 'SUDESTE' else 'SUL' end, " +
            "  city_code, max(city), neighborhood, count(*), sum(units), sum(value), min(mn), " +
            "  sum(value) / nullif(sum(units), 0), max(mx) " +
            "from by_store group by week_start, gtin, level, uf, city_code, neighborhood " +
            "having count(*) >= :min and sum(units) > 0 and max(units) <= cast(:share as numeric) * sum(units)",
            p);
        return new Result(from, cells, min);
    }

    /** Mínimo de lojas por célula: 2 a 50. Menos de 2 identificaria a loja. */
    @Transactional
    public void setMinStores(int value) {
        if (value < 2 || value > 50) {
            throw new IllegalArgumentException("O mínimo de lojas por célula vai de 2 a 50");
        }
        jdbc.update("update confere_settings set min_stores_per_cell = :v where id = 'default'", Map.of("v", value));
    }

    public int minStores() {
        List<Integer> v = jdbc.queryForList("select min_stores_per_cell from confere_settings where id = 'default'", Map.of(), Integer.class);
        return v.isEmpty() || v.get(0) == null ? 3 : Math.max(2, v.get(0));
    }

    // ── Prévia para o superadmin (só dados já agregados) ──────────────────

    public record Traction(String gtin, String productName, String uf, java.math.BigDecimal units4w,
                           java.math.BigDecimal unitsPrev4w, Integer stores, java.math.BigDecimal avgCost,
                           java.math.BigDecimal growthPercent) {}

    public record Coverage(int markets, int marketsWithLocation, int documents, int items, int itemsWithGtin,
                           int stockEntries, int cells, int optedIn, int minStores) {}

    public record Preview(Coverage coverage, List<Traction> traction, List<Map<String, Object>> seasonality,
                          List<Map<String, Object>> cities) {}

    @Transactional(readOnly = true)
    public Preview preview(String uf, String gtin) {
        Coverage c = jdbc.queryForObject(
            "select (select count(*) from confere_accounts where terms_version is not null) as markets, " +
            "(select count(*) from market_locations) as located, (select count(*) from nfe_documents where completeness = 'FULL') as docs, " +
            "(select count(*) from nfe_document_items) as items, (select count(*) from nfe_document_items where gtin is not null) as gtins, " +
            "(select count(*) from confere_stock_entries) as stock, (select count(*) from mf_sellin_weekly) as cells, " +
            "(select count(*) from confere_accounts where manufacturer_visibility) as opted",
            Map.of(), (rs, i) -> new Coverage(rs.getInt("markets"), rs.getInt("located"), rs.getInt("docs"), rs.getInt("items"),
                rs.getInt("gtins"), rs.getInt("stock"), rs.getInt("cells"), rs.getInt("opted"), minStores()));
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("uf", blank(uf)).addValue("gtin", blank(gtin));
        List<Traction> traction = jdbc.query(
            "select t.*, (select p.name from products p where p.ean = t.gtin) as name from mf_product_traction t " +
            "where (cast(:uf as varchar) is null or t.uf = :uf) and (cast(:gtin as varchar) is null or t.gtin = :gtin) " +
            "order by coalesce(t.units_4w, 0) desc limit 50", p,
            (rs, i) -> {
                java.math.BigDecimal now = rs.getBigDecimal("units_4w");
                java.math.BigDecimal before = rs.getBigDecimal("units_prev_4w");
                java.math.BigDecimal growth = now != null && before != null && before.signum() > 0
                    ? now.subtract(before).multiply(java.math.BigDecimal.valueOf(100)).divide(before, 1, java.math.RoundingMode.HALF_UP)
                    : null;
                return new Traction(rs.getString("gtin"), rs.getString("name"), rs.getString("uf"), now, before,
                    (Integer) rs.getObject("stores_4w"), rs.getBigDecimal("avg_cost_4w"), growth);
            });
        List<Map<String, Object>> seasonality = gtin == null || gtin.isBlank() ? List.of() : jdbc.queryForList(
            "select uf, month, units, stores from mf_product_seasonality where gtin = :gtin " +
            "and (cast(:uf as varchar) is null or uf = :uf) order by uf, month", p);
        List<Map<String, Object>> cities = gtin == null || gtin.isBlank() ? List.of() : jdbc.queryForList(
            "select uf, city, units, stores, min_cost, avg_cost, max_cost from mf_product_city_cost where gtin = :gtin " +
            "and (cast(:uf as varchar) is null or uf = :uf) order by units desc limit 50", p);
        return new Preview(c, traction, seasonality, cities);
    }

    private static String blank(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }
}
