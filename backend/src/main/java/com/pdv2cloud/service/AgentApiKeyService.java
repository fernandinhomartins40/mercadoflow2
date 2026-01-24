package com.pdv2cloud.service;

import com.pdv2cloud.model.entity.AgentApiKey;
import com.pdv2cloud.model.entity.Market;
import com.pdv2cloud.repository.AgentApiKeyRepository;
import com.pdv2cloud.repository.MarketRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AgentApiKeyService {

    private static final String KEY_PREFIX = "pdv2_";

    @Autowired
    private AgentApiKeyRepository apiKeyRepository;

    @Autowired
    private MarketRepository marketRepository;

    @Transactional
    public GeneratedKey createKey(UUID marketId, String name) {
        Market market = marketRepository.findById(marketId)
            .orElseThrow(() -> new IllegalArgumentException("Market not found"));
        String rawKey = generateKey();
        String hash = sha256Hex(rawKey);
        String prefix = rawKey.substring(0, Math.min(rawKey.length(), 12));

        AgentApiKey entity = new AgentApiKey();
        entity.setMarket(market);
        entity.setName(name);
        entity.setKeyHash(hash);
        entity.setKeyPrefix(prefix);
        apiKeyRepository.save(entity);

        return new GeneratedKey(entity, rawKey);
    }

    public List<AgentApiKey> listActive(UUID marketId) {
        return apiKeyRepository.findByMarketIdAndIsActiveTrue(marketId);
    }

    private String generateKey() {
        byte[] buffer = new byte[32];
        new SecureRandom().nextBytes(buffer);
        String encoded = Base64.getUrlEncoder().withoutPadding().encodeToString(buffer);
        return KEY_PREFIX + encoded;
    }

    private String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("Unable to hash api key", ex);
        }
    }

    public record GeneratedKey(AgentApiKey entity, String rawKey) {}
}
