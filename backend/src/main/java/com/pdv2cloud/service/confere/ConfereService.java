package com.pdv2cloud.service.confere;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.exception.CustomExceptions;
import com.pdv2cloud.service.CatalogImageStorageService;
import com.pdv2cloud.service.CatalogImageUrlResolver;
import com.pdv2cloud.service.ai.AiCredentialCipher;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * MercadoFlow Confere: leitura da nota do fornecedor e conferência.
 *
 * De onde vem a nota, nesta ordem:
 *   1. já guardada (o mesmo mercado leu antes, ou a Sefaz entregou pelo A1);
 *   2. Sefaz com o certificado A1 do mercado — grátis e ilimitado;
 *   3. Meu Danfe pela chave — gasta 1 leitura do saldo, só quando a nota vem.
 */
@Service
public class ConfereService {

    private static final Logger log = LoggerFactory.getLogger(ConfereService.class);
    private static final String TXID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private final NamedParameterJdbcTemplate jdbc;
    private final AiCredentialCipher cipher;
    private final MeuDanfeClient meuDanfe;
    private final SefazClient sefaz;
    private final CatalogImageStorageService catalogImages;
    private final CatalogImageUrlResolver imageUrls;
    private final NfeItemStore itemStore;
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final SecureRandom random = new SecureRandom();

    /** Com o Asaas ligado, o Pix sai com QR dele e o aviso de pagamento confirma sozinho. */
    private com.pdv2cloud.service.billing.AsaasService asaas;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setAsaas(@org.springframework.context.annotation.Lazy com.pdv2cloud.service.billing.AsaasService asaas) {
        this.asaas = asaas;
    }

    public ConfereService(NamedParameterJdbcTemplate jdbc, AiCredentialCipher cipher, MeuDanfeClient meuDanfe,
                          SefazClient sefaz, CatalogImageStorageService catalogImages, CatalogImageUrlResolver imageUrls,
                          NfeItemStore itemStore) {
        this.jdbc = jdbc;
        this.cipher = cipher;
        this.meuDanfe = meuDanfe;
        this.sefaz = sefaz;
        this.catalogImages = catalogImages;
        this.imageUrls = imageUrls;
        this.itemStore = itemStore;
    }

    public record Plan(UUID id, String name, int reads, int priceCents, boolean active) {}

    // ── Situação da conta ──────────────────────────────────────────────────

    public record CertificateInfo(String cnpj, String holder, LocalDateTime notAfter, LocalDateTime lastSyncAt,
                                  String lastStatus, boolean expired) {}

    public record Status(boolean enabled, boolean termsAccepted, String termsVersion, String termsText, int balance,
                         boolean trialGranted, int trialReads, int pricePerReadCents, List<Plan> plans,
                         CertificateInfo certificate, boolean pixAvailable, boolean stripeAvailable,
                         String marketName, String marketCnpj, boolean manufacturerVisibility,
                         LocalDateTime manufacturerVisibilityAt) {}

    @Transactional(readOnly = true)
    public Status status(UUID marketId) {
        Map<String, Object> s = jdbc.queryForMap("select * from confere_settings where id = 'default'", Map.of());
        Map<String, Object> market = jdbc.queryForMap("select name, cnpj from markets where id = :id", Map.of("id", marketId));
        List<Map<String, Object>> acc = jdbc.queryForList("select * from confere_accounts where market_id = :m", Map.of("m", marketId));
        String version = (String) s.get("terms_version");
        boolean accepted = !acc.isEmpty() && version.equals(acc.get(0).get("terms_version"));
        int balance = acc.isEmpty() ? 0 : ((Number) acc.get(0).get("balance")).intValue();
        boolean trial = !acc.isEmpty() && Boolean.TRUE.equals(acc.get(0).get("trial_granted"));
        List<Plan> plans = jdbc.query("select * from confere_plans where active order by sort_order, reads", Map.of(),
            (rs, i) -> new Plan((UUID) rs.getObject("id"), rs.getString("name"), rs.getInt("reads"), rs.getInt("price_cents"), true));
        String termsText = (String) s.get("terms_text");
        return new Status(Boolean.TRUE.equals(s.get("enabled")), accepted, version,
            termsText == null ? ConfereAdminService.DEFAULT_TERMS : termsText, balance, trial,
            ((Number) s.get("trial_reads")).intValue(), ((Number) s.get("price_per_read_cents")).intValue(), plans,
            certificate(marketId), s.get("pix_key") != null || (asaas != null && asaas.enabled()), Boolean.TRUE.equals(s.get("stripe_enabled")),
            (String) market.get("name"), (String) market.get("cnpj"),
            !acc.isEmpty() && Boolean.TRUE.equals(acc.get(0).get("manufacturer_visibility")),
            acc.isEmpty() ? null : ts((Timestamp) acc.get(0).get("manufacturer_visibility_at")));
    }

    /**
     * Opt-in do mercado: aparecer com nome para os fabricantes dos produtos que
     * ele compra, em troca de ofertas e condições personalizadas. Revogável a
     * qualquer momento; sem ele, o mercado só entra no agregado anônimo.
     */
    @Transactional
    public Status setManufacturerVisibility(UUID marketId, boolean visible, String actor) {
        requireTerms(marketId);
        jdbc.update("update confere_accounts set manufacturer_visibility = :v, manufacturer_visibility_at = now(), updated_at = now() " +
            "where market_id = :m", Map.of("m", marketId, "v", visible));
        jdbc.update("insert into confere_ledger (market_id, delta, kind, reference, note) values (:m, 0, 'CONSENT', :r, :n)",
            new MapSqlParameterSource().addValue("m", marketId).addValue("r", visible ? "manufacturer-optin" : "manufacturer-optout")
                .addValue("n", (visible ? "Autorizou" : "Retirou") + " a visibilidade para fabricantes (" + cut(actor, 120) + ")"));
        return status(marketId);
    }

