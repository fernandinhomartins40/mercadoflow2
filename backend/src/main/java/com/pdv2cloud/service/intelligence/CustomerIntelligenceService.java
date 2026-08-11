package com.pdv2cloud.service.intelligence;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Inteligência de cliente a partir do CPF informado na nota.
 *
 * PROBLEMA QUE RESOLVE (auditoria §8 e §20): `invoices.cpf_cnpj_destinatario` é
 * gravado desde a V1 e **nunca foi lido por nenhum serviço analítico**. Com o
 * dado já na mão, o sistema não sabia responder quantos clientes voltam, qual o
 * ticket de quem é recorrente, nem quais produtos trazem o cliente de volta.
 *
 * LGPD — decisões de projeto, não detalhes de implementação:
 *
 *  1. O CPF NUNCA sai da tabela de notas nem é copiado para a camada analítica.
 *     A chave do perfil é `HMAC-SHA256(cpf, salt do tenant)`.
 *  2. O salt é POR MERCADO. Isso impede que o mesmo CPF gere o mesmo hash em
 *     lojas diferentes — sem isso, um vazamento permitiria cruzar o
 *     comportamento de compra de uma pessoa entre clientes distintos da
 *     plataforma.
 *  3. HMAC, e não hash simples: CPF tem espaço de busca pequeno o bastante para
 *     ser quebrado por força bruta em minutos se fosse só SHA-256 sem chave.
 *  4. O hash é irreversível por construção — não existe caminho de volta ao CPF,
 *     nem para o suporte. A exclusão a pedido do titular se faz apagando as
 *     linhas do hash correspondente.
 *  5. Nada aqui é exibido de forma individualizada: as telas consomem agregados
 *     (taxa de recompra, contagem de recorrentes), nunca "o cliente X comprou Y".
 */
@Service
@Slf4j
public class CustomerIntelligenceService {

    /** Janela de análise de comportamento de cliente. */
    private static final int WINDOW_DAYS = 365;

    /** A partir de quantas compras o cliente conta como recorrente. */
    private static final int RECURRING_MIN_PURCHASES = 4;

    /** Entre este mínimo e o de recorrente, o cliente é ocasional. */
    private static final int OCCASIONAL_MIN_PURCHASES = 2;

    /**
     * Mínimo de clientes distintos para publicar estatística de um produto.
     *
     * É k-anonimato: com 2 ou 3 compradores, "80% recompra" descreve pessoas
     * específicas e identificáveis pelo lojista, não um padrão.
     */
    private static final int MIN_CUSTOMERS_FOR_STATS = 5;

