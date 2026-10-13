package com.pdv2cloud.controller;

import com.pdv2cloud.security.PartnerPrincipal;
import com.pdv2cloud.service.confere.ConfereEntryExport;
import com.pdv2cloud.service.confere.ConfereService;
import com.pdv2cloud.service.partner.PartnerCallLog;
import com.pdv2cloud.service.partner.PartnerGuard;
import com.pdv2cloud.service.partner.PartnerScopes;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
 * O Confere dentro do Bipae (docs/BIPAE-INSTRUCOES-PARA-IA.md): o Bipae é a
 * tela; a leitura das notas na Sefaz, o certificado A1, o saldo de leituras, a
 * conversão caixa → unidade e a conferência continuam aqui, os mesmos do
 * Confere do MercadoFlow. A loja precisa ter autorizado o escopo confere:use.
 *
 * Quem fez cada ação no Bipae vai em {@code actor} e fica registrado como
 * "Bipae: nome".
 */
@Profile("!jobs")
@RestController
@RequestMapping("/api/v1/partner/markets/{id}/confere")
public class PartnerConfereController {

    private final ConfereService confere;
    private final ConfereEntryExport entries;
    private final PartnerGuard guard;
    private final PartnerCallLog callLog;

    public PartnerConfereController(ConfereService confere, ConfereEntryExport entries, PartnerGuard guard, PartnerCallLog callLog) {
        this.confere = confere;
        this.entries = entries;
        this.guard = guard;
        this.callLog = callLog;
    }

    private static String actor(PartnerPrincipal p, Object who) {
        String name = who == null ? "" : String.valueOf(who).trim();
        if (name.length() > 120) name = name.substring(0, 120);
        return p.name() + (name.isEmpty() ? "" : ": " + name);
    }

    /** Guarda, executa e registra. Erros de regra do Confere voltam 400 com a frase dele. */
    private ResponseEntity<?> run(UUID marketId, String method, String path, HttpServletRequest request,
                                  Authentication authentication, java.util.function.Function<PartnerPrincipal, Object> work) {
        PartnerPrincipal p = (PartnerPrincipal) authentication.getPrincipal();
        ResponseEntity<?> denied = guard.store(p, marketId, method, path, PartnerScopes.CONFERE_USE, request);
        if (denied != null) return denied;
        try {
            Object out = work.apply(p);
            callLog.record(p.partnerId(), marketId, method, path, null, 200);
            return ResponseEntity.ok(out);
        } catch (IllegalArgumentException | IllegalStateException e) {
            callLog.record(p.partnerId(), marketId, method, path, null, 400);
            return ResponseEntity.badRequest().body(PartnerGuard.error(e.getMessage()));
        } catch (com.pdv2cloud.exception.CustomExceptions.NotFound e) {
            callLog.record(p.partnerId(), marketId, method, path, null, 404);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(PartnerGuard.error(e.getMessage()));
        }
    }

    private static Map<String, Object> body(Map<String, Object> b) {
        return b == null ? Map.of() : b;
    }

    // ---------------------------------------------------------------- conta

    /** Termos, saldo de leituras, certificado, pacotes e se o Pix está disponível. */
    @GetMapping("/status")
    public ResponseEntity<?> status(@PathVariable("id") UUID id, HttpServletRequest request, Authentication authentication) {
        return run(id, "GET", "/confere/status", request, authentication, p -> confere.status(id));
    }

    /** Aceite dos termos do Confere, feito pelo usuário dentro do Bipae. */
    @PostMapping("/terms")
    public ResponseEntity<?> terms(@PathVariable("id") UUID id, @RequestBody Map<String, Object> b,
                                   HttpServletRequest request, Authentication authentication) {
        return run(id, "POST", "/confere/terms", request, authentication,
            p -> confere.acceptTerms(id, String.valueOf(body(b).get("version")), actor(p, body(b).get("actor"))));
    }

    /** Certificado A1 em base64 (.pfx/.p12) com a senha. Fica cifrado aqui; o Bipae não deve guardar. */
    @PostMapping("/certificate")
    public ResponseEntity<?> certificate(@PathVariable("id") UUID id, @RequestBody Map<String, Object> b,
                                         HttpServletRequest request, Authentication authentication) {
        return run(id, "POST", "/confere/certificate", request, authentication, p -> {
            Object raw = body(b).get("pfxBase64");
            if (raw == null) throw new IllegalArgumentException("Envie o certificado em pfxBase64.");
            byte[] pfx;
            try {
                pfx = Base64.getDecoder().decode(String.valueOf(raw).replaceAll("\\s", ""));
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("pfxBase64 não é base64 válido.");
            }
            Object pw = body(b).get("password");
            Object uf = body(b).get("uf");
            return confere.saveCertificate(id, pfx, pw == null ? null : String.valueOf(pw), uf == null ? null : String.valueOf(uf));
        });
    }

    @DeleteMapping("/certificate")
    public ResponseEntity<?> removeCertificate(@PathVariable("id") UUID id, HttpServletRequest request, Authentication authentication) {
        return run(id, "DELETE", "/confere/certificate", request, authentication, p -> {
            confere.removeCertificate(id);
            return Map.of("removed", true);
        });
    }

