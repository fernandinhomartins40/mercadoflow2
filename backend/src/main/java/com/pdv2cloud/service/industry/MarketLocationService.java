package com.pdv2cloud.service.industry;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.dto.InvoiceDTO;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Endereço da loja, que decide em que bairro, cidade e UF a venda entra.
 *
 * Origens, da mais confiável para a menos: MANUAL (superadmin), NFCE_EMIT
 * (emitente da NFC-e do caixa, que é a própria loja), NFE_DEST (Confere) e
 * CNPJ (cadastro na Receita). Uma origem nunca sobrescreve outra mais confiável.
 */
@Service
@Slf4j
public class MarketLocationService {

    private static final List<String> RANK = List.of("CNPJ", "NFE_DEST", "NFCE_EMIT", "MANUAL");

    private final NamedParameterJdbcTemplate jdbc;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
    private final ObjectMapper json = new ObjectMapper();

    public MarketLocationService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Do emitente da NFC-e. Só vale quando o CNPJ emitente é o da loja (ou a
     * loja ainda não tem CNPJ): nota de terceiro não muda o endereço.
     * Em transação própria: se falhar, a nota que está entrando não é perdida.
     */
    @org.springframework.transaction.annotation.Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public void fromInvoice(UUID marketId, InvoiceDTO dto) {
        InvoiceDTO.Emitente e = dto.getEmitente();
        if (e == null || e.getCodigoMunicipio() == null || e.getUf() == null) {
            return;
        }
        List<String> cnpj = jdbc.queryForList("select cnpj from markets where id = :id", Map.of("id", marketId), String.class);
        String own = cnpj.isEmpty() || cnpj.get(0) == null ? "" : cnpj.get(0).replaceAll("\\D", "");
        String emit = dto.getCnpjEmitente() == null ? "" : dto.getCnpjEmitente().replaceAll("\\D", "");
        if (own.length() == 14 && !own.equals(emit)) {
            return;
        }
        save(marketId, e.getLogradouro(), e.getNumero(), e.getBairro(), e.getMunicipio(), e.getCodigoMunicipio(), e.getUf(), e.getCep(), "NFCE_EMIT");
    }

    /** Endereço digitado pelo superadmin: vale sobre todos os outros. */
    public Map<String, Object> manual(UUID marketId, Map<String, Object> b) {
        String code = b.get("cityCode") == null ? "" : String.valueOf(b.get("cityCode")).replaceAll("\\D", "");
        String uf = b.get("uf") == null ? "" : String.valueOf(b.get("uf")).trim().toUpperCase(Locale.ROOT);
        if (code.length() != 7 || !uf.matches("[A-Z]{2}")) {
            throw new IllegalArgumentException("Informe o código IBGE do município (7 dígitos) e a UF.");
        }
        if (b.get("city") == null || String.valueOf(b.get("city")).isBlank()) {
            throw new IllegalArgumentException("Informe a cidade.");
        }
        save(marketId, str(b.get("street")), str(b.get("number")), str(b.get("neighborhood")), str(b.get("city")), code, uf,
            str(b.get("postalCode")), "MANUAL");
        return jdbc.queryForMap("select * from market_locations where market_id = :m", Map.of("m", marketId));
    }

    /** Busca pelo CNPJ da loja na BrasilAPI (dados públicos da Receita). */
    public Map<String, Object> fromCnpj(UUID marketId) {
        List<String> cnpj = jdbc.queryForList("select cnpj from markets where id = :id", Map.of("id", marketId), String.class);
        String digits = cnpj.isEmpty() || cnpj.get(0) == null ? "" : cnpj.get(0).replaceAll("\\D", "");
        if (digits.length() != 14) {
            throw new IllegalArgumentException("A loja não tem CNPJ cadastrado.");
        }
        JsonNode n;
        try {
            HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create("https://brasilapi.com.br/api/cnpj/v1/" + digits))
                .timeout(Duration.ofSeconds(12)).header("User-Agent", "MercadoFlow").GET().build(), HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() != 200) {
                throw new IllegalArgumentException("A consulta do CNPJ não encontrou a empresa (HTTP " + r.statusCode() + ").");
            }
            n = json.readTree(r.body());
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("Não foi possível consultar o CNPJ agora. Tente de novo ou preencha à mão.");
        }
        String code = n.path("codigo_municipio_ibge").asText("");
        if (code.length() != 7) {
            throw new IllegalArgumentException("A consulta do CNPJ não trouxe o código do município. Preencha à mão.");
        }
        String street = (n.path("descricao_tipo_de_logradouro").asText("") + " " + n.path("logradouro").asText("")).trim();
        save(marketId, street, n.path("numero").asText(null), n.path("bairro").asText(null), n.path("municipio").asText(null),
            code, n.path("uf").asText(null), n.path("cep").asText(null), "CNPJ");
        return jdbc.queryForMap("select * from market_locations where market_id = :m", Map.of("m", marketId));
    }

    /** Lojas com venda nos últimos 60 dias e o endereço (ou a falta dele), para o superadmin. */
    public List<Map<String, Object>> overview() {
        return jdbc.queryForList("select m.id, m.name, m.cnpj, m.plan_type, l.neighborhood, l.city, l.city_code, l.uf, l.source, "
            + "coalesce(dp.status, 'PARTICIPA') as participation, "
            + "(select max(i.data_emissao) from invoices i where i.market_id = m.id) as last_sale "
            + "from markets m left join market_locations l on l.market_id = m.id "
            + "left join market_data_participation dp on dp.market_id = m.id "
            + "where coalesce(m.is_active, true) order by l.city_code is null desc, m.name", Map.of());
    }

    private void save(UUID marketId, String street, String number, String neighborhood, String city, String cityCode, String uf,
                      String cep, String source) {
        List<String> current = jdbc.queryForList("select source from market_locations where market_id = :m", Map.of("m", marketId), String.class);
        if (!current.isEmpty() && RANK.indexOf(current.get(0)) > RANK.indexOf(source)) {
            return;
        }
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("m", marketId).addValue("s", cut(street, 120))
            .addValue("n", cut(number, 20)).addValue("b", cut(neighborhood == null ? null
                : neighborhood.trim().replaceAll("\\s+", " ").toUpperCase(Locale.ROOT), 80))
            .addValue("c", cut(city, 80)).addValue("cc", cut(cityCode, 7)).addValue("uf", cut(uf == null ? null : uf.toUpperCase(Locale.ROOT), 2))
            .addValue("cep", cut(cep == null ? null : cep.replaceAll("\\D", ""), 8)).addValue("src", source);
        // Só grava quando algo mudou: a nota chega a cada venda.
        jdbc.update("insert into market_locations (market_id, street, number, neighborhood, city, city_code, uf, postal_code, source) "
            + "values (:m, :s, :n, :b, :c, :cc, :uf, :cep, :src) on conflict (market_id) do update set street = excluded.street, "
            + "number = excluded.number, neighborhood = excluded.neighborhood, city = excluded.city, city_code = excluded.city_code, "
            + "uf = excluded.uf, postal_code = excluded.postal_code, source = excluded.source, updated_at = now() "
            + "where (market_locations.neighborhood, market_locations.city_code, market_locations.uf, market_locations.source, "
            + "market_locations.street) is distinct from (excluded.neighborhood, excluded.city_code, excluded.uf, excluded.source, excluded.street)", p);
    }

    private static String str(Object v) {
        return v == null || String.valueOf(v).isBlank() ? null : String.valueOf(v).trim();
    }

    private static String cut(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }
}
