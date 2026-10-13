package com.pdv2cloud.security;

import java.util.UUID;

/**
 * ERP parceiro autenticado na API de integração (/api/v1/partner/**).
 * {@code firstParty}: o sistema da mesma empresa (Bipae), com os escopos da casa.
 */
public record PartnerPrincipal(UUID partnerId, String name, String status, boolean firstParty) {
}
