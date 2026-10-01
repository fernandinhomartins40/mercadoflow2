package com.pdv2cloud.model.entity;

public enum MarketBillingStatus {
    PENDING,
    ACTIVE,
    TRIAL,
    PAST_DUE,
    /** Pagamento em aberto além da carência: entra, mas só consulta. */
    RESTRICTED,
    SUSPENDED,
    CANCELLED
}
