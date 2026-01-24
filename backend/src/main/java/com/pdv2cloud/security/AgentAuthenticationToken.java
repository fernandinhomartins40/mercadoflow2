package com.pdv2cloud.security;

import java.util.List;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

public class AgentAuthenticationToken extends AbstractAuthenticationToken {
    private final AgentPrincipal principal;

    public AgentAuthenticationToken(AgentPrincipal principal) {
        super(List.of(new SimpleGrantedAuthority("ROLE_AGENT")));
        this.principal = principal;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return principal.getApiKey();
    }

    @Override
    public Object getPrincipal() {
        return principal;
    }
}
