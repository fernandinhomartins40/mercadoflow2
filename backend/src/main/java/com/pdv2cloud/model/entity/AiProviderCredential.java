package com.pdv2cloud.model.entity;

import com.pdv2cloud.service.ai.AiProvider;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

/**
 * Chave de IA que o cliente cadastrou (BYOK), cifrada em repouso.
 *
 * O campo {@code encryptedApiKey} nunca deve sair desta camada em claro: quem
 * precisa da chave é o {@code LlmClient}, no momento da chamada. Nenhum DTO de
 * resposta carrega esse campo — a API devolve apenas {@code keyHint}.
 */
@Entity
@Table(name = "ai_provider_credentials")
@Getter
@Setter
public class AiProviderCredential {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private AiProvider provider;

    /** Só para CUSTOM; nos demais a URL vem do catálogo. */
    @Column(name = "base_url", length = 500)
    private String baseUrl;

    /** Vazio = modelo padrão do provedor. */
    @Column(length = 120)
    private String model;

    @Column(name = "encrypted_api_key", nullable = false, columnDefinition = "text")
    private String encryptedApiKey;

    @Column(name = "key_hint", length = 16)
    private String keyHint;

    @Column(nullable = false)
    private Boolean enabled = true;

    /** Ordem na cadeia de fallback do mercado; menor primeiro. */
    @Column(nullable = false)
    private Integer priority = 100;

    @Column(name = "last_check_at")
    private LocalDateTime lastCheckAt;

    @Column(name = "last_check_ok")
    private Boolean lastCheckOk;

    @Column(name = "last_check_error", length = 500)
    private String lastCheckError;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "created_by", length = 200)
    private String createdBy;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    /** URL efetiva: a do cadastro quando houver, senão a do catálogo. */
    public String effectiveBaseUrl() {
        return baseUrl != null && !baseUrl.isBlank() ? baseUrl : provider.defaultBaseUrl();
    }

    public String effectiveModel() {
        return model != null && !model.isBlank() ? model : provider.defaultModel();
    }
}
