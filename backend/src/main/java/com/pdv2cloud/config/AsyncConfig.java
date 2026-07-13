package com.pdv2cloud.config;

import com.pdv2cloud.tenancy.TenantContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.TaskDecorator;
import org.springframework.scheduling.annotation.EnableAsync;

@Configuration
@EnableAsync
public class AsyncConfig {

    /**
     * Propaga o TenantContext (ThreadLocal) do request para as threads @Async,
     * para que escritas assíncronas (ex.: auditoria) mantenham o tenant correto
     * perante as policies de Row-Level Security.
     */
    @Bean
    public TaskDecorator tenantContextTaskDecorator() {
        return runnable -> {
            TenantContext.TenantInfo info = TenantContext.get();
            return () -> {
                TenantContext.TenantInfo previous = TenantContext.get();
                try {
                    if (info != null) {
                        TenantContext.set(info);
                    } else {
                        TenantContext.clear();
                    }
                    runnable.run();
                } finally {
                    if (previous != null) {
                        TenantContext.set(previous);
                    } else {
                        TenantContext.clear();
                    }
                }
            };
        };
    }
}
