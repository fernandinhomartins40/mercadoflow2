package com.pdv2cloud.controller;

import com.pdv2cloud.model.entity.WeeklyDigest;
import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.ai.WeeklyDigestService;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * O resumo semanal da loja: "como foi minha semana?".
 *
 * O job gera na madrugada de segunda; estes endpoints apenas leem. O
 * {@code /generate} existe para quem não quer esperar a próxima segunda —
 * loja recém-instalada, ou quem acabou de configurar a chave de IA.
 */
@RestController
@RequestMapping("/api/v1/markets/{marketId}/intelligence/weekly")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class WeeklyDigestController {

    private final WeeklyDigestService digestService;
    private final MarketAccessService marketAccessService;

    public WeeklyDigestController(
        WeeklyDigestService digestService,
        MarketAccessService marketAccessService
    ) {
        this.digestService = digestService;
        this.marketAccessService = marketAccessService;
    }

    /** Os resumos das últimas semanas, do mais recente para o mais antigo. */
    @GetMapping
    public ResponseEntity<List<DigestDTO>> list(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(digestService.recent(marketId)
            .stream().map(DigestDTO::from).toList());
    }

    /**
     * Gera o resumo da semana passada agora.
     *
     * Idempotente: rodar de novo atualiza a mesma semana em vez de duplicar.
     */
    @PostMapping("/generate")
    public ResponseEntity<?> generate(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return digestService.generateForLastWeek(marketId)
            .<ResponseEntity<?>>map(d -> ResponseEntity.ok(DigestDTO.from(d)))
            .orElseGet(() -> ResponseEntity.ok(Map.of(
                "gerado", false,
                "motivo", "Não houve vendas registradas na semana passada."
            )));
    }

    /**
     * DTO achatado: a entidade tem associação lazy com o mercado, que
     * serializada direto daria LazyInitializationException.
     */
    public record DigestDTO(
        UUID id,
        LocalDate semanaDe,
        LocalDate semanaAte,
        String resumo,
        Map<String, Object> numeros,
        /** TRUE quando o texto é do sistema, não de um modelo. A UI distingue. */
        boolean textoDoSistema,
        String provedor,
        LocalDateTime geradoEm
    ) {
        static DigestDTO from(WeeklyDigest d) {
            return new DigestDTO(
                d.getId(), d.getWeekStart(), d.getWeekEnd(), d.getSummary(),
                d.getMetrics(), Boolean.TRUE.equals(d.getDeterministic()),
                d.getProvider(), d.getCreatedAt()
            );
        }
    }
}
