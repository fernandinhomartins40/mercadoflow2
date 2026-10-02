package com.pdv2cloud.security;

import com.pdv2cloud.model.entity.UserRole;
import java.util.Collection;
import java.util.UUID;
import org.springframework.security.core.GrantedAuthority;

/**
 * UserDetails enriquecido com o tenant (marketId) e o papel do usuário,
 * evitando novas consultas ao banco para resolver o contexto de tenant.
 */
public class AppUserDetails extends org.springframework.security.core.userdetails.User {

    private final UUID marketId;
    private final UserRole role;
    private final com.pdv2cloud.service.team.TeamRole teamRole;

    public AppUserDetails(
            String username,
            String password,
            boolean enabled,
            Collection<? extends GrantedAuthority> authorities,
            UUID marketId,
            UserRole role) {
        this(username, password, enabled, authorities, marketId, role, null);
    }

    public AppUserDetails(
            String username,
            String password,
            boolean enabled,
            Collection<? extends GrantedAuthority> authorities,
            UUID marketId,
            UserRole role,
            com.pdv2cloud.service.team.TeamRole teamRole) {
        super(username, password, enabled, true, true, true, authorities);
        this.marketId = marketId;
        this.role = role;
        this.teamRole = teamRole;
    }

    /** Papel de equipe (null para superadmin, admin e indústria). */
    public com.pdv2cloud.service.team.TeamRole getTeamRole() {
        return teamRole;
    }

    public UUID getMarketId() {
        return marketId;
    }

    public UserRole getRole() {
        return role;
    }
}
