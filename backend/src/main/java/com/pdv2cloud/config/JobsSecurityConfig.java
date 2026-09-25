package com.pdv2cloud.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * O seed de producao e usado pelo perfil jobs e precisa do encoder, mas nao de
 * uma cadeia HTTP de seguranca. O backend web continua fornecendo o mesmo bean
 * por SecurityConfig.
 */
@Configuration
@Profile("jobs")
public class JobsSecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
