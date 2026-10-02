package com.pdv2cloud.service.team;

import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.service.PlanService;
import com.pdv2cloud.service.notify.EmailService;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
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
 * Equipe da rede: convites por e-mail (link de 7 dias), papel e loja de cada
 * pessoa, desativar e reativar, e transferência de titularidade com
 * confirmação dos dois lados. Quem chama já foi conferido como dono da rede.
 */
@Service
public class TeamService {

    private static final Logger log = LoggerFactory.getLogger(TeamService.class);
    static final String PASSWORD_RULE = "^(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}$";
    private static final SecureRandom RANDOM = new SecureRandom();

    public record Created(UUID id, String link) {}

    private final NamedParameterJdbcTemplate jdbc;
    private final PlanService plans;
    private final EmailService email;
    private final PasswordEncoder passwords;

    public TeamService(NamedParameterJdbcTemplate jdbc, PlanService plans, EmailService email, PasswordEncoder passwords) {
        this.jdbc = jdbc;
        this.plans = plans;
        this.email = email;
        this.passwords = passwords;
    }

    public UUID rootOf(UUID marketId) {
        return jdbc.queryForObject("select coalesce(parent_market_id, id) from markets where id = :m", Map.of("m", marketId), UUID.class);
    }

    // ── Visão da equipe ──────────────────────────────────────────────────