    /**
     * Busca as notas novas na Sefaz agora. O MercadoFlow já faz isso sozinho a
     * cada hora; use só no botão "Buscar notas agora" (a Sefaz pune excesso).
     */
    @PostMapping("/sync")
    public ResponseEntity<?> sync(@PathVariable("id") UUID id, HttpServletRequest request, Authentication authentication) {
        return run(id, "POST", "/confere/sync", request, authentication, p -> Map.of("message", confere.sync(id)));
    }

    @GetMapping("/ledger")
    public ResponseEntity<?> ledger(@PathVariable("id") UUID id, HttpServletRequest request, Authentication authentication) {
        return run(id, "GET", "/confere/ledger", request, authentication, p -> Map.of("items", confere.ledger(id)));
    }

    /** Compra de leituras por Pix (sem certificado A1, cada nota lida gasta 1 leitura). */
    @PostMapping("/orders")
    public ResponseEntity<?> order(@PathVariable("id") UUID id, @RequestBody Map<String, Object> b,
                                   HttpServletRequest request, Authentication authentication) {
        return run(id, "POST", "/confere/orders", request, authentication,
            p -> confere.createPixOrder(id, UUID.fromString(String.valueOf(body(b).get("planId")))));
    }

    @GetMapping("/orders/{orderId}")
    public ResponseEntity<?> orderStatus(@PathVariable("id") UUID id, @PathVariable("orderId") UUID orderId,
                                         HttpServletRequest request, Authentication authentication) {
        return run(id, "GET", "/confere/orders", request, authentication, p -> confere.order(id, orderId));
    }

    // ---------------------------------------------------------------- notas

    /** Ler pela chave de acesso (bipada do código de barras do DANFE). */
    @PostMapping("/read")
    public ResponseEntity<?> read(@PathVariable("id") UUID id, @RequestBody Map<String, Object> b,
                                  HttpServletRequest request, Authentication authentication) {
        return run(id, "POST", "/confere/read", request, authentication,
            p -> confere.read(id, String.valueOf(body(b).get("accessKey")), actor(p, body(b).get("actor"))));
    }

    /** XML da NF-e de entrada enviado pelo Bipae (importação manual). */
    @PostMapping("/upload")
    public ResponseEntity<?> upload(@PathVariable("id") UUID id, @RequestBody Map<String, Object> b,
                                    HttpServletRequest request, Authentication authentication) {
        return run(id, "POST", "/confere/upload", request, authentication, p -> {
            Object xml = body(b).get("xml");
            if (xml == null || String.valueOf(xml).length() > 3_000_000) throw new IllegalArgumentException("Envie o XML da nota em \"xml\" (até 3 MB).");
            return confere.upload(id, String.valueOf(xml));
        });
    }

    /** As 100 notas mais recentes, com a situação da conferência. */
    @GetMapping("/documents")
    public ResponseEntity<?> documents(@PathVariable("id") UUID id, HttpServletRequest request, Authentication authentication) {
        return run(id, "GET", "/confere/documents", request, authentication, p -> Map.of("items", confere.documents(id)));
    }

    /**
     * A nota para a tela de conferência ({@code document}: itens como na nota,
     * com nome e foto do catálogo e variação de preço contra a nota anterior) e
     * a entrada pronta para o estoque ({@code entry}).
     */
    @GetMapping("/documents/{documentId}")
    public ResponseEntity<?> document(@PathVariable("id") UUID id, @PathVariable("documentId") UUID documentId,
                                      HttpServletRequest request, Authentication authentication) {
        return run(id, "GET", "/confere/documents", request, authentication, p -> {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("document", confere.document(id, documentId));
            out.put("entry", entries.entry(id, documentId));
            return out;
        });
    }

    /** Só a entrada pronta (para gravar no estoque, ou de novo se o aviso se perdeu). */
    @GetMapping("/documents/{documentId}/entry")
    public ResponseEntity<?> entry(@PathVariable("id") UUID id, @PathVariable("documentId") UUID documentId,
                                   HttpServletRequest request, Authentication authentication) {
        return run(id, "GET", "/confere/entry", request, authentication, p -> {
            Map<String, Object> e = entries.entry(id, documentId);
            if (e == null) throw new com.pdv2cloud.exception.CustomExceptions.NotFound("Nota não encontrada");
            return e;
        });
    }

    /**
     * Salva a contagem. {@code counts}: {"<nº do item>": {"counted": 10, "issue": "AVARIA", "note": "..."}},
     * com {@code counted} na unidade da nota (caixa, fardo). {@code finish: true} conclui e devolve a entrada.
     */
    @PutMapping("/documents/{documentId}/check")
    public ResponseEntity<?> check(@PathVariable("id") UUID id, @PathVariable("documentId") UUID documentId,
                                   @RequestBody Map<String, Object> b, HttpServletRequest request, Authentication authentication) {
        return run(id, "PUT", "/confere/check", request, authentication, p -> {
            Map<String, Object> clean = new LinkedHashMap<>(body(b));
            clean.remove("actor");
            ConfereService.Check saved = confere.saveCheck(id, documentId, clean, actor(p, body(b).get("actor")));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("check", saved);
            if ("DONE".equals(saved.status())) out.put("entry", entries.entry(id, documentId));
            return out;
        });
    }
}
