package com.pdv2cloud.service;

import com.pdv2cloud.repository.InvoiceRejectionRepository;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Guarda o que ficou de fora por cota, para que possa voltar.
 *
 * O agente reenvia o que não foi aceito na varredura seguinte. Com a cota
 * semanal, isso significa que uma nota recusada na quinta entra sozinha na
 * segunda — sem intervenção de ninguém. Esta classe existe para que o sistema
 * SAIBA o que ficou de fora nesse meio-tempo, em vez de descartar em silêncio.
 *
 * Nenhum método aqui derruba a ingestão: registrar a recusa é observabilidade,
 * e falhar ao observar não pode custar uma nota válida.
 */
@Service
@Slf4j
public class InvoiceRejectionService {

    private static final String REASON_QUOTA = "COTA_SEMANAL";

    private final InvoiceRejectionRepository repository;

    public InvoiceRejectionService(InvoiceRejectionRepository repository) {
        this.repository = repository;
    }

    /**
     * Registra uma recusa por cota.
     *
     * Em transação própria porque roda dentro do fluxo de ingestão: se aquele
     * fluxo reverter, o registro do que foi recusado deve permanecer.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID marketId, String chaveNfe, LocalDateTime dataEmissao) {
        if (chaveNfe == null || chaveNfe.isBlank()) {
            return;
        }
        try {
            repository.recordAttempt(marketId, chaveNfe, dataEmissao, REASON_QUOTA);
        } catch (Exception exc) {
            log.debug("Falha ao registrar recusa da nota {}: {}", chaveNfe, exc.getMessage());
        }
    }

    /** A nota entrou: marca como resolvida, preservando o rastro. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void resolve(UUID marketId, String chaveNfe) {
        if (chaveNfe == null || chaveNfe.isBlank()) {
            return;
        }
        try {
            repository.markResolved(marketId, chaveNfe, LocalDateTime.now());
        } catch (Exception exc) {
            log.debug("Falha ao resolver recusa da nota {}: {}", chaveNfe, exc.getMessage());
        }
    }

    /**
     * O que ainda falta entrar, para a tela poder dizer ao lojista.
     *
     * A nota mais antiga pendente importa mais que a contagem: ela diz até onde
     * o buraco na série chega, e é isso que explica por que uma análise pode
     * estar incompleta.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> pendingSummary(UUID marketId) {
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            long pending = repository.countPending(marketId);
            out.put("notasPendentes", pending);
            if (pending > 0) {
                LocalDateTime oldest = repository.oldestPending(marketId);
                out.put("maisAntigaPendente", oldest);
                out.put("mensagem", "Estas notas entram automaticamente quando a cota "
                    + "renovar, na próxima segunda-feira.");
            }
        } catch (Exception exc) {
            log.debug("Falha ao resumir recusas do mercado {}: {}", marketId, exc.getMessage());
            out.put("notasPendentes", 0);
        }
        return out;
    }
}
