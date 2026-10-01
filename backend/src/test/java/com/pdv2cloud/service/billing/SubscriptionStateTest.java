package com.pdv2cloud.service.billing;

import static org.assertj.core.api.Assertions.assertThat;

import com.pdv2cloud.model.entity.MarketBillingStatus;
import com.pdv2cloud.model.entity.PlanType;
import com.pdv2cloud.service.billing.SubscriptionService.Status;
import com.pdv2cloud.service.billing.SubscriptionService.Subscription;
import java.time.LocalDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class SubscriptionStateTest {

    private static Subscription sub(Status status, String plan, String trialPlan) {
        return new Subscription(UUID.randomUUID(), plan, status, "NONE", null, null, null, null, false, trialPlan,
            null, false, null, null, null, null, null, null);
    }

    @Test
    void trialGivesTheTestedPlan() {
        assertThat(SubscriptionService.effectivePlan(sub(Status.TRIAL, "FREE", "PROFISSIONAL"))).isEqualTo(PlanType.PROFISSIONAL);
    }

    @Test
    void restrictedAndPausedFallBackToFreeLimits() {
        assertThat(SubscriptionService.effectivePlan(sub(Status.RESTRICTED, "PROFISSIONAL", null))).isEqualTo(PlanType.FREE);
        assertThat(SubscriptionService.effectivePlan(sub(Status.PAUSED, "ESSENCIAL", null))).isEqualTo(PlanType.FREE);
        assertThat(SubscriptionService.effectivePlan(sub(Status.FREE, "FREE", null))).isEqualTo(PlanType.FREE);
    }

    @Test
    void pastDueKeepsThePaidPlanDuringGrace() {
        assertThat(SubscriptionService.effectivePlan(sub(Status.PAST_DUE, "ESSENCIAL", null))).isEqualTo(PlanType.ESSENCIAL);
        assertThat(SubscriptionService.effectivePlan(sub(Status.ACTIVE, "REDE", null))).isEqualTo(PlanType.REDE);
    }

    @Test
    void mirrorStatusNeverBlocksFree() {
        assertThat(SubscriptionService.mirrorStatus(Status.FREE)).isEqualTo(MarketBillingStatus.ACTIVE);
        assertThat(SubscriptionService.mirrorStatus(Status.PAUSED)).isEqualTo(MarketBillingStatus.ACTIVE);
        assertThat(SubscriptionService.mirrorStatus(Status.RESTRICTED)).isEqualTo(MarketBillingStatus.RESTRICTED);
        assertThat(SubscriptionService.mirrorStatus(Status.TRIAL)).isEqualTo(MarketBillingStatus.TRIAL);
    }

    @Test
    void every_status_has_a_mirror() {
        for (Status s : Status.values()) {
            assertThat(SubscriptionService.mirrorStatus(s)).isNotNull();
        }
    }

    @Test
    void bannerForTrialPastDueAndRestricted() {
        LocalDateTime now = LocalDateTime.of(2026, 10, 1, 10, 0);
        SubscriptionService.Settings cfg = new SubscriptionService.Settings(7, 7, 30);

        Subscription trial = new Subscription(UUID.randomUUID(), "FREE", Status.TRIAL, "NONE", null, null, null, null, false,
            "ESSENCIAL", now.plusDays(3), true, null, null, null, null, null, null);
        var v = com.pdv2cloud.controller.SubscriptionControllerAccess.view(trial, cfg, now);
        assertThat(v.get("daysLeft")).isEqualTo(3);
        assertThat(v.get("bannerTone")).isEqualTo("INFO");
        assertThat((String) v.get("bannerMessage")).contains("Essencial").contains("faltam 3 dias");
        assertThat(v.get("trialAvailable")).isEqualTo(false);

        Subscription late = new Subscription(UUID.randomUUID(), "ESSENCIAL", Status.PAST_DUE, "STRIPE", null, null, null, null,
            false, null, null, true, now.minusDays(2), null, null, null, null, null);
        v = com.pdv2cloud.controller.SubscriptionControllerAccess.view(late, cfg, now);
        assertThat(v.get("daysLeft")).isEqualTo(5);
        assertThat((String) v.get("bannerMessage")).contains("06/10");

        Subscription restricted = new Subscription(UUID.randomUUID(), "ESSENCIAL", Status.RESTRICTED, "STRIPE", null, null, null,
            null, false, null, null, true, now.minusDays(9), now.minusDays(2), null, null, null, null);
        v = com.pdv2cloud.controller.SubscriptionControllerAccess.view(restricted, cfg, now);
        assertThat(v.get("bannerTone")).isEqualTo("DANGER");
        assertThat(v.get("daysLeft")).isEqualTo(28);

        Subscription free = sub(Status.FREE, "FREE", null);
        v = com.pdv2cloud.controller.SubscriptionControllerAccess.view(free, cfg, now);
        assertThat(v.get("trialAvailable")).isEqualTo(true);
        assertThat(v.get("bannerMessage")).isNull();
    }
}
