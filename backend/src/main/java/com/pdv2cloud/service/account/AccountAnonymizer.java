package com.pdv2cloud.service.account;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Anonimiza os pedidos de exclusão vencidos (LGPD-03). Chamado pelo
 * AccountDeletionJob, um pedido por vez, cada um na sua transação.
 *
 * Decisão por tabela (detalhe em docs/pie/lotes/lote3-del.md):
 *
 * Sempre (o usuário do pedido; no escopo STORE, todos os usuários da rede):
 *   users                    nome "Conta excluída", e-mail deleted+id@invalid, senha aleatória,
 *                            2FA (segredo e códigos) apagados, inativo, sessões derrubadas.
 *                            A linha fica: notas, auditoria e pedidos apontam para ela.
 *   password_reset_tokens,
 *   mfa_challenges           apagados (tokens).
 *   ownership_transfers      pendentes viram CANCELED (só ids).
 *   colunas de autoria       todo "*_by", "actor" e "*email*" (texto) que guardava o e-mail
 *                            antigo passa a ter o endereço anonimizado (subscription_events,
 *                            team_invites.invited_by, confere_*, ai_*, partner_connect_requests…).
 *   audit_logs               mantida (trilha de segurança, 5 anos pelo job de retenção). Aponta
 *                            para o usuário já anonimizado; o IP sai com a retenção.
 *
 * Escopo STORE (dono sozinho), em todas as lojas da rede:
 *   markets                  nome "Loja excluída", endereço e contato apagados, inativa.
 *                            CNPJ e cidade/UF ficam (pessoa jurídica; vínculo das notas e cobranças).
 *   invoices                 NÃO apagadas (exigência fiscal). CPF/CNPJ do destinatário mascarado
 *                            como no PersonalDataRetentionJob (feito antes, em lotes: maskInvoices).
 *   invoice_items, nfe_documents (XML), confere_*, billing_*, ai_wallets/ledger/orders,
 *   subscriptions, subscription_events, network_contracts (valores)
 *                            mantidos: registros fiscais e financeiros, sem dado pessoal do dono
 *                            além das colunas de autoria acima.
 *   network_contracts        contato (nome, e-mail) apagado; o contrato fica.
 *   customer_profiles,
 *   market_customer_salts    apagados (perfil pseudonimizado de consumidor; sem o sal, o hash
 *                            não liga mais a ninguém).
 *   ai_whatsapp_messages     apagadas (telefone e conversa).
 *   ai_copilot_prefs         telefone do WhatsApp apagado e opt-in desligado.
 *   art_market_brands        apagado (logo, endereço, telefone, WhatsApp da loja).
 *   confere_certificates     apagado (certificado A1 e senha cifrados).
 *   suppliers                e-mail e telefone apagados (contato de vendedor); o fornecedor fica.
 *   team_invites             apagados (e-mails de convidados).
 *   app_notifications        apagadas.
 *   agent_api_keys           desativadas (o agente do caixa para de enviar).
 */
@Service
public class AccountAnonymizer {

    private static final Logger log = LoggerFactory.getLogger(AccountAnonymizer.class);
    static final int BATCH = 5_000;
    static final int MAX_BATCHES = 400;

    // Mesma máscara do PersonalDataRetentionJob; "not like '*%'" torna idempotente.
    static final String MASK_SQL =
        "update invoices i set cpf_cnpj_destinatario = case length(s.doc) "
            + "when 11 then '***.***.***-' || right(s.doc, 2) "
            + "when 14 then '**.***.***/****-' || right(s.doc, 2) "
            + "else '***' end "
            + "from (select id, regexp_replace(cpf_cnpj_destinatario, '\\D', '', 'g') as doc from invoices "
            + "where market_id in (:markets) and cpf_cnpj_destinatario is not null and cpf_cnpj_destinatario not like '*%' "
            + "limit :limit) s "
            + "where i.id = s.id";

    // Colunas de texto que guardam quem fez (e-mail): "*_by", "actor", "*email*". Vêm do catálogo, nunca de entrada externa.
    static final String AUTHOR_COLUMNS_SQL =
        "select c.table_name, c.column_name from information_schema.columns c "
            + "join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name "
            + "where c.table_schema = current_schema() and t.table_type = 'BASE TABLE' "
            + "and c.data_type in ('character varying', 'text') and c.table_name not in ('users', 'account_deletion_requests') "
            + "and (c.column_name like '%\\_by' or c.column_name = 'actor' or c.column_name like '%email%')";

    private final NamedParameterJdbcTemplate jdbc;
    private final PasswordEncoder passwords;

    public AccountAnonymizer(NamedParameterJdbcTemplate jdbc, PasswordEncoder passwords) {
        this.jdbc = jdbc;
        this.passwords = passwords;
    }

    public record Due(UUID id, UUID userId, UUID marketId, String scope) {}

    /** Pedidos vencidos e não desistidos. */
    public List<Due> due(LocalDateTime now) {
        return jdbc.query("select id, user_id, market_id, scope from account_deletion_requests "
                + "where status = 'PENDING' and scheduled_for <= :now order by scheduled_for limit 200",
            Map.of("now", Timestamp.valueOf(now)),
            (rs, i) -> new Due((UUID) rs.getObject("id"), (UUID) rs.getObject("user_id"), (UUID) rs.getObject("market_id"),
                rs.getString("scope")));
    }

    /** Lojas da rede (matriz e filiais). */
    public List<UUID> network(UUID root) {
        return jdbc.queryForList("select id from markets where id = :r or parent_market_id = :r", Map.of("r", root), UUID.class);
    }

