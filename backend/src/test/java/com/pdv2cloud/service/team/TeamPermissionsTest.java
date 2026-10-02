package com.pdv2cloud.service.team;

import static org.assertj.core.api.Assertions.assertThat;

import com.pdv2cloud.model.entity.UserRole;
import com.pdv2cloud.service.team.TeamPermissions.Area;
import org.junit.jupiter.api.Test;

class TeamPermissionsTest {

    private static final String M = "/api/v1/markets/11111111-2222-3333-4444-555555555555";

    private static boolean can(TeamRole role, String method, String path) {
        return TeamPermissions.allowed(role, TeamPermissions.classify(method, M + path), false);
    }

    @Test
    void classifiesAreas() {
        assertThat(TeamPermissions.classify("POST", M + "/team/invites").area()).isEqualTo(Area.TEAM);
        assertThat(TeamPermissions.classify("POST", M + "/billing/checkout").area()).isEqualTo(Area.BILLING);
        assertThat(TeamPermissions.classify("PUT", M + "/subscription/addons/EXTRA_SEAT").area()).isEqualTo(Area.BILLING);
        assertThat(TeamPermissions.classify("GET", M + "/subscription/overview").area()).isEqualTo(Area.OPERATION);
        assertThat(TeamPermissions.classify("POST", M + "/confere/read").area()).isEqualTo(Area.CONFERE);
        assertThat(TeamPermissions.classify("POST", M + "/supplier-orders").area()).isEqualTo(Area.PURCHASING);
        assertThat(TeamPermissions.classify("POST", M + "/copilot/decisions/abc/approve").area()).isEqualTo(Area.COPILOT_DECISION);
        assertThat(TeamPermissions.classify("POST", M + "/ai/chat").area()).isEqualTo(Area.READ_LIKE);
        assertThat(TeamPermissions.classify("PUT", M + "/store-map").area()).isEqualTo(Area.OPERATION);
        assertThat(TeamPermissions.classify("GET", "/api/v1/auth/me")).isNull();
    }

    @Test
    void ownerDoesEverything() {
        assertThat(can(TeamRole.DONO, "POST", "/team/invites")).isTrue();
        assertThat(can(TeamRole.DONO, "POST", "/billing/checkout")).isTrue();
    }

    @Test
    void managerRunsTheStoreButNotBillingOrTeam() {
        assertThat(can(TeamRole.GERENTE, "PUT", "/store-map")).isTrue();
        assertThat(can(TeamRole.GERENTE, "POST", "/billing/checkout")).isFalse();
        assertThat(can(TeamRole.GERENTE, "GET", "/team")).isFalse();
        assertThat(can(TeamRole.GERENTE, "GET", "/subscription/overview")).isTrue();
    }

    @Test
    void buyerBuysButDoesNotOperateTheRest() {
        assertThat(can(TeamRole.COMPRADOR, "POST", "/supplier-orders")).isTrue();
        assertThat(can(TeamRole.COMPRADOR, "PUT", "/store-map")).isFalse();
        assertThat(can(TeamRole.COMPRADOR, "GET", "/intelligence/weekly")).isTrue();
        var decision = TeamPermissions.classify("POST", M + "/copilot/decisions/abc/approve");
        assertThat(TeamPermissions.allowed(TeamRole.COMPRADOR, decision, true)).isTrue();
        assertThat(TeamPermissions.allowed(TeamRole.COMPRADOR, decision, false)).isFalse();
    }

    @Test
    void checkerOnlyUsesConfere() {
        assertThat(can(TeamRole.CONFERENTE, "POST", "/confere/read")).isTrue();
        assertThat(can(TeamRole.CONFERENTE, "GET", "/intelligence/weekly")).isFalse();
        assertThat(TeamPermissions.conferenteShellRead("GET", M + "/subscription")).isTrue();
        assertThat(TeamPermissions.conferenteShellRead("GET", M + "/opportunities")).isFalse();
    }

    @Test
    void financeAndReadOnly() {
        assertThat(can(TeamRole.FINANCEIRO, "POST", "/billing/checkout")).isTrue();
        assertThat(can(TeamRole.FINANCEIRO, "POST", "/supplier-orders")).isFalse();
        assertThat(can(TeamRole.LEITURA, "GET", "/intelligence/weekly")).isTrue();
        assertThat(can(TeamRole.LEITURA, "POST", "/ai/chat")).isTrue();
        assertThat(can(TeamRole.LEITURA, "POST", "/supplier-orders")).isFalse();
    }

    @Test
    void systemRoleWins() {
        assertThat(TeamRole.of("GERENTE", UserRole.MARKET_OWNER)).isEqualTo(TeamRole.DONO);
        assertThat(TeamRole.of("DONO", UserRole.MARKET_MANAGER)).isEqualTo(TeamRole.GERENTE);
        assertThat(TeamRole.of("COMPRADOR", UserRole.MARKET_MANAGER)).isEqualTo(TeamRole.COMPRADOR);
        assertThat(TeamRole.of(null, UserRole.SUPER_ADMIN)).isNull();
    }

    @Test
    void totpMatchesRfc6238Vector() {
        // RFC 6238, apêndice B: segredo "12345678901234567890", T = 59 s → 94287082 (8 dígitos) → 287082.
        String secret = Totp.base32("12345678901234567890".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        assertThat(Totp.code(secret, 1)).isEqualTo("287082");
        assertThat(Totp.verify(secret, "287082", 59)).isTrue();
        assertThat(Totp.verify(secret, "000000", 59)).isFalse();
        assertThat(Totp.base32Decode(secret)).isEqualTo("12345678901234567890".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    }
}
