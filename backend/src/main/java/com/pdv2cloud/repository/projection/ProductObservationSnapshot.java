package com.pdv2cloud.repository.projection;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

public interface ProductObservationSnapshot {
    UUID getId();
    UUID getInvoiceId();
    LocalDateTime getObservedAt();
    BigDecimal getQuantity();
    BigDecimal getUnitPrice();
    BigDecimal getNetUnitPrice();
    BigDecimal getTotalPrice();
    BigDecimal getNetTotalPrice();
}

