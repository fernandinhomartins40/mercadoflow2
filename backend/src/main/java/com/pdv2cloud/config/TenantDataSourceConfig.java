package com.pdv2cloud.config;

import com.pdv2cloud.tenancy.TenantAwareDataSource;
import javax.sql.DataSource;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Envolve o DataSource principal em {@link TenantAwareDataSource}, que seta
 * app.current_market/app.is_admin na sessão do PostgreSQL a cada conexão,
 * alimentando as policies de Row-Level Security.
 *
 * O Flyway não passa por aqui quando FLYWAY_USER/FLYWAY_PASSWORD estão
 * configurados (cria um DataSource próprio com a role dona do schema).
 */
@Configuration
public class TenantDataSourceConfig {

    @Bean
    public static BeanPostProcessor tenantAwareDataSourceWrapper() {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) {
                if ("dataSource".equals(beanName)
                        && bean instanceof DataSource dataSource
                        && !(bean instanceof TenantAwareDataSource)) {
                    return new TenantAwareDataSource(dataSource);
                }
                return bean;
            }
        };
    }
}
