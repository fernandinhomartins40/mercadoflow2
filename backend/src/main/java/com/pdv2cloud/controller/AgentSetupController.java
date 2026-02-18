package com.pdv2cloud.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.pdv2cloud.model.entity.AgentApiKey;
import com.pdv2cloud.service.AgentApiKeyService;
import com.pdv2cloud.service.QRCodeService;
import com.google.zxing.WriterException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/agent-setup")
@RequiredArgsConstructor
public class AgentSetupController {

    private final AgentApiKeyService agentApiKeyService;
    private final QRCodeService qrCodeService;
    private final ObjectMapper objectMapper;

    /**
     * Generate QR code for agent setup with embedded credentials
     */
    @PostMapping("/qrcode/{agentKeyId}")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER')")
    public ResponseEntity<Map<String, Object>> generateSetupQRCode(@PathVariable UUID agentKeyId) {
        try {
            // This would need to retrieve the raw API key (only available at creation)
            // For security, we'll return an error if key is already created
            // In production, this should be called immediately after key creation

            Map<String, Object> setupData = new HashMap<>();
            setupData.put("apiUrl", "https://mercadoflow.com");
            setupData.put("version", "1.0");
            // Note: In real implementation, include encrypted/temporary setup token
            setupData.put("setupToken", "TEMP_TOKEN_" + agentKeyId);

            String jsonData = objectMapper.writeValueAsString(setupData);
            String qrCodeBase64 = qrCodeService.generateQRCodeBase64(jsonData, 400, 400);

            Map<String, Object> response = new HashMap<>();
            response.put("qrCode", "data:image/png;base64," + qrCodeBase64);
            response.put("setupData", setupData);

            return ResponseEntity.ok(response);
        } catch (WriterException | IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to generate QR code"));
        }
    }

    /**
     * Generate QR code immediately after creating a new API key
     */
    @PostMapping("/qrcode-for-new-key")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER')")
    public ResponseEntity<Map<String, Object>> generateQRCodeForNewKey(
            @RequestParam UUID marketId,
            @RequestParam String keyName) {
        try {
            // Create new API key
            AgentApiKeyService.GeneratedKey generatedKey = agentApiKeyService.createKey(marketId, keyName);

            // Prepare setup data
            Map<String, Object> setupData = new HashMap<>();
            setupData.put("apiUrl", "https://mercadoflow.com");
            setupData.put("apiKey", generatedKey.rawKey());
            setupData.put("marketId", marketId.toString());
            setupData.put("version", "1.0");

            String jsonData = objectMapper.writeValueAsString(setupData);
            String qrCodeBase64 = qrCodeService.generateQRCodeBase64(jsonData, 400, 400);

            Map<String, Object> response = new HashMap<>();
            response.put("qrCode", "data:image/png;base64," + qrCodeBase64);
            response.put("apiKey", generatedKey.rawKey());
            response.put("keyId", generatedKey.entity().getId());
            response.put("message", "IMPORTANTE: Esta é a única vez que a chave completa será exibida. Guarde com segurança ou use o QR Code para configurar o agente.");

            return ResponseEntity.ok(response);
        } catch (WriterException | IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Failed to generate QR code"));
        }
    }

    /**
     * Download QR code as PNG image
     */
    @GetMapping("/qrcode/{agentKeyId}/download")
    @PreAuthorize("hasAnyRole('MARKET_OWNER', 'MARKET_MANAGER')")
    public ResponseEntity<byte[]> downloadQRCode(@PathVariable UUID agentKeyId) {
        try {
            Map<String, Object> setupData = new HashMap<>();
            setupData.put("apiUrl", "https://mercadoflow.com");
            setupData.put("setupToken", "TEMP_TOKEN_" + agentKeyId);

            String jsonData = objectMapper.writeValueAsString(setupData);
            byte[] qrCodeBytes = qrCodeService.generateQRCodeBytes(jsonData, 400, 400);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.IMAGE_PNG);
            headers.setContentDispositionFormData("attachment", "pdv2cloud-setup-" + agentKeyId + ".png");

            return new ResponseEntity<>(qrCodeBytes, headers, HttpStatus.OK);
        } catch (WriterException | IOException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
