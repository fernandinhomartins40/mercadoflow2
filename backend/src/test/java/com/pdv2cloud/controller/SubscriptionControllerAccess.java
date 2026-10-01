package com.pdv2cloud.controller;

import com.pdv2cloud.service.billing.SubscriptionService;
import java.time.LocalDateTime;
import java.util.Map;

/** Acesso de teste à montagem da tela da assinatura (método do pacote). */
public final class SubscriptionControllerAccess {

    private SubscriptionControllerAccess() {
    }

    public static Map<String, Object> view(SubscriptionService.Subscription s, SubscriptionService.Settings cfg, LocalDateTime now) {
        return SubscriptionController.view(s, cfg, now);
    }
}
