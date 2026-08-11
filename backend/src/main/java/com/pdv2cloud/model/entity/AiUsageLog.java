package com.pdv2cloud.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 * Uma linha por chamada de IA tentada.
 *
 * Registra o QUE aconteceu, nunca o conteúdo: apenas o hash do contexto. Um log
 * com o prompt integral criaria mais uma cópia dos dados de venda do cliente,
 * sem que isso ajudasse a diagnosticar nada que o hash não resolva.
 *
 * Serve a duas perguntas que o cliente vai fazer: "minha chave está sendo
 * usada?" e "por que a IA não escreveu nada ontem?".
 */
@Entity
@Table(name = "ai_usage_log")
@Getter
@Setter
public class AiUsageLog {

    /** Como a chamada terminou. */
    public enum Outcome {
        /** O provedor respondeu. */
        OK,
        /** Resposta servida do cache — não houve chamada externa. */
        CACHE,
        /** Todos os provedores falharam; usou-se o texto determinístico. */
        FALLBACK,
        /** O mercado não tem credencial habilitada. */
        SEM_CREDENCIAL,
        /** Falha inesperada no caminho da IA. */
        ERRO
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @Column(nullable = false, length = 32)
    private String task;

    @Column(length = 24)
    private String provider;

    @Column(length = 120)
    private String model;

    @Column(name = "prompt_version", length = 16)
    private String promptVersion;

    @Column(name = "context_hash", length = 64)
    private String contextHash;

    @Column(name = "input_tokens")
    private Integer inputTokens;

    @Column(name = "output_tokens")
    private Integer outputTokens;

    @Column(name = "latency_ms")
    private Integer latencyMs;

    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Outcome outcome;

    @Column(name = "error_message", length = 500)
    private String errorMessage;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
