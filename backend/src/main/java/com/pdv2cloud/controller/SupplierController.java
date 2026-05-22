package com.pdv2cloud.controller;

import com.pdv2cloud.model.dto.SupplierDTO;
import com.pdv2cloud.model.dto.SupplierUpsertRequest;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.model.entity.Supplier;
import com.pdv2cloud.repository.MarketRepository;
import com.pdv2cloud.repository.SupplierRepository;
import com.pdv2cloud.service.MarketAccessService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/markets/{marketId}/suppliers")
public class SupplierController {

    @Autowired private SupplierRepository supplierRepo;
    @Autowired private MarketRepository marketRepo;
    @Autowired private MarketAccessService accessService;

    private static final HttpClient HTTP = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(5))
        .build();

    // ── Listar fornecedores do workspace ────────────────────────────────────

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<SupplierDTO>> list(
            @PathVariable UUID marketId,
            Authentication auth) {

        accessService.assertCanAccessMarket(marketId, auth);

        return ResponseEntity.ok(
            supplierRepo.findByMarketIdAndIsActiveTrueOrderByRazaoSocialAsc(marketId)
                .stream().map(SupplierDTO::from).toList()
        );
    }

    // ── Criar / atualizar fornecedor ────────────────────────────────────────

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SupplierDTO> upsert(
            @PathVariable UUID marketId,
            @RequestBody SupplierUpsertRequest req,
            Authentication auth) {

        accessService.assertCanAccessMarket(marketId, auth);
        if (req.cnpj() == null || req.cnpj().isBlank()) return ResponseEntity.badRequest().build();

        Market market = marketRepo.findById(marketId).orElse(null);
        if (market == null) return ResponseEntity.notFound().build();

        String cnpj = req.cnpj().replaceAll("\\D", "");

        Supplier s = supplierRepo.findByMarketIdAndCnpj(marketId, cnpj)
            .orElse(new Supplier());

        s.setMarket(market);
        s.setCnpj(cnpj);
        s.setRazaoSocial(req.razaoSocial());
        s.setNomeFantasia(req.nomeFantasia());
        s.setEmail(req.email());
        s.setTelefone(req.telefone());
        s.setLogradouro(req.logradouro());
        s.setMunicipio(req.municipio());
        s.setUf(req.uf());
        s.setCep(req.cep());
        s.setSituacaoCadastral(req.situacaoCadastral());
        s.setCnaePrincipal(req.cnaePrincipal());
        s.setDescricaoCnae(req.descricaoCnae());
        s.setPorte(req.porte());
        s.setIsActive(true);

        return ResponseEntity.ok(SupplierDTO.from(supplierRepo.save(s)));
    }

    // ── Remover (soft delete) ───────────────────────────────────────────────

    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Void> delete(
            @PathVariable UUID marketId,
            @PathVariable UUID id,
            Authentication auth) {

        accessService.assertCanAccessMarket(marketId, auth);

        supplierRepo.findById(id).ifPresent(s -> {
            if (s.getMarket().getId().equals(marketId)) {
                s.setIsActive(false);
                supplierRepo.save(s);
            }
        });
        return ResponseEntity.noContent().build();
    }

    // ── Proxy: busca CNPJ na BrasilAPI (evita CORS no browser) ─────────────

    @GetMapping("/cnpj-lookup/{cnpj}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<String> cnpjLookup(
            @PathVariable UUID marketId,
            @PathVariable String cnpj,
            Authentication auth) {

        accessService.assertCanAccessMarket(marketId, auth);

        String digits = cnpj.replaceAll("\\D", "");
        if (digits.length() != 14) {
            return ResponseEntity.badRequest().body("{\"error\":\"CNPJ deve ter 14 dígitos\"}");
        }

        // Tenta BrasilAPI primeiro, fallback ReceitaWS
        String result = fetchCnpj("https://brasilapi.com.br/api/cnpj/v1/" + digits);
        if (result == null) {
            result = fetchCnpj("https://receitaws.com.br/v1/cnpj/" + digits);
        }

        if (result == null) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                .body("{\"error\":\"Não foi possível consultar o CNPJ. Tente novamente.\"}");
        }

        return ResponseEntity.ok()
            .header("Content-Type", "application/json")
            .body(result);
    }

    private String fetchCnpj(String url) {
        try {
            HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(8))
                .header("Accept", "application/json")
                .header("User-Agent", "MercadoFlow/1.0")
                .GET()
                .build();

            HttpResponse<String> resp = HTTP.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() == 200) return resp.body();
        } catch (Exception ignored) {}
        return null;
    }
}
