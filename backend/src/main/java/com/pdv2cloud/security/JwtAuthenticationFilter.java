package com.pdv2cloud.security;

import java.io.IOException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String AUTH_SCOPE_HEADER = "X-Auth-Scope";
    private static final String MAIN_COOKIE_NAME = "pdv2cloud_token";
    private static final String SUPER_ADMIN_COOKIE_NAME = "pdv2cloud_superadmin_token";

    @Autowired
    private JwtTokenProvider tokenProvider;

    @Autowired
    private CustomUserDetailsService userDetailsService;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String token = getJwtFromRequest(request);

        if (SecurityContextHolder.getContext().getAuthentication() == null
            && StringUtils.hasText(token)
            && tokenProvider.validateToken(token)) {
            String username = tokenProvider.getUsernameFromToken(token);
            UserDetails userDetails = userDetailsService.loadUserByUsername(username);
            UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                userDetails, null, userDetails.getAuthorities());
            authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
            SecurityContextHolder.getContext().setAuthentication(authentication);
        }

        filterChain.doFilter(request, response);
    }

    private String getJwtFromRequest(HttpServletRequest request) {
        String bearerToken = request.getHeader("Authorization");
        if (StringUtils.hasText(bearerToken) && bearerToken.startsWith("Bearer ")) {
            return bearerToken.substring(7);
        }

        Cookie[] cookies = request.getCookies();
        String preferredCookie = shouldPreferSuperAdminCookie(request)
            ? SUPER_ADMIN_COOKIE_NAME
            : MAIN_COOKIE_NAME;
        String fallbackCookie = MAIN_COOKIE_NAME.equals(preferredCookie) ? SUPER_ADMIN_COOKIE_NAME : MAIN_COOKIE_NAME;

        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (preferredCookie.equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
            for (Cookie cookie : cookies) {
                if (fallbackCookie.equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }

        return null;
    }

    private boolean shouldPreferSuperAdminCookie(HttpServletRequest request) {
        String requestUri = request.getRequestURI();
        if (requestUri != null && requestUri.startsWith("/api/v1/super-admin")) {
            return true;
        }

        String authScope = request.getHeader(AUTH_SCOPE_HEADER);
        return StringUtils.hasText(authScope) && "super-admin".equalsIgnoreCase(authScope.trim());
    }
}