    /** CPF/CNPJ do destinatário das notas da rede, em lotes fora da transação (idempotente). */
    public int maskInvoices(List<UUID> marketIds) {
        if (marketIds.isEmpty()) {
            return 0;
        }
        int total = 0;
        for (int i = 0; i < MAX_BATCHES; i++) {
            int n = jdbc.update(MASK_SQL, new MapSqlParameterSource().addValue("markets", marketIds).addValue("limit", BATCH));
            total += n;
            if (n < BATCH) break;
        }
        return total;
    }

    /**
     * Anonimiza um pedido. Confere de novo, com a linha travada, que ele está
     * pendente e vencido: uma desistência de última hora vence o job.
     *
     * @return true se anonimizou
     */
    @Transactional
    public boolean anonymize(UUID requestId, LocalDateTime now) {
        List<Map<String, Object>> rows = jdbc.queryForList("select id, user_id, market_id, scope, status, scheduled_for "
            + "from account_deletion_requests where id = :id for update", Map.of("id", requestId));
        if (rows.isEmpty() || !isDue((String) rows.get(0).get("status"), (Timestamp) rows.get(0).get("scheduled_for"), now)) {
            return false;
        }
        Map<String, Object> r = rows.get(0);
        UUID userId = (UUID) r.get("user_id");
        List<UUID> users = new ArrayList<>(List.of(userId));
        if ("STORE".equals(r.get("scope")) && r.get("market_id") != null) {
            List<UUID> stores = network((UUID) r.get("market_id"));
            if (!stores.isEmpty()) {
                users = jdbc.queryForList("select id from users where market_id in (:m) or id = :u",
                    new MapSqlParameterSource().addValue("m", stores).addValue("u", userId), UUID.class);
                anonymizeStores(stores);
            }
        }
        List<String[]> authorColumns = authorColumns();
        for (UUID id : users) {
            anonymizeUser(id, authorColumns);
        }
        jdbc.update("update account_deletion_requests set status = 'DONE', completed_at = now() where id = :id",
            Map.of("id", requestId));
        log.info("Exclusão de conta: pedido {} anonimizado ({} usuário(s), escopo {})", requestId, users.size(), r.get("scope"));
        return true;
    }

    static boolean isDue(String status, Timestamp scheduledFor, LocalDateTime now) {
        return "PENDING".equals(status) && scheduledFor != null && !scheduledFor.toLocalDateTime().isAfter(now);
    }

    static String anonymousEmail(UUID userId) {
        return "deleted+" + userId + "@invalid";
    }

    private List<String[]> authorColumns() {
        return jdbc.query(AUTHOR_COLUMNS_SQL, Map.of(), (rs, i) -> new String[] {rs.getString(1), rs.getString(2)});
    }

    private void anonymizeUser(UUID userId, List<String[]> authorColumns) {
        List<String> old = jdbc.queryForList("select email from users where id = :u", Map.of("u", userId), String.class);
        String anon = anonymousEmail(userId);
        jdbc.update("update users set name = 'Conta excluída', email = :e, password = :p, totp_enabled = false, totp_secret_enc = null, "
                + "totp_recovery_hashes = null, is_active = false, credentials_changed_at = now(), updated_at = now() where id = :u",
            new MapSqlParameterSource().addValue("e", anon).addValue("p", passwords.encode(UUID.randomUUID().toString()))
                .addValue("u", userId));
        jdbc.update("delete from password_reset_tokens where user_id = :u", Map.of("u", userId));
        jdbc.update("delete from mfa_challenges where user_id = :u", Map.of("u", userId));
        jdbc.update("update ownership_transfers set status = 'CANCELED', decided_at = now() "
            + "where (from_user_id = :u or to_user_id = :u) and status = 'PENDING'", Map.of("u", userId));
        if (old.isEmpty() || old.get(0) == null || old.get(0).equalsIgnoreCase(anon)) {
            return;
        }
        for (String[] col : authorColumns) {
            jdbc.update("update \"" + col[0] + "\" set \"" + col[1] + "\" = :anon where lower(\"" + col[1] + "\") = :old",
                Map.of("anon", anon, "old", old.get(0).toLowerCase()));
        }
    }

    private void anonymizeStores(List<UUID> stores) {
        Map<String, Object> m = Map.of("m", stores);
        jdbc.update("update markets set name = 'Loja excluída', address = null, contact_name = null, contact_email = null, "
            + "contact_phone = null, notes = null, account_owner_email = null, branch_label = null, is_active = false, "
            + "updated_at = now() where id in (:m)", m);
        jdbc.update("update network_contracts set contact_name = null, contact_email = null where market_id in (:m)", m);
        jdbc.update("update ai_copilot_prefs set whatsapp_phone = null, whatsapp_opt_in = false, whatsapp_opt_in_ip = null, "
            + "whatsapp_opt_in_phone = null, updated_at = now() "
            + "where market_id in (:m)", m);
        jdbc.update("update suppliers set email = null, telefone = null, updated_at = now() where market_id in (:m)", m);
        jdbc.update("update agent_api_keys set is_active = false where market_id in (:m)", m);
        for (String table : List.of("ai_whatsapp_messages", "customer_profiles", "market_customer_salts", "art_market_brands",
                "confere_certificates", "team_invites", "app_notifications")) {
            // Nomes vêm só desta lista fixa.
            jdbc.update("delete from " + table + " where market_id in (:m)", m);
        }
    }
}
