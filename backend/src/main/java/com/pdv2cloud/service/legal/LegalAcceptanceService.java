package com.pdv2cloud.service.legal;

import com.pdv2cloud.model.entity.UserRole;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Aceite registrado dos documentos legais (S1 do parecer LGPD).
 *
 * Termos de uso e Política de privacidade valem para todo usuário de mercado;
 * o Contrato de tratamento de dados (DPA) só para o dono da loja, que
 * representa o mercado controlador. Superadmin não aceita nada.
 * Quando a versão muda, quem não aceitou a vigente vê a tela de aceite.
 */
@Service
public class LegalAcceptanceService {

    /** Versão vigente. Mantenha igual à LEGAL_VERSION de frontend/src/screens/legal/LegalPage.tsx. */
    public static final String VERSION = "2026-10-22";

    public static final String TERMS = "TERMS";
    public static final String PRIVACY = "PRIVACY";
    public static final String DPA = "DPA";

    private final NamedParameterJdbcTemplate jdbc;

    public LegalAcceptanceService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Documentos que este papel precisa aceitar. */
    public static List<String> requiredFor(UserRole role) {
        if (role == null) {
            return List.of();
        }
        return switch (role) {
            case MARKET_OWNER -> List.of(TERMS, PRIVACY, DPA);
            case MARKET_MANAGER, ADMIN -> List.of(TERMS, PRIVACY);
            // Superadmin não precisa; indústria e vendedor têm portal e contrato próprios.
            default -> List.of();
        };
    }

    /** Documentos da versão vigente que ainda faltam para a pessoa. */
    public List<String> missing(UUID userId, UserRole role) {
        List<String> required = requiredFor(role);
        if (required.isEmpty() || userId == null) {
            return List.of();
        }
        Set<String> accepted = new HashSet<>();
        for (Map<String, Object> row : jdbc.queryForList(
            "select document, version from legal_acceptances where user_id = :u",
            new MapSqlParameterSource("u", userId))) {
            if (VERSION.equals(row.get("version"))) {
                accepted.add((String) row.get("document"));
            }
        }
        List<String> out = new ArrayList<>();
        for (String doc : required) {
            if (!accepted.contains(doc)) {
                out.add(doc);
            }
        }
        return out;
    }

    public boolean required(UUID userId, UserRole role) {
        return !missing(userId, role).isEmpty();
    }

    /**
     * Grava o aceite da versão vigente dos documentos que faltam. Devolve
     * quantas linhas entraram. Quem chama roda em TenantContext.runAsSystem.
     */
    public int record(UUID userId, UUID marketId, UserRole role, String ip, String userAgent) {
        int count = 0;
        for (String doc : missing(userId, role)) {
            count += jdbc.update(
                "insert into legal_acceptances (user_id, market_id, document, version, accepted_at, ip, user_agent) "
                    + "values (:u, :m, :d, :v, now(), :ip, :ua) on conflict (user_id, document, version) do nothing",
                new MapSqlParameterSource()
                    .addValue("u", userId)
                    .addValue("m", marketId)
                    .addValue("d", doc)
                    .addValue("v", VERSION)
                    .addValue("ip", cut(ip, 64))
                    .addValue("ua", cut(userAgent, 500)));
        }
        return count;
    }

    private static String cut(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() > max ? value.substring(0, max) : value;
    }
}
