package com.pdv2cloud.service.billing;

import static org.assertj.core.api.Assertions.assertThat;

import com.pdv2cloud.model.entity.PlanType;
import org.junit.jupiter.api.Test;

class EntitlementsTest {

    @Test
    void fallbackLadderMatchesTheOldCodeRules() {
        assertThat(Entitlements.fallbackBool(PlanType.FREE, "price_simulation")).isFalse();
        assertThat(Entitlements.fallbackBool(PlanType.ESSENCIAL, "price_simulation")).isFalse();
        assertThat(Entitlements.fallbackBool(PlanType.PROFISSIONAL, "price_simulation")).isTrue();
        assertThat(Entitlements.fallbackBool(PlanType.REDE, "network_intelligence")).isTrue();
    }

    @Test
    void fallbackPutsCopilotInsideThePlans() {
        assertThat(Entitlements.fallbackBool(PlanType.FREE, "copilot_questions")).isFalse();
        assertThat(Entitlements.fallbackBool(PlanType.ESSENCIAL, "copilot_questions")).isTrue();
        assertThat(Entitlements.fallbackBool(PlanType.ESSENCIAL, "copilot_whatsapp")).isFalse();
        assertThat(Entitlements.fallbackBool(PlanType.PROFISSIONAL, "copilot_autonomy")).isTrue();
        assertThat(Entitlements.fallbackBool(PlanType.FREE, "copilot_brief")).isTrue();
    }

    @Test
    void unknownPlanCountsAsFree() {
        assertThat(Entitlements.fallbackBool(null, "data_export")).isFalse();
    }
}
