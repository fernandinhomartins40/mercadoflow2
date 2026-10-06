package com.pdv2cloud.security;

import java.util.UUID;

/** ERP parceiro autenticado na API de integração (/api/v1/partner/**). */
public record PartnerPrincipal(UUID partnerId, String name, String status) {
}