    public Map<String, Object> overview(UUID root, UUID me) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("stores", jdbc.queryForList("select id, name, (id = :r) as is_root from markets where id = :r or parent_market_id = :r "
            + "order by (id = :r) desc, name", Map.of("r", root)));
        out.put("members", jdbc.query("select u.id, u.name, u.email, u.role, u.team_role, u.is_active, u.last_login_at, u.totp_enabled, "
                + "u.market_id, m.name as store from users u join markets m on m.id = u.market_id "
                + "where (m.id = :r or m.parent_market_id = :r) and u.role in ('MARKET_OWNER', 'MARKET_MANAGER') "
                + "order by (u.role = 'MARKET_OWNER') desc, u.is_active desc, u.name", Map.of("r", root), (rs, i) -> {
                    Map<String, Object> mm = new LinkedHashMap<>();
                    TeamRole role = TeamRole.of(rs.getString("team_role"), com.pdv2cloud.model.entity.UserRole.valueOf(rs.getString("role")));
                    mm.put("id", rs.getObject("id"));
                    mm.put("name", rs.getString("name"));
                    mm.put("email", rs.getString("email"));
                    mm.put("teamRole", role == null ? null : role.name());
                    mm.put("teamRoleLabel", role == null ? null : role.label());
                    mm.put("active", rs.getBoolean("is_active"));
                    mm.put("lastLoginAt", rs.getTimestamp("last_login_at"));
                    mm.put("twoFactor", rs.getBoolean("totp_enabled"));
                    mm.put("storeId", rs.getObject("market_id"));
                    mm.put("store", rs.getString("store"));
                    mm.put("me", me.equals(rs.getObject("id")));
                    return mm;
                }));
        out.put("invites", jdbc.queryForList("select i.id, i.email, i.name, i.team_role, i.expires_at, i.created_at, m.name as store, "
            + "(i.expires_at < now()) as expired from team_invites i join markets m on m.id = i.market_id "
            + "where (m.id = :r or m.parent_market_id = :r) and i.accepted_at is null and i.revoked_at is null order by i.created_at desc",
            Map.of("r", root)));
        out.put("seats", seats(root));
        out.put("roles", java.util.Arrays.stream(TeamRole.values()).filter(r -> r != TeamRole.DONO)
            .map(r -> Map.of("code", r.name(), "label", r.label(), "description", r.description())).toList());
        out.put("transfer", jdbc.queryForList("select t.id, t.expires_at, u.name as to_name, u.email as to_email from ownership_transfers t "
            + "join users u on u.id = t.to_user_id where t.market_id = :r and t.status = 'PENDING' and t.expires_at > now()", Map.of("r", root)));
        return out;
    }

    /** Pessoas ativas + convites em aberto contra o limite do plano (com adicionais). */
    public Map<String, Object> seats(UUID root) {
        int limit = plans.limitsFor(root).seats();
        Integer active = jdbc.queryForObject("select count(*) from users u join markets m on m.id = u.market_id "
            + "where (m.id = :r or m.parent_market_id = :r) and u.is_active", Map.of("r", root), Integer.class);
        Integer pending = jdbc.queryForObject("select count(*) from team_invites i join markets m on m.id = i.market_id "
            + "where (m.id = :r or m.parent_market_id = :r) and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()",
            Map.of("r", root), Integer.class);
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("limit", limit);
        s.put("active", active);
        s.put("pending", pending);
        s.put("full", !PlanType.isUnlimited(limit) && active + pending >= limit);
        return s;
    }

    // ── Convites ─────────────────────────────────────────────────────────

    @Transactional
    public Created invite(UUID root, String actor, String rawEmail, String name, String roleCode, UUID storeId) {
        String mail = rawEmail == null ? "" : rawEmail.trim().toLowerCase();
        if (!mail.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) {
            throw new IllegalArgumentException("E-mail inválido.");
        }
        TeamRole role = TeamRole.parse(roleCode);
        if (role == TeamRole.DONO) {
            throw new IllegalArgumentException("A conta tem um dono só. Para passar a titularidade, use a transferência.");
        }
        UUID store = storeInNetwork(root, storeId);
        if (!jdbc.queryForList("select id from users where lower(email) = :e", Map.of("e", mail), UUID.class).isEmpty()) {
            throw new IllegalArgumentException("Esse e-mail já tem conta no MercadoFlow. Use outro e-mail para esta pessoa.");
        }
        Integer open = jdbc.queryForObject("select count(*) from team_invites i join markets m on m.id = i.market_id "
            + "where (m.id = :r or m.parent_market_id = :r) and lower(i.email) = :e and i.accepted_at is null and i.revoked_at is null "
            + "and i.expires_at > now()", Map.of("r", root, "e", mail), Integer.class);
        if (open > 0) {
            throw new IllegalArgumentException("Já há um convite em aberto para esse e-mail. Use \"Reenviar\".");
        }
        requireSeat(root);
        String token = token();
        UUID id = jdbc.queryForObject("insert into team_invites (market_id, email, name, team_role, token_hash, expires_at, invited_by) "
                + "values (:m, :e, :n, :r, :h, :x, :a) returning id",
            new MapSqlParameterSource().addValue("m", store).addValue("e", mail).addValue("n", trim(name, 120))
                .addValue("r", role.name()).addValue("h", TwoFactorService.sha256(token))
                .addValue("x", Timestamp.valueOf(LocalDateTime.now().plusDays(7))).addValue("a", actor), UUID.class);
        String link = email.link("/aceitar-convite?token=" + token);
        sendInvite(mail, name, role, store, link);
        return new Created(id, link);
    }

    /** Novo link (o anterior deixa de valer) e mais 7 dias. */
    @Transactional
    public Created resend(UUID root, UUID inviteId) {
        Map<String, Object> inv = inviteInNetwork(root, inviteId);
        String token = token();
        jdbc.update("update team_invites set token_hash = :h, expires_at = :x where id = :id",
            new MapSqlParameterSource().addValue("h", TwoFactorService.sha256(token))
                .addValue("x", Timestamp.valueOf(LocalDateTime.now().plusDays(7))).addValue("id", inviteId));
        String link = email.link("/aceitar-convite?token=" + token);
        sendInvite((String) inv.get("email"), (String) inv.get("name"), TeamRole.parse((String) inv.get("team_role")),
            (UUID) inv.get("market_id"), link);
        return new Created(inviteId, link);
    }

    @Transactional
    public void revoke(UUID root, UUID inviteId) {
        inviteInNetwork(root, inviteId);
        jdbc.update("update team_invites set revoked_at = now() where id = :id", Map.of("id", inviteId));
    }

    /** O que o convidado vê antes de criar a senha. */
    public Map<String, Object> inviteInfo(String token) {
        Map<String, Object> inv = validInvite(token);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("email", inv.get("email"));
        out.put("name", inv.get("name"));
        out.put("teamRole", TeamRole.parse((String) inv.get("team_role")).label());
        out.put("store", inv.get("store"));
        return out;
    }

    /** Aceite: cria a pessoa na loja do convite, com o papel escolhido pelo dono. */
    @Transactional
    public String accept(String token, String name, String password) {
        Map<String, Object> inv = validInvite(token);
        if (password == null || !password.matches(PASSWORD_RULE)) {
            throw new IllegalArgumentException("A senha precisa de 8 caracteres ou mais, com letra maiúscula, minúscula, número e caractere especial.");
        }
        String finalName = trim(name, 120) != null ? trim(name, 120) : (String) inv.get("name");
        if (finalName == null || finalName.isBlank()) {
            throw new IllegalArgumentException("Informe o seu nome.");
        }
        String mail = (String) inv.get("email");
        if (!jdbc.queryForList("select id from users where lower(email) = :e", Map.of("e", mail), UUID.class).isEmpty()) {
            throw new IllegalArgumentException("Esse e-mail já tem conta. Entre com ele ou peça outro convite.");
        }
        UUID store = (UUID) inv.get("market_id");
        UUID root = rootOf(store);
        // O próprio convite já ocupa um lugar: aqui só confere quem está ativo.
        int limit = plans.limitsFor(root).seats();
        Integer active = jdbc.queryForObject("select count(*) from users u join markets m on m.id = u.market_id "
            + "where (m.id = :r or m.parent_market_id = :r) and u.is_active", Map.of("r", root), Integer.class);
        if (!PlanType.isUnlimited(limit) && active >= limit) {
            throw new IllegalStateException("A equipe desta conta está completa no plano. Peça ao dono para liberar um lugar.");
        }
        TeamRole role = TeamRole.parse((String) inv.get("team_role"));
        jdbc.update("insert into users (id, email, password, name, role, team_role, market_id, is_active, created_at, updated_at) "
                + "values (gen_random_uuid(), :e, :p, :n, :r, :t, :m, true, now(), now())",
            new MapSqlParameterSource().addValue("e", mail).addValue("p", passwords.encode(password)).addValue("n", finalName)
                .addValue("r", role.systemRole().name()).addValue("t", role.name()).addValue("m", store));
        jdbc.update("update team_invites set accepted_at = now() where id = :id", Map.of("id", inv.get("id")));
        return mail;
    }

    // ── Pessoas ──────────────────────────────────────────────────────────

    @Transactional
    public void setActive(UUID root, UUID me, UUID userId, boolean active) {
        Map<String, Object> u = memberInNetwork(root, userId);
        if (userId.equals(me) || "MARKET_OWNER".equals(u.get("role"))) {
            throw new IllegalArgumentException("O dono não pode ser desativado. Para sair, transfira a titularidade.");
        }
        if (active && !Boolean.TRUE.equals(u.get("is_active"))) {
            requireSeat(root);
        }
        jdbc.update("update users set is_active = :a, updated_at = now() where id = :id", Map.of("a", active, "id", userId));
    }

    @Transactional
    public void change(UUID root, UUID me, UUID userId, String roleCode, UUID storeId) {
        Map<String, Object> u = memberInNetwork(root, userId);
        if (userId.equals(me) || "MARKET_OWNER".equals(u.get("role"))) {
            throw new IllegalArgumentException("O papel do dono não muda por aqui. Para passar a titularidade, use a transferência.");
        }
        TeamRole role = roleCode == null ? TeamRole.of((String) u.get("team_role"), com.pdv2cloud.model.entity.UserRole.MARKET_MANAGER)
            : TeamRole.parse(roleCode);
        if (role == TeamRole.DONO) {
            throw new IllegalArgumentException("A conta tem um dono só. Para passar a titularidade, use a transferência.");
        }
        UUID store = storeId == null ? (UUID) u.get("market_id") : storeInNetwork(root, storeId);
        jdbc.update("update users set team_role = :t, role = :r, market_id = :m, totp_enabled = case when :t in ('DONO','FINANCEIRO') "
                + "then totp_enabled else false end, updated_at = now() where id = :id",
            new MapSqlParameterSource().addValue("t", role.name()).addValue("r", role.systemRole().name()).addValue("m", store)
                .addValue("id", userId));
    }

    // ── Titularidade ─────────────────────────────────────────────────────

    /** O dono pede (com a senha); o novo dono confirma do lado dele. */
    @Transactional
    public UUID startTransfer(UUID root, UUID me, UUID toUserId, String password) {
        String hash = jdbc.queryForObject("select password from users where id = :id", Map.of("id", me), String.class);
        if (password == null || !passwords.matches(password, hash)) {
            throw new IllegalArgumentException("Senha incorreta.");
        }
        Map<String, Object> to = memberInNetwork(root, toUserId);
        if (toUserId.equals(me)) {
            throw new IllegalArgumentException("Escolha outra pessoa da equipe.");
        }
        if (!Boolean.TRUE.equals(to.get("is_active"))) {
            throw new IllegalArgumentException("Reative a pessoa antes de transferir a titularidade.");
        }
        if (!root.equals(to.get("market_id"))) {
            throw new IllegalArgumentException("A titularidade fica na matriz: mude a pessoa para a matriz antes de transferir.");
        }
        jdbc.update("update ownership_transfers set status = 'CANCELED', decided_at = now() where market_id = :r and status = 'PENDING'",
            Map.of("r", root));
        UUID id = jdbc.queryForObject("insert into ownership_transfers (market_id, from_user_id, to_user_id, expires_at) "
                + "values (:r, :f, :t, :x) returning id",
            new MapSqlParameterSource().addValue("r", root).addValue("f", me).addValue("t", toUserId)
                .addValue("x", Timestamp.valueOf(LocalDateTime.now().plusDays(7))), UUID.class);
        String from = jdbc.queryForObject("select name from users where id = :id", Map.of("id", me), String.class);
        email.send((String) to.get("email"), "Você foi convidado para ser o dono da conta no MercadoFlow", "Titularidade da conta",
            List.of(from + " quer passar para você a titularidade da conta. Como dono, você cuida da assinatura e da equipe.",
                "Para aceitar, entre no MercadoFlow e abra Loja → Conta. O pedido vale por 7 dias."),
            "Abrir o MercadoFlow", email.link("/app/configuracoes"));
        return id;
    }

    @Transactional
    public void cancelTransfer(UUID root) {
        jdbc.update("update ownership_transfers set status = 'CANCELED', decided_at = now() where market_id = :r and status = 'PENDING'",
            Map.of("r", root));
    }

    /** Pedido de titularidade esperando a resposta desta pessoa. */
    public List<Map<String, Object>> pendingFor(UUID userId) {
        return jdbc.queryForList("select t.id, t.expires_at, f.name as from_name, m.name as market_name from ownership_transfers t "
            + "join users f on f.id = t.from_user_id join markets m on m.id = t.market_id "
            + "where t.to_user_id = :u and t.status = 'PENDING' and t.expires_at > now()", Map.of("u", userId));
    }

    /** O novo dono aceita: troca os papéis e o dono da matriz. */
    @Transactional
    public void decideTransfer(UUID transferId, UUID userId, boolean accept) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from ownership_transfers where id = :id and to_user_id = :u "
            + "and status = 'PENDING' and expires_at > now() for update", Map.of("id", transferId, "u", userId));
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Esse pedido não está mais valendo.");
        }
        Map<String, Object> t = rows.get(0);
        if (!accept) {
            jdbc.update("update ownership_transfers set status = 'DECLINED', decided_at = now() where id = :id", Map.of("id", transferId));
            return;
        }
        UUID root = (UUID) t.get("market_id");
        UUID from = (UUID) t.get("from_user_id");
        jdbc.update("update users set role = 'MARKET_MANAGER', team_role = 'GERENTE', totp_enabled = false, totp_secret_enc = null, "
            + "totp_recovery_hashes = null, updated_at = now() where id = :id", Map.of("id", from));
        jdbc.update("update users set role = 'MARKET_OWNER', team_role = 'DONO', updated_at = now() where id = :id", Map.of("id", userId));
        jdbc.update("update markets set owner_id = :u, account_owner_email = (select email from users where id = :u), updated_at = now() "
            + "where id = :r", Map.of("u", userId, "r", root));
        jdbc.update("update ownership_transfers set status = 'ACCEPTED', decided_at = now() where id = :id", Map.of("id", transferId));
        String fromEmail = jdbc.queryForObject("select email from users where id = :id", Map.of("id", from), String.class);
        email.send(fromEmail, "A titularidade da conta foi transferida", "Titularidade transferida",
            List.of("O novo dono aceitou. Você continua na equipe como gerente."), null, null);
    }

    // ── Apoio ────────────────────────────────────────────────────────────

    private void requireSeat(UUID root) {
        if (Boolean.TRUE.equals(seats(root).get("full"))) {
            throw new IllegalStateException("A equipe está completa no seu plano. Compre um usuário extra em Minha assinatura "
                + "ou desative alguém para liberar o lugar.");
        }
    }

    private UUID storeInNetwork(UUID root, UUID storeId) {
        UUID store = storeId == null ? root : storeId;
        Integer ok = jdbc.queryForObject("select count(*) from markets where id = :s and (id = :r or parent_market_id = :r)",
            Map.of("s", store, "r", root), Integer.class);
        if (ok == 0) {
            throw new IllegalArgumentException("Loja fora da sua rede.");
        }
        return store;
    }

    private Map<String, Object> memberInNetwork(UUID root, UUID userId) {
        List<Map<String, Object>> r = jdbc.queryForList("select u.* from users u join markets m on m.id = u.market_id "
            + "where u.id = :id and (m.id = :r or m.parent_market_id = :r) and u.role in ('MARKET_OWNER', 'MARKET_MANAGER')",
            Map.of("id", userId, "r", root));
        if (r.isEmpty()) {
            throw new IllegalArgumentException("Pessoa fora da sua equipe.");
        }
        return r.get(0);
    }

    private Map<String, Object> inviteInNetwork(UUID root, UUID inviteId) {
        List<Map<String, Object>> r = jdbc.queryForList("select i.* from team_invites i join markets m on m.id = i.market_id "
            + "where i.id = :id and (m.id = :r or m.parent_market_id = :r) and i.accepted_at is null and i.revoked_at is null",
            Map.of("id", inviteId, "r", root));
        if (r.isEmpty()) {
            throw new IllegalArgumentException("Convite não encontrado.");
        }
        return r.get(0);
    }

    private Map<String, Object> validInvite(String token) {
        if (token == null || !token.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("Convite inválido. Peça um novo convite ao dono da conta.");
        }
        List<Map<String, Object>> r = jdbc.queryForList("select i.*, m.name as store from team_invites i join markets m on m.id = i.market_id "
            + "where i.token_hash = :h", Map.of("h", TwoFactorService.sha256(token)));
        if (r.isEmpty() || r.get(0).get("revoked_at") != null) {
            throw new IllegalArgumentException("Convite inválido. Peça um novo convite ao dono da conta.");
        }
        if (r.get(0).get("accepted_at") != null) {
            throw new IllegalArgumentException("Este convite já foi usado. Entre com o seu e-mail e senha.");
        }
        if (((Timestamp) r.get(0).get("expires_at")).toLocalDateTime().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("Este convite venceu. Peça ao dono da conta para reenviar.");
        }
        return r.get(0);
    }

    private void sendInvite(String to, String name, TeamRole role, UUID store, String link) {
        String storeName = jdbc.queryForObject("select name from markets where id = :m", Map.of("m", store), String.class);
        EmailService.Sent sent = email.send(to, "Convite para a equipe " + storeName + " no MercadoFlow", "Você foi convidado",
            List.of((name == null || name.isBlank() ? "Olá!" : "Olá, " + name.trim().split("\\s+")[0] + "!")
                    + " Você foi convidado para a equipe " + storeName + " no MercadoFlow, como " + role.label() + ".",
                role.description() + ". O convite vale por 7 dias."),
            "Aceitar convite", link);
        if (!sent.ok()) {
            log.warn("Convite não enviado por e-mail para a loja {}: {}", store, sent.error());
        }
    }

    private static String token() {
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        return HexFormat.of().formatHex(raw);
    }

    private static String trim(String v, int max) {
        if (v == null || v.isBlank()) {
            return null;
        }
        String t = v.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }
}
