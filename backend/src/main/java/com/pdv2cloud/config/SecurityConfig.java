package com.pdv2cloud.config;

import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import com.pdv2cloud.security.AgentApiKeyAuthenticationFilter;
import com.pdv2cloud.security.JwtAuthenticationFilter;
import com.pdv2cloud.security.HmacSignatureFilter;
import com.pdv2cloud.security.RateLimitFilter;
import com.pdv2cloud.security.TenantAccessFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Autowired
    private JwtAuthenticationFilter jwtAuthFilter;

    @Autowired
    private AgentApiKeyAuthenticationFilter apiKeyAuthFilter;

    @Autowired
    private HmacSignatureFilter hmacSignatureFilter;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @Autowired
    private TenantAccessFilter tenantAccessFilter;

    @Value("${cors.allowed-origins}")
    private String allowedOrigins;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/login", "/api/v1/auth/register").permitAll()
                .requestMatchers("/api/v1/super-admin/auth/login", "/api/v1/super-admin/auth/logout").permitAll()
                .requestMatchers("/actuator/health", "/health", "/api/v1/health").permitAll()
                .requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
                .requestMatchers("/api/v1/downloads/**").permitAll()
                .requestMatchers("/api/v1/catalog/images/**").permitAll()
                // Pareamento do Agente Mercado Flow: o agente ainda nao tem credencial
                // alguma nestes passos. Protegido por codigo efemero de alta entropia,
                // segredo do agente e rate limit dedicado (RateLimitFilter).
                // /approve fica de fora: exige usuario autenticado.
                .requestMatchers("/api/v1/agent-pairing/start",
                                 "/api/v1/agent-pairing/claim",
                                 "/api/v1/agent-pairing/cancel").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/agent-pairing/session/*").permitAll()
                .requestMatchers("/api/v1/agent/**").hasRole("AGENT")
                .requestMatchers("/api/v1/ingest/**").hasRole("AGENT")
                .requestMatchers("/api/v1/markets/**").hasAnyRole("MARKET_OWNER", "MARKET_MANAGER", "ADMIN", "SUPER_ADMIN")
                .requestMatchers("/api/v1/industries/**").hasAnyRole("INDUSTRY_USER", "ADMIN")
                .requestMatchers("/api/v1/admin/**").hasAnyRole("ADMIN", "SUPER_ADMIN")
                .requestMatchers("/api/v1/super-admin/**").hasRole("SUPER_ADMIN")
                .anyRequest().authenticated()
            )
            .addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(apiKeyAuthFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterAfter(hmacSignatureFilter, AgentApiKeyAuthenticationFilter.class)
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
            // Roda apos todos os filtros de autenticacao: popula o TenantContext e
            // valida {marketId} da URL contra o tenant do principal (isolamento estrutural)
            .addFilterAfter(tenantAccessFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception {
        return configuration.getAuthenticationManager();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(allowedOrigins.split(",")));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }
}
