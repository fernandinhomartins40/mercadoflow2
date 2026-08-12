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
 * Uma nota que o sistema recusou por cota — registrada para poder voltar.
 *
 * Antes desta tabela, a nota recusada simplesmente sumia: o contador subia e o
 * XML se perdia. Como o agente reenvia o que não foi aceito, o mesmo arquivo
 * era contado dezenas de vezes — foi o que produziu "10.511 rejeitadas" sobre
 * um acervo de ~2.600 notas em produção, um número que não descrevia nada.
 *
 * Aqui uma nota é UMA linha, com o contador de tentativas ao lado. E a chave
 * permite reprocessar quando a cota renovar.
 *
 * <b>Guarda a chave, nunca o XML.</b> O documento recusado traz CPF de
 * consumidor e itens; armazená-lo seria acumular dado pessoal de algo que o
 * sistema não aceitou — exposição sem contrapartida.
 */
@Entity
@Table(name = "invoice_rejections")
@Getter
@Setter
public class InvoiceRejection {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "market_id", nullable = false)
    private Market market;

    @Column(name = "chave_nfe", nullable = false, length = 44)
    private String chaveNfe;

    @Column(name = "data_emissao")
    private LocalDateTime dataEmissao;

    /** COTA_SEMANAL | OUTRO */
    @Column(nullable = false, length = 24)
    private String reason = "COTA_SEMANAL";

    /** Quantas vezes o agente tentou enviar esta mesma nota. */
    @Column(nullable = false)
    private Integer attempts = 1;

    @Column(name = "first_attempt_at", nullable = false)
    private LocalDateTime firstAttemptAt = LocalDateTime.now();

    @Column(name = "last_attempt_at", nullable = false)
    private LocalDateTime lastAttemptAt = LocalDateTime.now();

    /** Preenchido quando a nota finalmente entra, noutra semana ou após upgrade. */
    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;
}
