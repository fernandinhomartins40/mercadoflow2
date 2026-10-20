package com.pdv2cloud.service.billing;

import com.pdv2cloud.tenancy.TenantContext;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Conecta os avisos de pagamento do Asaas na subida do servidor web, quando a
 * chave existe e o aviso ainda não foi cadastrado. Fora da thread principal:
 * o Asaas fora do ar não atrasa a subida.
 */
@Profile("!jobs")
@Component
class AsaasWebhookAutoConnect {

    private final AsaasService asaas;

    AsaasWebhookAutoConnect(AsaasService asaas) {
        this.asaas = asaas;
    }

    @EventListener(ApplicationReadyEvent.class)
    void connect() {
        Thread t = new Thread(() -> TenantContext.runAsSystem(asaas::autoConnectWebhook), "asaas-webhook-auto");
        t.setDaemon(true);
        t.start();
    }
}
