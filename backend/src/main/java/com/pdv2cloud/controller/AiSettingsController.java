package com.pdv2cloud.controller;

import com.pdv2cloud.service.MarketAccessService;
import com.pdv2cloud.service.ai.AiCredentialService;
import com.pdv2cloud.service.ai.AiProvider;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Configuração da IA por mercado (BYOK).
 *
 * Restrito a MARKET_OWNER e ADMIN — não a MARKET_MANAGER: cadastrar uma chave
 * de API é assumir um compromisso financeiro na conta do provedor, e quem faz
 * isso deve ser o dono. Repare que os demais endpoints de inteligência aceitam
 * MARKET_MANAGER; aqui a diferença é deliberada.
 *
 * Nenhuma resposta deste controller contém a chave em claro. O máximo que sai
 * daqui é o {@code keyHint} — os últimos 4 caracteres.
 */
@RestController
@RequestMapping("/api/v1/markets/{marketId}/ai")
@PreAuthorize("hasAnyRole('MARKET_OWNER', 'ADMIN')")
public class AiSettingsController {

    private final AiCredentialService credentialService;
    private final MarketAccessService marketAccessService;

    public AiSettingsController(
        AiCredentialService credentialService,
        MarketAccessService marketAccessService
    ) {
        this.credentialService = credentialService;
        this.marketAccessService = marketAccessService;
    }

    /**
     * Catálogo de provedores disponíveis, para a tela montar o formulário.
     *
     * Inclui a URL padrão e o modelo padrão de cada um: o cliente que só quer
     * "usar o Groq" não precisa descobrir endpoint nem nome de modelo.
     */
    @GetMapping("/providers")
    public ResponseEntity<List<Map<String, Object>>> providers(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        List<Map<String, Object>> catalog = Arrays.stream(AiProvider.values())
            .map(p -> {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", p.name());
                item.put("nome", p.label());
                item.put("gratuito", p.hasFreeTier());
                item.put("urlPadrao", p.defaultBaseUrl());
                item.put("modeloPadrao", p.defaultModel());
                item.put("exigeUrl", p.requiresBaseUrl());
                return item;
            })
            .toList();
        return ResponseEntity.ok(catalog);
    }

    /** As credenciais cadastradas — sem as chaves. */
    @GetMapping("/credentials")
    public ResponseEntity<List<AiCredentialService.CredentialView>> list(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(credentialService.list(marketId));
    }

    /**
     * Cadastra ou atualiza a chave de um provedor.
     *
     * {@code apiKey} vazio numa credencial existente preserva a chave atual —
     * o usuário consegue trocar de modelo sem recolar a chave, que os
     * provedores costumam exibir uma única vez.
     */
    @PutMapping("/credentials")
    public ResponseEntity<?> save(
        @PathVariable("marketId") UUID marketId,
        @RequestBody SaveCredentialRequest request,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        try {
            AiProvider provider = AiProvider.valueOf(request.provider());
            AiCredentialService.CredentialView saved = credentialService.save(
                marketId, provider, request.apiKey(), request.baseUrl(),
                request.model(), request.priority(),
                authentication == null ? null : authentication.getName()
            );
            return ResponseEntity.ok(saved);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", e.getMessage()));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(503).body(Map.of("erro", e.getMessage()));
        }
    }

    /** Chamada real e mínima ao provedor, para o usuário saber que a chave funciona. */
    @PostMapping("/credentials/{credentialId}/test")
    public ResponseEntity<?> test(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("credentialId") UUID credentialId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        try {
            return ResponseEntity.ok(credentialService.test(marketId, credentialId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", e.getMessage()));
        }
    }

    @PostMapping("/credentials/{credentialId}/enabled")
    public ResponseEntity<?> setEnabled(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("credentialId") UUID credentialId,
        @RequestBody Map<String, Boolean> body,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        try {
            credentialService.setEnabled(marketId, credentialId,
                Boolean.TRUE.equals(body.get("enabled")));
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("erro", e.getMessage()));
        }
    }

    /** Apaga a chave do nosso banco. */
    @DeleteMapping("/credentials/{credentialId}")
    public ResponseEntity<Map<String, Object>> delete(
        @PathVariable("marketId") UUID marketId,
        @PathVariable("credentialId") UUID credentialId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        credentialService.delete(marketId, credentialId);
        return ResponseEntity.ok(Map.of("removida", true));
    }

    /** Consumo dos últimos 30 dias: a chave do cliente está sendo usada, e quanto. */
    @GetMapping("/usage")
    public ResponseEntity<Map<String, Object>> usage(
        @PathVariable("marketId") UUID marketId,
        Authentication authentication
    ) {
        marketAccessService.assertCanAccessMarket(marketId, authentication);
        return ResponseEntity.ok(credentialService.usageSummary(marketId));
    }

    public record SaveCredentialRequest(
        String provider,
        String apiKey,
        String baseUrl,
        String model,
        Integer priority
    ) { }
}
