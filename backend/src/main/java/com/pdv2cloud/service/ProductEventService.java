package com.pdv2cloud.service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Eventos de produto (tabela product_events, V54).
 *
 * Grava na transação corrente, sem REQUIRES_NEW: uma transação interna que
 * disputa linha com a externa foi o que travou a primeira nota (D-028). Os
 * marcos 'activation.*' são únicos por mercado e o ON CONFLICT DO NOTHING faz a
 * segunda gravação virar no-op em vez de erro — dentro da transação da nota um
 * erro abortaria a ingestão.
 *
 * props nunca leva dado pessoal (e-mail, CPF, IP, nome).
 */
@Service
public class ProductEventService {

    public static final String ACTIVATION_REGISTERED = "activation.registered";
    public static final String ACTIVATION_AGENT_PAIRED = "activation.agent_paired";
    public static final String ACTIVATION_FIRST_INVOICE = "activation.first_invoice";
    public static final String ACTIVATION_FIRST_ANALYSIS = "activation.first_analysis";

    private static final Logger log = LoggerFactory.getLogger(ProductEventService.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final NamedParameterJdbcTemplate jdbc;

    public ProductEventService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void record(UUID marketId, String type) {
        record(marketId, type, Map.of());
    }

    public void record(UUID marketId, String type, Map<String, ?> props) {
        String json;
        try {
            json = JSON.writeValueAsString(props == null ? Map.of() : props);
        } catch (JsonProcessingException e) {
            log.warn("Evento {} sem props: {}", type, e.getMessage());
            json = "{}";
        }
        jdbc.update(
            "insert into product_events (market_id, type, props) values (:marketId, :type, cast(:props as jsonb)) "
                + "on conflict do nothing",
            new MapSqlParameterSource()
                .addValue("marketId", marketId)
                .addValue("type", type)
                .addValue("props", json));
    }

    /** Momento da primeira ocorrência do evento no mercado, se houver. */
    public Optional<LocalDateTime> firstOccurrence(UUID marketId, String type) {
        List<LocalDateTime> rows = jdbc.query(
            "select min(occurred_at) as at from product_events where market_id = :marketId and type = :type",
            new MapSqlParameterSource().addValue("marketId", marketId).addValue("type", type),
            (rs, i) -> {
                java.sql.Timestamp at = rs.getTimestamp("at");
                return at == null ? null : at.toLocalDateTime();
            });
        return rows.isEmpty() ? Optional.empty() : Optional.ofNullable(rows.get(0));
    }
}
