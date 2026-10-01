package com.pdv2cloud.service.billing;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class AsaasServiceTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void errorTextUsesTheProviderDescription() throws Exception {
        var node = json.readTree("{\"errors\":[{\"code\":\"invalid_cpfCnpj\",\"description\":\"O CPF/CNPJ informado é inválido.\"}]}");
        assertThat(AsaasService.errorText(node, 400)).isEqualTo("O CPF/CNPJ informado é inválido.");
        assertThat(AsaasService.errorText(json.readTree("{}"), 502)).isEqualTo("HTTP 502");
    }

    @Test
    void paidInvoiceCoversOneMonthFromItsDueDate() {
        assertThat(AsaasService.periodEnd("2026-10-05").toLocalDate()).isEqualTo(LocalDate.of(2026, 11, 5));
        assertThat(AsaasService.periodEnd("lixo").toLocalDate()).isEqualTo(LocalDate.now().plusMonths(1));
    }

    @Test
    void billingTypeBecomesPaymentMethod() {
        assertThat(AsaasService.paymentMethod("PIX")).isEqualTo("PIX");
        assertThat(AsaasService.paymentMethod("BOLETO")).isEqualTo("BOLETO");
        assertThat(AsaasService.paymentMethod("CREDIT_CARD")).isEqualTo("CARTAO");
    }

    @Test
    void textTreatsBlankAndNullAsMissing() throws Exception {
        var node = json.readTree("{\"a\":\"\",\"b\":null,\"c\":\"x\"}");
        assertThat(AsaasService.text(node, "a")).isNull();
        assertThat(AsaasService.text(node, "b")).isNull();
        assertThat(AsaasService.text(node, "c")).isEqualTo("x");
        assertThat(AsaasService.text(node, "d")).isNull();
    }
}
