package com.pdv2cloud.service.privacy;

import com.pdv2cloud.service.AuditService;
import com.pdv2cloud.service.team.TeamRole;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Pedido de um consumidor final ao mercado (S5 do parecer LGPD; LGPD arts. 18 e 39).
 *
 * O dono ou o gerente informa o CPF e o sistema:
 *  1. mascara esse CPF em todas as notas da loja, com a mesma máscara do
 *     PersonalDataRetentionJob ("***.***.***-NN"), comparando só os dígitos;
 *  2. apaga o perfil de cliente ligado a ele (customer_profiles, chave
 *     HMAC-SHA256 do CPF com o salt da loja, calculado no banco como na
 *     materialização do CustomerIntelligenceService).
 *
 * Depois disso o perfil não volta: a materialização ignora documento sem 11
 * dígitos. A trilha de auditoria guarda só os 2 últimos dígitos.
 */
@Service
public class ConsumerAnonymizationService {

    // Notas ainda em claro com o mesmo CPF (só dígitos). Idempotente: a máscara começa com '*'.
    static final String MASK_SQL =
        "update invoices set cpf_cnpj_destinatario = '***.***.***-' || right(:doc, 2) "
            + "where market_id = :m and cpf_cnpj_destinatario is not null and cpf_cnpj_destinatario not like '*%' "
            + "and regexp_replace(cpf_cnpj_destinatario, '\\D', '', 'g') = :doc";

    // Mesmo hash da materialização: encode(hmac(cpf, salt, 'sha256'), 'hex').
    static final String PROFILE_SQL =
        "delete from customer_profiles where market_id = :m and customer_hash = "
            + "(select encode(hmac(:doc, salt, 'sha256'), 'hex') from market_customer_salts where market_id = :m)";

    public record Result(int notasAlteradas, boolean perfilApagado, String cpfFinal) {}

    private final NamedParameterJdbcTemplate jdbc;
    private final AuditService audit;

    public ConsumerAnonymizationService(NamedParameterJdbcTemplate jdbc, AuditService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    /** Só o dono e o gerente atendem o pedido. Papel nulo = dono antigo ou admin da plataforma. */
    public static void assertCanRequest(TeamRole role) {
        if (role != null && role != TeamRole.DONO && role != TeamRole.GERENTE) {
            throw new AccessDeniedException("Só o dono ou o gerente da loja podem atender pedido de cliente.");
        }
    }

    @Transactional
    public Result anonymize(UUID marketId, String rawCpf) {
        String doc = normalizeCpf(rawCpf);
        MapSqlParameterSource p = new MapSqlParameterSource().addValue("m", marketId).addValue("doc", doc);
        int notes = jdbc.update(MASK_SQL, p);
        int profiles = jdbc.update(PROFILE_SQL, p);
        String end = doc.substring(9);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("cpfFinal", end);
        details.put("notasAlteradas", notes);
        details.put("perfilApagado", profiles > 0);
        audit.logAction("MARKET", marketId, "CONSUMER_ANONYMIZATION", true, details);
        return new Result(notes, profiles > 0, end);
    }

    /** Só dígitos; exige CPF válido (11 dígitos e dígitos verificadores certos). */
    static String normalizeCpf(String raw) {
        String d = raw == null ? "" : raw.replaceAll("\\D", "");
        if (d.length() != 11 || d.chars().distinct().count() == 1 || !checkDigitsOk(d)) {
            throw new IllegalArgumentException("CPF inválido. Confira os 11 números.");
        }
        return d;
    }

    private static boolean checkDigitsOk(String d) {
        for (int pos = 9; pos <= 10; pos++) {
            int sum = 0;
            for (int i = 0; i < pos; i++) {
                sum += (d.charAt(i) - '0') * (pos + 1 - i);
            }
            int dv = (sum * 10) % 11 % 10;
            if (dv != d.charAt(pos) - '0') {
                return false;
            }
        }
        return true;
    }
}
