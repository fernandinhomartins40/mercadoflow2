package com.pdv2cloud.service.industry;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Porta de entrada dos dados da indústria.
 *
 * Toda leitura de agregado passa por {@link #asIndustry}: numa transação só de
 * leitura, a sessão do banco perde o modo superadmin, ganha a indústria e entra
 * no papel mf_industry_reader, que só enxerga os agregados (e, pela RLS, só as
 * células publicadas dos GTINs aprovados dentro da área do contrato).
 */
@Service
public class IndustryAccessService {

    /** Indústria e contrato vigente vistos pela sessão. */
    public record Context(UUID industryId, String industryName, UUID contractId, String plan, List<String> features,
                          List<String> scopeUfs, List<String> scopeCities, boolean allowNeighborhood,
                          String userEmail, boolean preview) {

        public boolean has(String feature) {
            return features.contains(feature);
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
    private final TransactionTemplate readOnly;
    private final PrivacyPolicyService policies;
    private final ObjectMapper json = new ObjectMapper();

    public IndustryAccessService(NamedParameterJdbcTemplate jdbc, PlatformTransactionManager tx, PrivacyPolicyService policies) {
        this.jdbc = jdbc;
        this.policies = policies;
        this.readOnly = new TransactionTemplate(tx);
        this.readOnly.setReadOnly(true);
        this.readOnly.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** A empresa do usuário logado, em qualquer situação (para o portal explicar o que falta). */
    public Map<String, Object> industryOf(String email) {
        List<Map<String, Object>> u = jdbc.queryForList("select i.id, coalesce(i.trade_name, i.legal_name) as name, i.legal_name, i.cnpj, "
            + "i.status, i.status_reason from users u join industries i on i.id = u.industry_id where lower(u.email) = lower(:e) "
            + "and u.role = 'INDUSTRY_USER' and coalesce(u.is_active, true)", Map.of("e", email));
        if (u.isEmpty()) {
            throw new Denied(403, "Este acesso não está ligado a uma indústria.");
        }
        return new java.util.LinkedHashMap<>(u.get(0));
    }

    /** Contexto do usuário de indústria logado; recusa com a explicação quando não há acesso. */
    public Context forUser(String email) {
        List<Map<String, Object>> u = jdbc.queryForList("select u.industry_id, coalesce(i.trade_name, i.legal_name) as name, i.status "
            + "from users u join industries i on i.id = u.industry_id where lower(u.email) = lower(:e) and u.role = 'INDUSTRY_USER' "
            + "and coalesce(u.is_active, true)", Map.of("e", email));
        if (u.isEmpty()) {
            throw new Denied(403, "Este acesso não está ligado a uma indústria.");
        }
        UUID industryId = (UUID) u.get(0).get("industry_id");
        String status = (String) u.get(0).get("status");
        if (!"ATIVA".equals(status)) {
            throw new Denied(403, "SUSPENSA".equals(status)
                ? "O acesso da sua empresa está suspenso. Fale com o MercadoFlow."
                : "O cadastro da sua empresa ainda está em análise.");
        }
        List<Map<String, Object>> c = jdbc.queryForList("select * from industry_contracts where industry_id = :i and status = 'ATIVO' "
            + "and current_date between starts_on and ends_on order by starts_on desc limit 1", Map.of("i", industryId));
        if (c.isEmpty()) {
            throw new Denied(403, "Sua empresa não tem contrato vigente. Fale com o MercadoFlow para ativar.");
        }
        return context(industryId, (String) u.get(0).get("name"), c.get(0), email, false);
    }

    /** Contexto do superadmin vendo um contrato (mesmo em rascunho) como a indústria verá. */
    public Context forPreview(UUID contractId, String adminEmail) {
        List<Map<String, Object>> c = jdbc.queryForList("select c.*, coalesce(i.trade_name, i.legal_name) as industry_name "
            + "from industry_contracts c join industries i on i.id = c.industry_id where c.id = :c", Map.of("c", contractId));
        if (c.isEmpty()) {
            throw new IllegalArgumentException("Contrato não encontrado.");
        }
        Map<String, Object> row = c.get(0);
        return context((UUID) row.get("industry_id"), (String) row.get("industry_name"), row, adminEmail, true);
    }

    private static Context context(UUID industryId, String name, Map<String, Object> c, String email, boolean preview) {
        return new Context(industryId, name, (UUID) c.get("id"), (String) c.get("plan"), array(c.get("features")),
            array(c.get("scope_ufs")), array(c.get("scope_cities")), Boolean.TRUE.equals(c.get("allow_neighborhood")), email, preview);
    }

    /**
     * Executa {@code work} com a sessão do banco restrita à indústria. As
     * configurações e o papel valem só dentro desta transação (SET LOCAL).
     */
    public <T> T asIndustry(Context ctx, Supplier<T> work) {
        return readOnly.execute(status -> {
            jdbc.queryForList("select set_config('app.is_admin', '', true), set_config('app.current_market', '', true), "
                + "set_config('app.current_industry', :i, true), set_config('app.preview_contract', :c, true)",
                new MapSqlParameterSource().addValue("i", ctx.industryId().toString())
                    .addValue("c", ctx.preview() ? ctx.contractId().toString() : ""));
            jdbc.getJdbcTemplate().execute("set local role mf_industry_reader");
            return work.get();
        });
    }

    /**
     * Registra a consulta e aplica o limite diário. Prévia do superadmin é
     * registrada à parte e não conta no limite da indústria.
     */
    public void log(Context ctx, String endpoint, Map<String, ?> filters, int returned, int suppressed) {
        if (!ctx.preview()) {
            int today = jdbc.queryForObject("select count(*) from industry_access_log where industry_id = :i and not preview "
                + "and at >= current_date", Map.of("i", ctx.industryId()), Integer.class);
            if (today >= policies.current().maxQueriesPerDay()) {
                throw new Denied(429, "Sua empresa chegou ao limite de consultas de hoje. O acesso volta amanhã.");
            }
        }
        String f;
        try {
            f = json.writeValueAsString(filters);
        } catch (Exception e) {
            f = "{}";
        }
        jdbc.update("insert into industry_access_log (industry_id, user_email, endpoint, filters, cells_returned, cells_suppressed, preview) "
            + "values (:i, :u, :e, cast(:f as jsonb), :r, :s, :p)",
            new MapSqlParameterSource().addValue("i", ctx.industryId()).addValue("u", ctx.userEmail()).addValue("e", endpoint)
                .addValue("f", f).addValue("r", returned).addValue("s", suppressed).addValue("p", ctx.preview()));
    }

    @SuppressWarnings("unchecked")
    static List<String> array(Object v) {
        if (v == null) {
            return List.of();
        }
        try {
            if (v instanceof java.sql.Array a) {
                Object[] items = (Object[]) a.getArray();
                return java.util.Arrays.stream(items).map(String::valueOf).toList();
            }
            if (v instanceof String[] s) {
                return List.of(s);
            }
            if (v instanceof List<?> l) {
                return (List<String>) l;
            }
        } catch (java.sql.SQLException e) {
            return List.of();
        }
        return List.of();
    }
}
