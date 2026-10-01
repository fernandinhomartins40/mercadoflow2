package com.pdv2cloud.service.billing;

import com.pdv2cloud.service.notify.EmailService;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Avisos ao lojista: faixa no app e e-mail para os donos da conta.
 *
 * Cada aviso tem uma chave (ex.: "trial-ending:2026-10-08"): o mesmo aviso não
 * é criado nem enviado duas vezes, por mais que o job diário rode.
 */
@Service
public class NotificationService {

    public enum Severity { INFO, WARNING, DANGER }

    public record Notice(UUID id, String kind, String severity, String title, String body, String actionLabel, String actionUrl,
                         LocalDateTime createdAt, LocalDateTime readAt) {}

    private final NamedParameterJdbcTemplate jdbc;
    private final EmailService email;

    public NotificationService(NamedParameterJdbcTemplate jdbc, EmailService email) {
        this.jdbc = jdbc;
        this.email = email;
    }

    /** Cria o aviso (se ainda não existe) e, se pedido, manda o e-mail. Devolve se era novo. */
    public boolean notify(UUID marketId, String kind, String dedupKey, Severity severity, String title, String body,
                          String actionLabel, String actionUrl, boolean sendEmail) {
        List<UUID> created = jdbc.queryForList("insert into app_notifications (market_id, kind, severity, title, body, action_label, "
                + "action_url, dedup_key) values (:m, :k, :s, :t, :b, :al, :au, :d) on conflict (market_id, dedup_key) do nothing returning id",
            new MapSqlParameterSource().addValue("m", marketId).addValue("k", kind).addValue("s", severity.name())
                .addValue("t", title).addValue("b", body).addValue("al", actionLabel).addValue("au", actionUrl).addValue("d", dedupKey),
            UUID.class);
        if (created.isEmpty()) {
            return false;
        }
        if (sendEmail) {
            boolean any = false;
            for (String to : owners(marketId)) {
                any |= email.send(to, title, title, List.of(body), actionLabel, actionUrl == null ? null : email.link(actionUrl)).ok();
            }
            if (any) {
                jdbc.update("update app_notifications set emailed_at = now() where id = :id", Map.of("id", created.get(0)));
            }
        }
        return true;
    }

    /** Avisos recentes do mercado (os da matriz valem para as filiais). */
    public List<Notice> recent(UUID marketId, int limit) {
        return jdbc.query("select * from app_notifications where market_id in (:m, coalesce((select parent_market_id from markets where id = :m), :m)) "
                + "order by created_at desc limit :l",
            new MapSqlParameterSource().addValue("m", marketId).addValue("l", limit), (rs, i) -> new Notice((UUID) rs.getObject("id"),
                rs.getString("kind"), rs.getString("severity"), rs.getString("title"), rs.getString("body"), rs.getString("action_label"),
                rs.getString("action_url"), ts(rs.getTimestamp("created_at")), ts(rs.getTimestamp("read_at"))));
    }

    public void markRead(UUID marketId, UUID id) {
        jdbc.update("update app_notifications set read_at = coalesce(read_at, now()) where id = :id "
                + "and market_id in (:m, coalesce((select parent_market_id from markets where id = :m), :m))",
            Map.of("id", id, "m", marketId));
    }

    /** E-mails dos donos ativos da rede. */
    List<String> owners(UUID marketId) {
        return jdbc.queryForList("select distinct u.email from users u join markets m on m.id = u.market_id "
            + "where (m.id = :m or m.parent_market_id = :m) and u.role = 'MARKET_OWNER' and u.is_active", Map.of("m", marketId), String.class);
    }

    private static LocalDateTime ts(Timestamp t) {
        return t == null ? null : t.toLocalDateTime();
    }
}
