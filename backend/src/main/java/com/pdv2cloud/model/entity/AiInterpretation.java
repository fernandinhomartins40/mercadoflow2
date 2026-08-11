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
 * Texto produzido para um contexto — por um LLM ou pelo fallback determinístico.
 *
 * Funciona como cache: a chave é (mercado, tarefa, hash do contexto). Se os
 * números da oportunidade não mudaram, o hash é o mesmo e o texto é reusado.
 * Isso importa porque, no modelo BYOK, cada regeração é dinheiro do cliente.
 *
 * O campo {@code deterministic} não é detalhe: a UI precisa distinguir "isto foi
 * a IA que escreveu" de "isto é o texto do sistema". Anunciar um fallback como
 * análise de IA seria enganar o usuário sobre a origem do que ele lê.
 */
@Entity
@Table(name = "ai_interpretations")
@Getter
@Setter
public class AiInterpretation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @Column(nullable = false, length = 32)
    private String task;

    @Column(name = "context_hash", nullable = false, length = 64)
    private String contextHash;

    @Column(name = "subject_type", length = 24)
    private String subjectType;

    @Column(name = "subject_id")
    private UUID subjectId;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Column(length = 24)
    private String provider;

    @Column(length = 120)
    private String model;

    @Column(name = "prompt_version", length = 16)
    private String promptVersion;

    /** TRUE quando veio do fallback do sistema, não de um LLM. */
    @Column(nullable = false)
    private Boolean deterministic = false;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