    /*
     * SOMENTE CPF (11 dígitos), nunca CNPJ.
     *
     * O campo `cpf_cnpj_destinatario` aceita os dois, e uma verificação nos
     * dados de produção encontrou CNPJ com quase mil notas emitidas. Misturar
     * os dois distorceria tudo: compra de empresa tem frequência, ticket e
     * cesta completamente diferentes de consumidor final, e um único CNPJ
     * ativo sozinho viraria "o cliente mais recorrente da loja".
     *
     * O filtro está aplicado nas duas consultas abaixo (perfis e recompra).
     */

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public CustomerIntelligenceService(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // ── Salt por tenant ──────────────────────────────────────────────────────

    /**
     * Salt do mercado, criado na primeira necessidade.
     *
     * {@code on conflict do nothing} + releitura resolve a corrida entre dois
     * jobs simultâneos: o perdedor lê o salt do vencedor em vez de falhar ou,
     * pior, gerar um segundo salt que invalidaria os hashes já calculados.
     */
    @Transactional
    public String resolveSalt(UUID marketId) {
        String existing = findSalt(marketId);
        if (existing != null) return existing;

        byte[] raw = new byte[32];
        new SecureRandom().nextBytes(raw);
        String salt = HexFormat.of().formatHex(raw);

        jdbcTemplate.update(
            "insert into market_customer_salts (market_id, salt) values (:marketId, :salt) "
                + "on conflict (market_id) do nothing",
            new MapSqlParameterSource("marketId", marketId).addValue("salt", salt)
        );
        String stored = findSalt(marketId);
        return stored != null ? stored : salt;
    }

    private String findSalt(UUID marketId) {
        List<String> found = jdbcTemplate.queryForList(
            "select salt from market_customer_salts where market_id = :marketId",
            new MapSqlParameterSource("marketId", marketId),
            String.class
        );
        return found.isEmpty() ? null : found.get(0);
    }

    /** HMAC-SHA256 do documento com o salt do tenant, em hexadecimal. */
    public String hashDocument(String document, String salt) {
        if (document == null || document.isBlank()) return null;
        String normalized = document.replaceAll("\\D", "");
        if (normalized.isEmpty()) return null;

        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(salt.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(normalized.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            // Falha de algoritmo indisponível é de infraestrutura, não de dado.
            throw new IllegalStateException("Falha ao calcular hash de cliente", e);
        }
    }

    // ── Materialização ───────────────────────────────────────────────────────

    /**
     * Recalcula os perfis de cliente e a recompra por produto.
     *
     * O hash é computado no BANCO, via hmac() do pgcrypto, para que o CPF não
     * trafegue até a aplicação nem apareça em heap dump ou log de driver. Se a
     * extensão não estiver disponível, o método degrada explicitamente em vez de
     * cair para um caminho menos seguro.
     */
    @Transactional
    public CustomerIntelligenceResult materialize(UUID marketId) {
        if (!pgcryptoAvailable()) {
            log.warn("pgcrypto indisponivel; inteligencia de cliente ignorada para o mercado {}", marketId);
            return new CustomerIntelligenceResult(0, 0, false);
        }

        String salt = resolveSalt(marketId);
        LocalDate since = LocalDate.now().minusDays(WINDOW_DAYS);

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("salt", salt)
            .addValue("since", since.atStartOfDay())
            .addValue("recurringMin", RECURRING_MIN_PURCHASES)
            .addValue("occasionalMin", OCCASIONAL_MIN_PURCHASES);

        jdbcTemplate.update(
            "delete from customer_profiles where market_id = :marketId",
            new MapSqlParameterSource("marketId", marketId));

        /*
         * encode(hmac(cpf, salt, 'sha256'), 'hex') mantém o documento dentro do
         * banco: nenhuma linha de CPF chega à aplicação.
         */
        int profiles = jdbcTemplate.update(
            "insert into customer_profiles ( " +
            "    market_id, customer_hash, first_purchase_at, last_purchase_at, " +
            "    purchase_count, total_spent, average_ticket, average_items, " +
            "    avg_days_between, segment, computed_at) " +
            "with purchases as ( " +
            "  select encode(hmac(regexp_replace(i.cpf_cnpj_destinatario, '\\D', '', 'g'), " +
            "                     :salt, 'sha256'), 'hex') as customer_hash, " +
            "         i.id as invoice_id, " +
            "         i.data_emissao, " +
            "         i.valor_total, " +
            "         (select count(*) from invoice_items it where it.invoice_id = i.id) as item_count " +
            "  from invoices i " +
            "  where i.market_id = :marketId " +
            "    and i.data_emissao >= :since " +
            "    and i.cpf_cnpj_destinatario is not null " +
            "    and length(regexp_replace(i.cpf_cnpj_destinatario, '\\D', '', 'g')) = 11 " +
            "), " +
            "agg as ( " +
            "  select customer_hash, " +
            "         min(data_emissao) as first_purchase_at, " +
            "         max(data_emissao) as last_purchase_at, " +
            "         count(distinct invoice_id) as purchase_count, " +
            "         coalesce(sum(valor_total), 0) as total_spent, " +
            "         coalesce(avg(valor_total), 0) as average_ticket, " +
            "         coalesce(avg(item_count), 0) as average_items " +
            "  from purchases group by customer_hash " +
            ") " +
            "select :marketId, customer_hash, first_purchase_at, last_purchase_at, " +
            "       purchase_count, total_spent, average_ticket, average_items, " +
            "       case when purchase_count > 1 then " +
            "            extract(epoch from (last_purchase_at - first_purchase_at)) " +
            "              / 86400.0 / (purchase_count - 1) " +
            "       end as avg_days_between, " +
            "       case when purchase_count >= :recurringMin then 'RECORRENTE' " +
            "            when purchase_count >= :occasionalMin then 'OCASIONAL' " +
            "            else 'UNICO' end as segment, " +
            "       now() " +
            "from agg",
            params);

        int repurchase = materializeRepurchase(marketId, salt, since);
        return new CustomerIntelligenceResult(profiles, repurchase, true);
    }

    /**
     * Taxa de recompra por produto: dos clientes identificados que compraram o
     * item, quantos voltaram a comprá-lo em outra nota.
     *
     * Responde "este produto traz o cliente de volta?", que é diferente de "este
     * produto vende muito": um item de recompra alta sustenta a recorrência da
     * loja e merece tratamento distinto na hora de comprar.
     */
    private int materializeRepurchase(UUID marketId, String salt, LocalDate since) {
        jdbcTemplate.update(
            "delete from product_repurchase_stats where market_id = :marketId",
            new MapSqlParameterSource("marketId", marketId));

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("marketId", marketId)
            .addValue("salt", salt)
            .addValue("since", since.atStartOfDay())
            .addValue("minCustomers", MIN_CUSTOMERS_FOR_STATS)
            .addValue("windowDays", WINDOW_DAYS);

        return jdbcTemplate.update(
            "insert into product_repurchase_stats ( " +
            "    market_id, product_id, distinct_customers, repurchasing_customers, " +
            "    repurchase_rate, avg_days_between, window_days, computed_at) " +
            "with customer_product as ( " +
            "  select it.product_id, " +
            "         encode(hmac(regexp_replace(i.cpf_cnpj_destinatario, '\\D', '', 'g'), " +
            "                     :salt, 'sha256'), 'hex') as customer_hash, " +
            "         count(distinct i.id) as purchases, " +
            "         min(i.data_emissao) as first_at, " +
            "         max(i.data_emissao) as last_at " +
            "  from invoice_items it " +
            "  join invoices i on i.id = it.invoice_id " +
            "  where i.market_id = :marketId " +
            "    and i.data_emissao >= :since " +
            "    and it.product_id is not null " +
            "    and i.cpf_cnpj_destinatario is not null " +
            "    and length(regexp_replace(i.cpf_cnpj_destinatario, '\\D', '', 'g')) = 11 " +
            "  group by it.product_id, customer_hash " +
            "), " +
            "per_product as ( " +
            "  select product_id, " +
            "         count(*) as distinct_customers, " +
            "         count(*) filter (where purchases > 1) as repurchasing_customers, " +
            "         avg(case when purchases > 1 then " +
            "               extract(epoch from (last_at - first_at)) / 86400.0 / (purchases - 1) " +
            "             end) as avg_days_between " +
            "  from customer_product group by product_id " +
            ") " +
            "select :marketId, product_id, distinct_customers, repurchasing_customers, " +
            "       round(repurchasing_customers::numeric / nullif(distinct_customers, 0), 4), " +
            "       avg_days_between, :windowDays, now() " +
            "from per_product " +
            // k-anonimato: produto com poucos compradores não vira estatística.
            "where distinct_customers >= :minCustomers",
            params);
    }

    private boolean pgcryptoAvailable() {
        List<Integer> found = jdbcTemplate.queryForList(
            "select 1 from pg_extension where extname = 'pgcrypto'",
            new MapSqlParameterSource(),
            Integer.class);
        return !found.isEmpty();
    }

    // ── Leitura ──────────────────────────────────────────────────────────────

    /** Visão agregada da base de clientes identificados. */
    @Transactional(readOnly = true)
    public CustomerOverview overview(UUID marketId) {
        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId);

        return jdbcTemplate.queryForObject(
            "select count(*) as total, " +
            "       count(*) filter (where segment = 'RECORRENTE') as recurring, " +
            "       count(*) filter (where segment = 'OCASIONAL') as occasional, " +
            "       count(*) filter (where segment = 'UNICO') as single, " +
            "       coalesce(avg(average_ticket) filter (where segment = 'RECORRENTE'), 0) as recurring_ticket, " +
            "       coalesce(avg(average_ticket) filter (where segment = 'UNICO'), 0) as single_ticket, " +
            "       coalesce(avg(avg_days_between), 0) as avg_days_between " +
            "from customer_profiles where market_id = :marketId",
            params,
            (rs, rowNum) -> {
                long total = rs.getLong("total");
                long recurring = rs.getLong("recurring");
                return new CustomerOverview(
                    total,
                    recurring,
                    rs.getLong("occasional"),
                    rs.getLong("single"),
                    total > 0
                        ? BigDecimal.valueOf(recurring * 100.0 / total).setScale(2, RoundingMode.HALF_UP)
                        : BigDecimal.ZERO,
                    rs.getBigDecimal("recurring_ticket").setScale(2, RoundingMode.HALF_UP),
                    rs.getBigDecimal("single_ticket").setScale(2, RoundingMode.HALF_UP),
                    rs.getBigDecimal("avg_days_between").setScale(1, RoundingMode.HALF_UP)
                );
            }
        );
    }

    /** Produtos que mais trazem o cliente de volta. */
    @Transactional(readOnly = true)
    public List<ProductRepurchase> topRepurchaseProducts(UUID marketId, int limit) {
        MapSqlParameterSource params = new MapSqlParameterSource("marketId", marketId)
            .addValue("limit", limit > 0 ? limit : 20);

        List<ProductRepurchase> out = new ArrayList<>();
        jdbcTemplate.query(
            "select r.product_id, p.name, p.image_url, r.distinct_customers, " +
            "       r.repurchasing_customers, r.repurchase_rate, r.avg_days_between " +
            "from product_repurchase_stats r " +
            "join products p on p.id = r.product_id " +
            "where r.market_id = :marketId " +
            "order by r.repurchase_rate desc, r.distinct_customers desc " +
            "limit :limit",
            params,
            rs -> {
                out.add(new ProductRepurchase(
                    UUID.fromString(rs.getString("product_id")),
                    rs.getString("name"),
                    rs.getString("image_url"),
                    rs.getInt("distinct_customers"),
                    rs.getInt("repurchasing_customers"),
                    rs.getBigDecimal("repurchase_rate"),
                    rs.getBigDecimal("avg_days_between")
                ));
            });
        return out;
    }

    // ── Tipos ────────────────────────────────────────────────────────────────

    public record CustomerIntelligenceResult(int profiles, int repurchaseRows, boolean executed) {}

    public record CustomerOverview(
        long totalCustomers,
        long recurringCustomers,
        long occasionalCustomers,
        long singlePurchaseCustomers,
        BigDecimal recurringSharePercent,
        BigDecimal recurringAverageTicket,
        BigDecimal singleAverageTicket,
        BigDecimal averageDaysBetweenPurchases
    ) {}

    public record ProductRepurchase(
        UUID productId,
        String name,
        String imageUrl,
        int distinctCustomers,
        int repurchasingCustomers,
        BigDecimal repurchaseRate,
        BigDecimal averageDaysBetween
    ) {}
}
