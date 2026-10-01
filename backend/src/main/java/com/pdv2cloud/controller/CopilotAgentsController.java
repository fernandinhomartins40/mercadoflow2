package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.ai.agents.AgentRunner;
import com.pdv2cloud.service.ai.agents.CopilotSettingsService;
import com.pdv2cloud.service.ai.agents.DecisionService;
import com.pdv2cloud.service.ai.agents.LessonService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Agentes do Copiloto: caixa de decisões, preferências e memória da loja. */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/markets/{marketId}/copilot")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER', 'ADMIN')")
public class CopilotAgentsController {

    private final MarketAccessService access;
    private final DecisionService decisions;
    private final CopilotSettingsService settings;
    private final AgentRunner runner;
    private final LessonService lessons;

    public CopilotAgentsController(MarketAccessService access, DecisionService decisions, CopilotSettingsService settings,
                                   AgentRunner runner, LessonService lessons) {
        this.access = access;
        this.decisions = decisions;
        this.settings = settings;
        this.runner = runner;
        this.lessons = lessons;
    }

    @GetMapping("/decisions")
    public Map<String, Object> inbox(@PathVariable UUID marketId, @RequestParam(defaultValue = "abertas") String view,
                                     Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        Map<String, Object> out = new LinkedHashMap<>(decisions.counts(marketId));
        out.put("decisoes", decisions.inbox(marketId, view));
        return out;
    }

    @PostMapping("/decisions/{id}/approve")
    public ResponseEntity<?> approve(@PathVariable UUID marketId, @PathVariable UUID id, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        try {
            return ResponseEntity.ok(decisions.approve(marketId, id, auth.getName()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/decisions/{id}/refuse")
    public ResponseEntity<?> refuse(@PathVariable UUID marketId, @PathVariable UUID id,
                                    @RequestBody(required = false) Map<String, String> body, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        try {
            return ResponseEntity.ok(decisions.refuse(marketId, id, body == null ? null : body.get("motivo"), auth.getName()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", e.getMessage()));
        }
    }

    @PostMapping("/decisions/{id}/explain")
    public DecisionService.Explanation explain(@PathVariable UUID marketId, @PathVariable UUID id, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return decisions.explain(marketId, id);
    }

    @GetMapping("/agents")
    public Map<String, Object> agents(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return Map.of("agentes", settings.agents(marketId), "preferencias", settings.prefs(marketId),
            "licoes", lessons.all(marketId));
    }

    @PutMapping("/agents/{agent}")
    public List<CopilotSettingsService.AgentSettings> saveAgent(@PathVariable UUID marketId, @PathVariable String agent,
                                                                @RequestBody Map<String, Object> body, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return settings.save(marketId, agent, body, auth.getName());
    }

    @PutMapping("/prefs")
    public CopilotSettingsService.Prefs savePrefs(@PathVariable UUID marketId, @RequestBody Map<String, Object> body,
                                                  Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return settings.savePrefs(marketId, body, auth.getName());
    }

    /** "Verificar agora": roda o funil sem esperar a próxima rodada. */
    @PostMapping("/agents/run")
    public AgentRunner.RunResult run(@PathVariable UUID marketId, Authentication auth) {
        access.assertCanAccessMarket(marketId, auth);
        return runner.run(marketId, "MANUAL");
    }
}
