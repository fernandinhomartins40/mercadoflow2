package com.pdv2cloud.service.billing;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.junit.jupiter.api.Test;

class AsaasWebhookServiceTest {

    @Test
    void onlyMercadoFlowReferencesAreOurs() {
        assertThat(AsaasWebhookService.ours("ai:" + UUID.randomUUID())).isTrue();
        assertThat(AsaasWebhookService.ours("confere:x")).isTrue();
        assertThat(AsaasWebhookService.ours("ind:x")).isTrue();
        assertThat(AsaasWebhookService.ours("sub:a:ESSENCIAL")).isTrue();
        // Outro sistema na mesma conta do Asaas (ex.: cuid) ou sem referência.
        assertThat(AsaasWebhookService.ours("cmvd7cx930001pi01picps381")).isFalse();
        assertThat(AsaasWebhookService.ours(null)).isFalse();
    }

    @Test
    void malformedIdIsNullInsteadOfThrowing() {
        UUID id = UUID.randomUUID();
        assertThat(AsaasWebhookService.uuid(id.toString())).isEqualTo(id);
        assertThat(AsaasWebhookService.uuid("lixo")).isNull();
    }
}
