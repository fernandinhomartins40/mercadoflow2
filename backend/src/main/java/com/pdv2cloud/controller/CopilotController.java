package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.ai.platform.DailyBriefService;
import com.pdv2cloud.service.ai.platform.VoiceService;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Copiloto do lojista: resumo do dia (texto pronto, para ler ou ouvir) e voz. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/copilot")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class CopilotController {

    private final DailyBriefService briefs;
    private final MarketAccessService access;
    private final VoiceService voice;

    public CopilotController(DailyBriefService briefs, MarketAccessService access, VoiceService voice) {
        this.briefs = briefs;
        this.access = access;
        this.voice = voice;
    }

    @GetMapping("/brief")
    public DailyBriefService.Brief brief(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return briefs.today(marketId);
    }

    /** Refaz o resumo de hoje com os números atuais. */
    @PostMapping("/brief/refresh")
    public DailyBriefService.Brief refresh(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return briefs.generate(marketId, java.time.LocalDate.now());
    }

    /** Reserva paga: transcreve áudio curto quando o navegador não reconhece fala. O áudio não é guardado. */
    @PostMapping(value = "/voice/transcribe", consumes = {"audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav",
        "audio/x-wav", "audio/aac"})
    public VoiceService.Transcript transcribe(@PathVariable UUID marketId, @RequestBody byte[] audio,
                                             @RequestHeader("Content-Type") String contentType, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return voice.transcribe(marketId, audio, contentType);
    }

    /** Comando de voz que a lista fixa do celular não reconheceu: o Jev escolhe a ação da tela. */
    @PostMapping("/voice/command")
    public VoiceService.Command command(@PathVariable UUID marketId, @RequestBody Map<String, String> body, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return voice.command(marketId, body.getOrDefault("contexto", ""), body.getOrDefault("texto", ""));
    }
}