    private CertificateInfo certificate(UUID marketId) {
        List<CertificateInfo> rows = jdbc.query(
            "select cnpj, holder, not_after, last_sync_at, last_status from confere_certificates where market_id = :m",
            Map.of("m", marketId),
            (rs, i) -> {
                LocalDateTime notAfter = rs.getTimestamp("not_after").toLocalDateTime();
                return new CertificateInfo(rs.getString("cnpj"), rs.getString("holder"), notAfter,
                    ts(rs.getTimestamp("last_sync_at")), rs.getString("last_status"), notAfter.isBefore(LocalDateTime.now()));
            });
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Aceite dos termos. Na primeira vez, credita as leituras grátis de teste. */
    @Transactional
    public Status acceptTerms(UUID marketId, String version, String actor) {
        Map<String, Object> s = jdbc.queryForMap("select terms_version, trial_reads from confere_settings where id = 'default'", Map.of());
        if (version == null || !version.equals(s.get("terms_version"))) {
            throw new IllegalArgumentException("Os termos foram atualizados. Leia a versão nova e aceite de novo.");
        }
        jdbc.update(
            "insert into confere_accounts (market_id, terms_version, terms_accepted_at, terms_accepted_by) " +
            "values (:m, :v, now(), :a) on conflict (market_id) do update set terms_version = excluded.terms_version, " +
            "terms_accepted_at = now(), terms_accepted_by = excluded.terms_accepted_by, updated_at = now()",
            new MapSqlParameterSource().addValue("m", marketId).addValue("v", version).addValue("a", actor));
        int trial = ((Number) s.get("trial_reads")).intValue();
        int granted = jdbc.update("update confere_accounts set trial_granted = true where market_id = :m and trial_granted = false",
            Map.of("m", marketId));
        if (granted > 0 && trial > 0) {
            credit(marketId, trial, "TRIAL", "trial", trial + " leituras grátis para testar");
        }
        return status(marketId);
    }

    private void requireTerms(UUID marketId) {
        Integer ok = jdbc.queryForObject(
            "select count(*) from confere_accounts a, confere_settings s where s.id = 'default' and a.market_id = :m " +
            "and a.terms_version = s.terms_version", Map.of("m", marketId), Integer.class);
        if (ok == null || ok == 0) {
            throw new IllegalArgumentException("Aceite os termos do Confere antes de ler notas");
        }
    }

    /** Crédito ou débito no saldo, com registro no extrato. Débito nunca deixa negativo. */
    @Transactional
    public void credit(UUID marketId, int delta, String kind, String reference, String note) {
        jdbc.update("insert into confere_accounts (market_id) values (:m) on conflict do nothing", Map.of("m", marketId));
        int n = jdbc.update("update confere_accounts set balance = balance + :d, updated_at = now() where market_id = :m and balance + :d >= 0",
            Map.of("m", marketId, "d", delta));
        if (n == 0) {
            throw new IllegalArgumentException("Saldo insuficiente");
        }
        jdbc.update("insert into confere_ledger (market_id, delta, kind, reference, note) values (:m, :d, :k, :r, :n)",
            new MapSqlParameterSource().addValue("m", marketId).addValue("d", delta).addValue("k", kind)
                .addValue("r", reference).addValue("n", note));
    }

    public record LedgerEntry(int delta, String kind, String note, LocalDateTime createdAt) {}

    public List<LedgerEntry> ledger(UUID marketId) {
        return jdbc.query("select * from confere_ledger where market_id = :m order by created_at desc limit 100", Map.of("m", marketId),
            (rs, i) -> new LedgerEntry(rs.getInt("delta"), rs.getString("kind"), rs.getString("note"), ts(rs.getTimestamp("created_at"))));
    }

    // ── Leitura da nota ────────────────────────────────────────────────────

    public record ReadResult(UUID documentId, String accessKey, String source, boolean charged, int balance) {}

    public ReadResult read(UUID marketId, String rawKey, String actor) {
        requireTerms(marketId);
        String key = rawKey == null ? "" : rawKey.replaceAll("\\D", "");
        if (!NfeXml.validKey(key)) {
            throw new IllegalArgumentException("Chave de acesso inválida. Confira os 44 números.");
        }
        if (!NfeXml.isNfe(key)) {
            throw new IllegalArgumentException("Essa chave não é de NF-e de fornecedor (modelo 55). Cupom de consumidor não entra na conferência.");
        }
        UUID existing = fullDocumentId(marketId, key);
        if (existing != null) {
            return new ReadResult(existing, key, "SAVED", false, balanceOf(marketId));
        }

        // Com certificado: Sefaz, grátis.
        String sefazProblem = null;
        if (certificate(marketId) != null) {
            try {
                UUID id = readFromSefaz(marketId, key);
                if (id != null) {
                    return new ReadResult(id, key, "SEFAZ", false, balanceOf(marketId));
                }
            } catch (RuntimeException e) {
                sefazProblem = e.getMessage();
                log.warn("Sefaz não entregou a nota {}: {}", key.substring(0, 6), e.getMessage());
            }
        }

        // Sem certificado (ou a Sefaz não entregou): uma leitura do saldo.
        if (balanceOf(marketId) <= 0) {
            throw new IllegalArgumentException(sefazProblem != null
                ? "A Sefaz ainda não liberou essa nota e você está sem leituras. " + sefazProblem
                : "Suas leituras acabaram. Compre um pacote ou cadastre o certificado A1 para ler de graça.");
        }
        String apiKey = meuDanfeKey();
        if (apiKey == null) {
            throw new IllegalArgumentException("A leitura por crédito está indisponível no momento");
        }
        MeuDanfeClient.Result r = meuDanfe.fetch(apiKey, key);
        if (r.outcome() != MeuDanfeClient.Outcome.OK) {
            if (r.outcome() == MeuDanfeClient.Outcome.UNAUTHORIZED || r.outcome() == MeuDanfeClient.Outcome.NO_BALANCE) {
                log.error("Meu Danfe indisponível para revenda: {}", r.message());
                throw new IllegalArgumentException("A leitura por crédito está indisponível no momento. Nenhuma leitura foi descontada.");
            }
            if (r.outcome() == MeuDanfeClient.Outcome.NOT_FOUND) {
                throw new IllegalArgumentException(r.message() + ". Chave lida: " + formatKey(key)
                    + ". Confira se é a chave impressa no DANFE (não a do boleto) ou importe o XML. Nenhuma leitura foi descontada.");
            }
            throw new IllegalArgumentException(r.message() + ". Nenhuma leitura foi descontada.");
        }
        UUID id = store(marketId, r.xml(), "MEUDANFE");
        credit(marketId, -1, "READ", key, "Leitura da nota " + key.substring(25, 34));
        return new ReadResult(id, key, "MEUDANFE", true, balanceOf(marketId));
    }

    /** consChNFe; se vier só o resumo, registra a ciência e tenta de novo. */
    private UUID readFromSefaz(UUID marketId, String key) {
        CertBundle cert = openCertificate(marketId);
        SefazClient.DistResult r = sefaz.distByKey(cert.credential(), cert.ufCode(), cert.cnpj(), key);
        UUID id = storeDist(marketId, r);
        if (id != null && fullDocumentId(marketId, key) != null) {
            return fullDocumentId(marketId, key);
        }
        if (r.found() || "640".equals(r.cStat()) || "641".equals(r.cStat()) || "632".equals(r.cStat())) {
            SefazClient.EventResult ev = sefaz.acknowledge(cert.credential(), cert.cnpj(), key);
            if (!ev.ok()) {
                throw new IllegalStateException("Sefaz não registrou a ciência: " + ev.reason());
            }
            jdbc.update("update nfe_documents set acknowledged = true where market_id = :m and access_key = :k", Map.of("m", marketId, "k", key));
            try {
                Thread.sleep(2500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            storeDist(marketId, sefaz.distByKey(cert.credential(), cert.ufCode(), cert.cnpj(), key));
            return fullDocumentId(marketId, key);
        }
        throw new IllegalStateException(r.reason() == null ? "Nota não encontrada na Sefaz" : r.reason());
    }

    // ── XML enviado pelo usuário ───────────────────────────────────────────

    @Transactional
    public ReadResult upload(UUID marketId, String xml) {
        requireTerms(marketId);
        NfeXml.Data data = NfeXml.read(xml);
        if (!data.full() || data.items().isEmpty()) {
            throw new IllegalArgumentException("Esse XML não tem os produtos da nota");
        }
        UUID id = store(marketId, xml, "UPLOAD");
        return new ReadResult(id, data.accessKey(), "UPLOAD", false, balanceOf(marketId));
    }

    // ── Guarda ─────────────────────────────────────────────────────────────

    @Transactional
    public UUID store(UUID marketId, String xml, String source) {
        NfeXml.Data d = NfeXml.read(xml);
        if (d.accessKey() == null || d.accessKey().length() != 44) {
            throw new IllegalArgumentException("XML sem chave de acesso");
        }
        MapSqlParameterSource p = new MapSqlParameterSource()
            .addValue("m", marketId).addValue("k", d.accessKey()).addValue("src", source)
            .addValue("full", d.full() ? "FULL" : "SUMMARY").addValue("xml", xml)
            .addValue("ecnpj", d.emitterCnpj()).addValue("ename", cut(d.emitterTradeName() != null ? d.emitterTradeName() : d.emitterName(), 200))
            .addValue("num", d.number()).addValue("ser", d.series())
            .addValue("iss", d.issuedAt() == null ? null : Timestamp.valueOf(d.issuedAt()))
            .addValue("tot", d.totalValue()).addValue("items", d.full() ? d.items().size() : null).addValue("vol", d.volumes());
        // Resumo nunca sobrescreve a nota completa.
        jdbc.update(
            "insert into nfe_documents (market_id, access_key, source, completeness, xml, emitter_cnpj, emitter_name, number, series, " +
            "issued_at, total_value, items_count, volumes) values (:m, :k, :src, :full, :xml, :ecnpj, :ename, :num, :ser, :iss, :tot, :items, :vol) " +
            "on conflict (market_id, access_key) do update set source = excluded.source, completeness = excluded.completeness, " +
            "xml = excluded.xml, emitter_cnpj = coalesce(excluded.emitter_cnpj, nfe_documents.emitter_cnpj), " +
            "emitter_name = coalesce(excluded.emitter_name, nfe_documents.emitter_name), number = coalesce(excluded.number, nfe_documents.number), " +
            "series = coalesce(excluded.series, nfe_documents.series), issued_at = coalesce(excluded.issued_at, nfe_documents.issued_at), " +
            "total_value = coalesce(excluded.total_value, nfe_documents.total_value), items_count = coalesce(excluded.items_count, nfe_documents.items_count), " +
            "volumes = coalesce(excluded.volumes, nfe_documents.volumes), updated_at = now() " +
            "where nfe_documents.completeness <> 'FULL' or excluded.completeness = 'FULL'",
            p);
        UUID id = jdbc.queryForObject("select id from nfe_documents where market_id = :m and access_key = :k", p, UUID.class);
        if (d.full()) {
            itemStore.extract(marketId, id, d);
        }
        return id;
    }

    /**
     * Notas guardadas antes da tabela de itens: extrai de novo a partir do XML.
     * Roda em lotes pequenos (job) até não sobrar nenhuma.
     */
    @Transactional
    public int backfillItems(int limit) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select id, market_id, xml from nfe_documents where completeness = 'FULL' and not items_extracted " +
            "order by created_at limit :l", Map.of("l", limit));
        int done = 0;
        for (Map<String, Object> r : rows) {
            UUID id = (UUID) r.get("id");
            UUID marketId = (UUID) r.get("market_id");
            try {
                itemStore.extract(marketId, id, NfeXml.read((String) r.get("xml")));
                done++;
            } catch (RuntimeException e) {
                log.warn("Itens da nota {} não extraídos: {}", id, e.getMessage());
                jdbc.update("update nfe_documents set items_extracted = true where id = :id", Map.of("id", id));
            }
        }
        // Conferências fechadas antes das entradas de estoque.
        List<Map<String, Object>> checks = jdbc.queryForList(
            "select k.id, k.market_id, k.document_id, k.counts from confere_checks k where k.status = 'DONE' " +
            "and not exists (select 1 from confere_stock_entries e where e.check_id = k.id) " +
            "and exists (select 1 from nfe_document_items i where i.document_id = k.document_id) limit :l", Map.of("l", limit));
        for (Map<String, Object> c : checks) {
            itemStore.writeStockEntries((UUID) c.get("market_id"), (UUID) c.get("document_id"), (UUID) c.get("id"),
                map(String.valueOf(c.get("counts"))));
        }
        return done + checks.size();
    }

    private UUID storeDist(UUID marketId, SefazClient.DistResult r) {
        UUID last = null;
        for (SefazClient.Doc doc : r.docs()) {
            String schema = doc.schema() == null ? "" : doc.schema();
            if (schema.startsWith("procNFe") || schema.startsWith("resNFe")) {
                try {
                    last = store(marketId, doc.xml(), "SEFAZ");
                } catch (RuntimeException e) {
                    log.warn("Documento da Sefaz ignorado (NSU {}): {}", doc.nsu(), e.getMessage());
                }
            }
        }
        return last;
    }

    private UUID fullDocumentId(UUID marketId, String key) {
        List<UUID> ids = jdbc.queryForList(
            "select id from nfe_documents where market_id = :m and access_key = :k and completeness = 'FULL'",
            Map.of("m", marketId, "k", key), UUID.class);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private int balanceOf(UUID marketId) {
        List<Integer> b = jdbc.queryForList("select balance from confere_accounts where market_id = :m", Map.of("m", marketId), Integer.class);
        return b.isEmpty() ? 0 : b.get(0);
    }

    // ── Notas e itens ──────────────────────────────────────────────────────

    public record DocumentSummary(UUID id, String accessKey, String completeness, String source, String emitterName,
                                  String number, LocalDateTime issuedAt, BigDecimal totalValue, Integer itemsCount,
                                  Integer volumes, String checkStatus, LocalDateTime checkedAt) {}

    @Transactional(readOnly = true)
    public List<DocumentSummary> documents(UUID marketId) {
        return jdbc.query(
            "select d.*, c.status as check_status, c.finished_at from nfe_documents d " +
            "left join lateral (select status, finished_at from confere_checks k where k.document_id = d.id order by started_at desc limit 1) c on true " +
            "where d.market_id = :m order by coalesce(d.issued_at, d.created_at) desc limit 100",
            Map.of("m", marketId),
            (rs, i) -> new DocumentSummary((UUID) rs.getObject("id"), rs.getString("access_key"), rs.getString("completeness"),
                rs.getString("source"), rs.getString("emitter_name"), rs.getString("number"), ts(rs.getTimestamp("issued_at")),
                rs.getBigDecimal("total_value"), (Integer) rs.getObject("items_count"), (Integer) rs.getObject("volumes"),
                rs.getString("check_status"), ts(rs.getTimestamp("finished_at"))));
    }

    public record ItemView(int number, String code, String ean, String name, String catalogName, String imageUrl,
                           String unit, BigDecimal quantity, String taxUnit, BigDecimal taxQuantity, String taxEan,
                           BigDecimal unitPrice, BigDecimal total, String lot, String expiry,
                           BigDecimal lastUnitPrice, BigDecimal priceChangePercent) {}

    public record DocumentView(UUID id, String accessKey, String emitterCnpj, String emitterName, String number,
                               String series, LocalDateTime issuedAt, BigDecimal totalValue, Integer volumes,
                               String volumeKind, BigDecimal grossWeight, List<ItemView> items, Check check) {}

    @Transactional(readOnly = true)
    public DocumentView document(UUID marketId, UUID id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select * from nfe_documents where id = :id and market_id = :m", Map.of("id", id, "m", marketId));
        if (rows.isEmpty()) {
            throw new CustomExceptions.NotFound("Nota não encontrada");
        }
        Map<String, Object> row = rows.get(0);
        if (!"FULL".equals(row.get("completeness"))) {
            throw new IllegalArgumentException("A Sefaz ainda não liberou os produtos desta nota. Tente ler de novo em alguns minutos.");
        }
        NfeXml.Data d = NfeXml.read((String) row.get("xml"));
        Map<String, String[]> photos = catalog(d.items());
        Map<String, BigDecimal> previous = previousPrices(marketId, id, d.emitterCnpj());
        List<ItemView> items = new ArrayList<>();
        for (NfeXml.Item it : d.items()) {
            String[] ph = it.ean() != null ? photos.get(it.ean()) : null;
            if (ph == null && it.taxEan() != null) {
                ph = photos.get(it.taxEan());
            }
            BigDecimal last = previous.get(it.code());
            BigDecimal change = null;
            if (last != null && last.signum() > 0 && it.unitPrice() != null) {
                change = it.unitPrice().subtract(last).multiply(BigDecimal.valueOf(100)).divide(last, 1, RoundingMode.HALF_UP);
            }
            items.add(new ItemView(it.number(), it.code(), it.ean(), it.name(), ph == null ? null : ph[0], ph == null ? null : ph[1],
                it.unit(), it.quantity(), it.taxUnit(), it.taxQuantity(), it.taxEan(), it.unitPrice(), it.total(),
                it.lot(), it.expiry(), last, change));
        }
        return new DocumentView(id, d.accessKey(), d.emitterCnpj(),
            d.emitterTradeName() != null ? d.emitterTradeName() : d.emitterName(), d.number(), d.series(), d.issuedAt(),
            d.totalValue(), d.volumes(), d.volumeKind(), d.grossWeight(), items, latestCheck(marketId, id));
    }

    /** Nome e foto do catálogo global pelo código de barras. */
    private Map<String, String[]> catalog(List<NfeXml.Item> items) {
        List<String> eans = new ArrayList<>();
        for (NfeXml.Item it : items) {
            if (it.ean() != null) eans.add(it.ean());
            if (it.taxEan() != null) eans.add(it.taxEan());
        }
        Map<String, String[]> out = new HashMap<>();
        if (eans.isEmpty()) {
            return out;
        }
        jdbc.query(
            "select distinct on (p.ean) p.ean, coalesce(pe.canonical_name, p.name) as name, pe.image_storage_key, " +
            "coalesce(pe.image_url, p.image_url) as url from products p left join product_enrichments pe on pe.product_id = p.id " +
            "where p.ean in (:eans) order by p.ean, (coalesce(pe.image_storage_key, pe.image_url) is null), pe.fetched_at desc nulls last",
            Map.of("eans", eans),
            rs -> {
                out.put(rs.getString("ean"), new String[] {rs.getString("name"), image(rs.getString("image_storage_key"), rs.getString("url"))});
            });
        return out;
    }

    private String image(String key, String url) {
        try {
            if (key != null && !key.isBlank() && catalogImages.hasStoredImage(key)) {
                return imageUrls.managedUrl(key);
            }
            return imageUrls.normalizeUrl(url);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** Preço unitário do mesmo item na nota anterior do mesmo fornecedor. */
    private Map<String, BigDecimal> previousPrices(UUID marketId, UUID currentId, String emitterCnpj) {
        Map<String, BigDecimal> out = new HashMap<>();
        if (emitterCnpj == null) {
            return out;
        }
        List<String> xmls = jdbc.queryForList(
            "select xml from nfe_documents where market_id = :m and emitter_cnpj = :e and id <> :id and completeness = 'FULL' " +
            "and issued_at < (select issued_at from nfe_documents where id = :id) order by issued_at desc limit 1",
            Map.of("m", marketId, "e", emitterCnpj, "id", currentId), String.class);
        if (!xmls.isEmpty()) {
            try {
                for (NfeXml.Item it : NfeXml.read(xmls.get(0)).items()) {
                    if (it.code() != null && it.unitPrice() != null) {
                        out.put(it.code(), it.unitPrice());
                    }
                }
            } catch (RuntimeException ignored) {
                // nota anterior ilegível: sem comparação
            }
        }
        return out;
    }

    // ── Conferência ────────────────────────────────────────────────────────

    public record Check(UUID id, String status, boolean blind, Map<String, Object> counts, Map<String, Object> summary,
                        LocalDateTime startedAt, LocalDateTime finishedAt, String finishedBy) {}

    private Check latestCheck(UUID marketId, UUID documentId) {
        List<Check> rows = jdbc.query(
            "select * from confere_checks where market_id = :m and document_id = :d order by started_at desc limit 1",
            Map.of("m", marketId, "d", documentId), (rs, i) -> mapCheck(rs));
        return rows.isEmpty() ? null : rows.get(0);
    }

    @Transactional
    public Check saveCheck(UUID marketId, UUID documentId, Map<String, Object> body, String actor) {
        document(marketId, documentId);
        Check current = latestCheck(marketId, documentId);
        String counts = json(body.get("counts") instanceof Map<?, ?> m ? m : Map.of());
        boolean finish = Boolean.TRUE.equals(body.get("finish"));
        String summary = body.get("summary") instanceof Map<?, ?> m ? json(m) : null;
        if (current == null || "DONE".equals(current.status()) && Boolean.TRUE.equals(body.get("restart"))) {
            UUID id = UUID.randomUUID();
            jdbc.update("insert into confere_checks (id, market_id, document_id, blind, counts, started_by) values (:id, :m, :d, :b, cast(:c as jsonb), :a)",
                new MapSqlParameterSource().addValue("id", id).addValue("m", marketId).addValue("d", documentId)
                    .addValue("b", Boolean.TRUE.equals(body.get("blind"))).addValue("c", counts).addValue("a", actor));
            current = latestCheck(marketId, documentId);
        }
        jdbc.update(
            "update confere_checks set counts = cast(:c as jsonb), blind = :b, updated_at = now(), " +
            "summary = coalesce(cast(:s as jsonb), summary), " +
            "status = case when :finish then 'DONE' else status end, " +
            "finished_at = case when :finish then now() else finished_at end, " +
            "finished_by = case when :finish then :a else finished_by end where id = :id and market_id = :m",
            new MapSqlParameterSource().addValue("id", current.id()).addValue("m", marketId).addValue("c", counts)
                .addValue("b", body.containsKey("blind") ? Boolean.TRUE.equals(body.get("blind")) : current.blind())
                .addValue("s", summary).addValue("finish", finish).addValue("a", actor));
        Check saved = latestCheck(marketId, documentId);
        if (finish) {
            itemStore.writeStockEntries(marketId, documentId, saved.id(), saved.counts());
        }
        return saved;
    }

    private Check mapCheck(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Check((UUID) rs.getObject("id"), rs.getString("status"), rs.getBoolean("blind"),
            map(rs.getString("counts")), map(rs.getString("summary")), ts(rs.getTimestamp("started_at")),
            ts(rs.getTimestamp("finished_at")), rs.getString("finished_by"));
    }

    // ── Certificado A1 ─────────────────────────────────────────────────────

    record CertBundle(SefazClient.Credential credential, String cnpj, String ufCode) {}

    @Transactional
    public CertificateInfo saveCertificate(UUID marketId, byte[] pfx, String password, String uf) {
        if (!cipher.isConfigured()) {
            throw new IllegalArgumentException("O servidor está sem a chave de criptografia; o certificado não pode ser guardado");
        }
        if (pfx == null || pfx.length == 0 || pfx.length > 50_000) {
            throw new IllegalArgumentException("Envie o arquivo do certificado A1 (.pfx ou .p12)");
        }
        SefazClient.Credential c = SefazClient.open(pfx, password == null ? new char[0] : password.toCharArray());
        LocalDateTime notAfter = LocalDateTime.ofInstant(c.certificate().getNotAfter().toInstant(), java.time.ZoneId.of("America/Sao_Paulo"));
        if (notAfter.isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("Esse certificado venceu em " + notAfter.toLocalDate());
        }
        Map<String, Object> market = jdbc.queryForMap("select cnpj, state from markets where id = :id", Map.of("id", marketId));
        String marketCnpj = market.get("cnpj") == null ? null : String.valueOf(market.get("cnpj")).replaceAll("\\D", "");
        String certCnpj = SefazClient.cnpjOf(c.certificate());
        if (certCnpj == null) {
            throw new IllegalArgumentException("Esse certificado não é um e-CNPJ. Use o certificado A1 da empresa.");
        }
        if (marketCnpj != null && marketCnpj.length() == 14 && !marketCnpj.substring(0, 8).equals(certCnpj.substring(0, 8))) {
            throw new IllegalArgumentException("O certificado é de outro CNPJ (" + certCnpj + "). Use o certificado deste mercado.");
        }
        String ufCode = SefazClient.ufCode(uf != null && !uf.isBlank() ? uf : (String) market.get("state"));
        if (ufCode == null) {
            throw new IllegalArgumentException("Informe a UF do mercado");
        }
        String cnpj = marketCnpj != null && marketCnpj.length() == 14 ? marketCnpj : certCnpj;
        jdbc.update(
            "insert into confere_certificates (market_id, pfx_enc, password_enc, cnpj, uf_code, holder, not_after, next_sync_at) " +
            "values (:m, :pfx, :pw, :cnpj, :uf, :holder, :na, now()) on conflict (market_id) do update set pfx_enc = excluded.pfx_enc, " +
            "password_enc = excluded.password_enc, cnpj = excluded.cnpj, uf_code = excluded.uf_code, holder = excluded.holder, " +
            "not_after = excluded.not_after, next_sync_at = now(), last_status = null",
            new MapSqlParameterSource().addValue("m", marketId)
                .addValue("pfx", cipher.encrypt(Base64.getEncoder().encodeToString(pfx)))
                .addValue("pw", cipher.encrypt(password == null ? "" : password))
                .addValue("cnpj", cnpj).addValue("uf", ufCode).addValue("holder", cut(SefazClient.holderOf(c.certificate()), 200))
                .addValue("na", Timestamp.valueOf(notAfter)));
        return certificate(marketId);
    }

    @Transactional
    public void removeCertificate(UUID marketId) {
        jdbc.update("delete from confere_certificates where market_id = :m", Map.of("m", marketId));
    }

    CertBundle openCertificate(UUID marketId) {
        Map<String, Object> row = jdbc.queryForMap("select * from confere_certificates where market_id = :m", Map.of("m", marketId));
        byte[] pfx = Base64.getDecoder().decode(cipher.decrypt((String) row.get("pfx_enc")));
        char[] pw = cipher.decrypt((String) row.get("password_enc")).toCharArray();
        return new CertBundle(SefazClient.open(pfx, pw), (String) row.get("cnpj"), (String) row.get("uf_code"));
    }

    /**
     * Baixa as notas novas do CNPJ (por NSU) e registra a ciência das que vêm
     * só como resumo — assim a versão completa chega na próxima rodada.
     * A Sefaz pede 1 hora de espera quando não há nada novo (cStat 137).
     */
    public String sync(UUID marketId) {
        Map<String, Object> row = jdbc.queryForMap("select last_nsu from confere_certificates where market_id = :m", Map.of("m", marketId));
        String nsu = (String) row.get("last_nsu");
        CertBundle cert = openCertificate(marketId);
        int received = 0;
        String status;
        LocalDateTime next;
        try {
            for (int round = 0; round < 10; round++) {
                SefazClient.DistResult r = sefaz.distByNsu(cert.credential(), cert.ufCode(), cert.cnpj(), nsu);
                if ("137".equals(r.cStat())) {
                    status = "Em dia com a Sefaz";
                    next = LocalDateTime.now().plusHours(1);
                    saveSync(marketId, r.lastNsu() != null ? r.lastNsu() : nsu, status, next);
                    return status + (received > 0 ? " (" + received + " documentos novos)" : "");
                }
                if (!"138".equals(r.cStat())) {
                    status = "Sefaz: " + r.cStat() + " " + (r.reason() == null ? "" : r.reason());
                    saveSync(marketId, nsu, status, LocalDateTime.now().plusHours(1));
                    return status;
                }
                for (SefazClient.Doc doc : r.docs()) {
                    String schema = doc.schema() == null ? "" : doc.schema();
                    if (!schema.startsWith("resNFe") && !schema.startsWith("procNFe")) {
                        continue;
                    }
                    try {
                        UUID id = store(marketId, doc.xml(), "SEFAZ");
                        received++;
                        if (schema.startsWith("resNFe")) {
                            String key = jdbc.queryForObject("select access_key from nfe_documents where id = :id", Map.of("id", id), String.class);
                            SefazClient.EventResult ev = sefaz.acknowledge(cert.credential(), cert.cnpj(), key);
                            if (ev.ok()) {
                                jdbc.update("update nfe_documents set acknowledged = true where id = :id", Map.of("id", id));
                            }
                        }
                    } catch (RuntimeException e) {
                        log.warn("Documento NSU {} ignorado: {}", doc.nsu(), e.getMessage());
                    }
                }
                nsu = r.lastNsu() == null ? nsu : r.lastNsu();
                saveSync(marketId, nsu, "Recebendo notas da Sefaz", LocalDateTime.now());
                if (r.maxNsu() != null && nsu.compareTo(r.maxNsu()) >= 0) {
                    status = "Em dia com a Sefaz";
                    saveSync(marketId, nsu, status, LocalDateTime.now().plusHours(1));
                    return status + " (" + received + " documentos novos)";
                }
            }
            saveSync(marketId, nsu, "Recebendo notas da Sefaz", LocalDateTime.now().plusMinutes(5));
            return "Recebendo notas (" + received + " até agora)";
        } catch (RuntimeException e) {
            saveSync(marketId, nsu, "Falha: " + cut(e.getMessage(), 200), LocalDateTime.now().plusMinutes(30));
            throw new IllegalArgumentException("Não foi possível falar com a Sefaz: " + e.getMessage());
        }
    }

    private void saveSync(UUID marketId, String nsu, String status, LocalDateTime next) {
        jdbc.update("update confere_certificates set last_nsu = :nsu, last_status = :s, last_sync_at = now(), next_sync_at = :n where market_id = :m",
            new MapSqlParameterSource().addValue("m", marketId).addValue("nsu", nsu).addValue("s", cut(status, 240))
                .addValue("n", Timestamp.valueOf(next)));
    }

    // ── Pedidos de crédito ─────────────────────────────────────────────────

    public record Order(UUID id, String planName, int reads, int amountCents, String method, String status, String txid,
                        String pixPayload, String pixQrPng, String checkoutUrl, LocalDateTime createdAt, LocalDateTime paidAt) {}

    @Transactional
    public Order createPixOrder(UUID marketId, UUID planId) {
        Map<String, Object> s = jdbc.queryForMap("select * from confere_settings where id = 'default'", Map.of());
        boolean gateway = asaas != null && asaas.enabled();
        if (s.get("pix_key") == null && !gateway) {
            throw new IllegalArgumentException("Pagamento por Pix ainda não está disponível");
        }
        Plan plan = plan(planId);
        UUID id = UUID.randomUUID();
        String txid = txid();
        jdbc.update("insert into confere_orders (id, market_id, plan_id, reads, amount_cents, method, txid) values (:id, :m, :p, :r, :a, 'PIX', :t)",
            new MapSqlParameterSource().addValue("id", id).addValue("m", marketId).addValue("p", plan.id())
                .addValue("r", plan.reads()).addValue("a", plan.priceCents()).addValue("t", txid));
        if (gateway) {
            var charge = asaas.pixCharge(marketId, plan.priceCents(), plan.name() + " — leituras do Confere", "confere:" + id);
            jdbc.update("update confere_orders set provider_payment_id = :p, provider_pix_payload = :x, provider_invoice_url = :u where id = :id",
                new MapSqlParameterSource().addValue("id", id).addValue("p", charge.paymentId()).addValue("x", charge.pixPayload())
                    .addValue("u", charge.invoiceUrl()));
        }
        return order(marketId, id);
    }

    @Transactional
    public UUID createStripeOrder(UUID marketId, UUID planId, String sessionId) {
        Plan plan = plan(planId);
        UUID id = UUID.randomUUID();
        jdbc.update("insert into confere_orders (id, market_id, plan_id, reads, amount_cents, method, txid, stripe_session_id) " +
                "values (:id, :m, :p, :r, :a, 'STRIPE', :t, :s)",
            new MapSqlParameterSource().addValue("id", id).addValue("m", marketId).addValue("p", plan.id())
                .addValue("r", plan.reads()).addValue("a", plan.priceCents()).addValue("t", txid()).addValue("s", sessionId));
        return id;
    }

    public Plan plan(UUID planId) {
        List<Plan> p = jdbc.query("select * from confere_plans where id = :id and active", Map.of("id", planId),
            (rs, i) -> new Plan((UUID) rs.getObject("id"), rs.getString("name"), rs.getInt("reads"), rs.getInt("price_cents"), true));
        if (p.isEmpty()) {
            throw new IllegalArgumentException("Plano indisponível");
        }
        return p.get(0);
    }

    @Transactional(readOnly = true)
    public Order order(UUID marketId, UUID id) {
        Map<String, Object> s = jdbc.queryForMap("select * from confere_settings where id = 'default'", Map.of());
        List<Order> rows = jdbc.query(
            "select o.*, p.name as plan_name from confere_orders o left join confere_plans p on p.id = o.plan_id " +
            "where o.id = :id and o.market_id = :m", Map.of("id", id, "m", marketId),
            (rs, i) -> {
                String payload = null;
                String qr = null;
                if ("PIX".equals(rs.getString("method")) && "PENDING".equals(rs.getString("status")) && rs.getString("provider_pix_payload") != null) {
                    payload = rs.getString("provider_pix_payload");
                    qr = PixCode.qrPngBase64(payload);
                } else if ("PIX".equals(rs.getString("method")) && "PENDING".equals(rs.getString("status")) && s.get("pix_key") != null) {
                    payload = PixCode.payload((String) s.get("pix_key"),
                        s.get("pix_merchant_name") == null ? "MERCADOFLOW" : (String) s.get("pix_merchant_name"),
                        s.get("pix_merchant_city") == null ? "BRASIL" : (String) s.get("pix_merchant_city"),
                        BigDecimal.valueOf(rs.getInt("amount_cents"), 2), rs.getString("txid"));
                    qr = PixCode.qrPngBase64(payload);
                }
                return new Order((UUID) rs.getObject("id"), rs.getString("plan_name"), rs.getInt("reads"), rs.getInt("amount_cents"),
                    rs.getString("method"), rs.getString("status"), rs.getString("txid"), payload, qr, null,
                    ts(rs.getTimestamp("created_at")), ts(rs.getTimestamp("paid_at")));
            });
        if (rows.isEmpty()) {
            throw new CustomExceptions.NotFound("Pedido não encontrado");
        }
        return rows.get(0);
    }

    @Transactional(readOnly = true)
    public List<Order> orders(UUID marketId) {
        return jdbc.query(
            "select o.*, p.name as plan_name from confere_orders o left join confere_plans p on p.id = o.plan_id " +
            "where o.market_id = :m order by o.created_at desc limit 30", Map.of("m", marketId),
            (rs, i) -> new Order((UUID) rs.getObject("id"), rs.getString("plan_name"), rs.getInt("reads"), rs.getInt("amount_cents"),
                rs.getString("method"), rs.getString("status"), rs.getString("txid"), null, null, null,
                ts(rs.getTimestamp("created_at")), ts(rs.getTimestamp("paid_at"))));
    }

    /** Pagamento confirmado (painel ou webhook): credita as leituras uma vez só. */
    @Transactional
    public void markOrderPaid(UUID orderId, String method, String actor) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "update confere_orders set status = 'PAID', paid_at = now(), confirmed_by = :a where id = :id and status = 'PENDING' " +
            "returning market_id, reads", new MapSqlParameterSource().addValue("id", orderId).addValue("a", actor));
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Pedido já pago, cancelado ou inexistente");
        }
        UUID marketId = (UUID) rows.get(0).get("market_id");
        int reads = ((Number) rows.get(0).get("reads")).intValue();
        credit(marketId, reads, "PURCHASE", orderId.toString(), "Compra de " + reads + " leituras (" + method + ")");
    }

    /** Aviso de pagamento do Asaas: credita se ainda estava pendente. */
    @Transactional
    public boolean markOrderPaidByGateway(UUID orderId) {
        int pending = jdbc.queryForObject("select count(*) from confere_orders where id = :id and status = 'PENDING'",
            Map.of("id", orderId), Integer.class);
        if (pending == 0) {
            return false;
        }
        markOrderPaid(orderId, "PIX", "asaas");
        return true;
    }

    public UUID orderIdBySession(String sessionId) {
        List<UUID> ids = jdbc.queryForList("select id from confere_orders where stripe_session_id = :s", Map.of("s", sessionId), UUID.class);
        return ids.isEmpty() ? null : ids.get(0);
    }

    // ── Apoio ──────────────────────────────────────────────────────────────

    /** Chave em blocos de 4, como no DANFE. */
    static String formatKey(String key) {
        return key.replaceAll("(.{4})(?!$)", "$1 ");
    }

    public String meuDanfeKey() {
        String enc = jdbc.queryForObject("select meudanfe_api_key_enc from confere_settings where id = 'default'", Map.of(), String.class);
        return enc == null || !cipher.isConfigured() ? null : cipher.decrypt(enc);
    }

    private String txid() {
        StringBuilder sb = new StringBuilder("MFC");
        for (int i = 0; i < 17; i++) {
            sb.append(TXID_ALPHABET.charAt(random.nextInt(TXID_ALPHABET.length())));
        }
        return sb.toString();
    }

    private String json(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalArgumentException("Conteúdo inválido");
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> map(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return mapper.readValue(json, LinkedHashMap.class);
        } catch (Exception e) {
            return null;
        }
    }

    private static String cut(String s, int max) {
        return s == null ? null : s.length() > max ? s.substring(0, max) : s;
    }

    private static LocalDateTime ts(Timestamp t) {
        return t == null ? null : t.toLocalDateTime();
    }
}
