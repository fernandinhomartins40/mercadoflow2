package com.pdv2cloud.util;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.pdv2cloud.exception.CustomExceptions;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class HMACValidator {

    private final ObjectMapper objectMapper;
    private final String hmacSecret;

    public HMACValidator(ObjectMapper objectMapper, @Value("${hmac.secret:dev-hmac}") String hmacSecret) {
        this.objectMapper = objectMapper;
        this.hmacSecret = hmacSecret;
    }

    public void validateSignature(Object payload, String signature, UUID marketId) {
        validateSignature(payload, signature, hmacSecret, marketId);
    }

    public void validateSignature(Object payload, String signature, String secret, UUID marketId) {
        try {
            ObjectMapper mapper = objectMapper.copy()
                .configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true)
                .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);
            byte[] payloadBytes = mapper.writeValueAsBytes(payload);
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal(payloadBytes);
            String expected = bytesToHex(digest);

            if (!expected.equalsIgnoreCase(signature)) {
                throw new CustomExceptions.InvalidSignature("Invalid signature for market " + marketId);
            }
        } catch (CustomExceptions.InvalidSignature ex) {
            throw ex;
        } catch (Exception ex) {
            throw new CustomExceptions.InvalidSignature("Signature validation error");
        }
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
