package com.pdv2cloud.service.partner;

import com.pdv2cloud.security.PartnerPrincipal;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

/**
 * Porta das rotas exclusivas do parceiro da casa: só ele entra, e na loja só
 * com o escopo que ela autorizou. A recusa fica no registro que o lojista vê.
 */
@Component
@Profile("!jobs")
public class PartnerGuard {

    private final PartnerCallLog callLog;

    public PartnerGuard(PartnerCallLog callLog) {
        this.callLog = callLog;
    }

    public static Map<String, Object> error(String message) {
        return Map.of("erro", message);
    }

    /** Rota sem loja (catálogo, contas): basta ser o parceiro da casa. Null quando pode seguir. */
    public ResponseEntity<?> firstParty(PartnerPrincipal p, String method, String path) {
        if (p.firstParty()) return null;
        callLog.record(p.partnerId(), null, method, path, null, 403);
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error("Recurso exclusivo do sistema parceiro da casa."));
    }

    /** Rota de loja: parceiro da casa e o escopo autorizado pela loja. Null quando pode seguir. */
    public ResponseEntity<?> store(PartnerPrincipal p, UUID marketId, String method, String path, String scope,
                                   HttpServletRequest request) {
        if (!p.firstParty()) {
            callLog.record(p.partnerId(), marketId, method, path, null, 403);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error("Recurso exclusivo do sistema parceiro da casa."));
        }
        Object s = request.getAttribute("partnerScopes");
        if (!(s instanceof List<?> l && l.contains(scope))) {
            callLog.record(p.partnerId(), marketId, method, path, null, 403);
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(error("A loja não autorizou o escopo " + scope + ". Peça a conexão de novo com esse escopo."));
        }
        return null;
    }
}
