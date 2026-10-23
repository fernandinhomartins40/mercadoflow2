package com.pdv2cloud.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class SlowRequestLogFilterTest {

    @Test
    void rotaNaoLevaIdNemNumero() {
        assertThat(SlowRequestLogFilter.route(
            "/api/v1/markets/887ff86e-9534-4071-a7fa-2acc20fb7f8c/capital/giro"))
            .isEqualTo("/api/v1/markets/{id}/capital/giro");
        assertThat(SlowRequestLogFilter.route("/api/v1/markets/{id}/supplier-orders/123/items"))
            .isEqualTo("/api/v1/markets/{id}/supplier-orders/{n}/items");
    }
}
