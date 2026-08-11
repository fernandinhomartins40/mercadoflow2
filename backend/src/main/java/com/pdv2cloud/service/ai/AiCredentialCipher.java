package com.pdv2cloud.service.ai;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Cifra as chaves de API que os clientes cadastram (BYOK).
 *
 * A chave de IA de um cliente é credencial de terceiro sob nossa custódia: se
 * vazar, quem paga a conta é ele. Por isso ela nunca fica em claro no banco,
 * nunca é devolvida pela API (só o {@link #hint(String)}) e nunca entra em log.
 *
 * AES-256-GCM e não AES-CBC: GCM é autenticado, então um ciphertext adulterado
 * falha na decifragem em vez de devolver lixo silenciosamente. O IV é aleatório
 * por operação e viaja junto do texto cifrado — reutilizar IV em GCM quebra a
 * cifra por completo, então ele nunca é derivado nem fixo.
 *
 * A chave mestra vem de {@code app.ai.encryption-key} (variável de ambiente,
 * fora do banco): quem tem só o dump do banco não tem as chaves dos clientes.
 */
@Component
public class AiCredentialCipher {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecureRandom random = new SecureRandom();
    private final SecretKeySpec key;
    private final boolean configured;

    public AiCredentialCipher(@Value("${app.ai.encryption-key:}") String masterKey) {
        this.configured = masterKey != null && !masterKey.isBlank();
        // SHA-256 do segredo configurado: aceita uma senha de qualquer tamanho
        // e sempre produz os 256 bits que o AES exige, sem obrigar o operador
        // a gerar exatamente 32 bytes na mão.
        this.key = configured ? new SecretKeySpec(sha256(masterKey), "AES") : null;
    }

    /**
     * Sem chave mestra configurada, o BYOK fica indisponível — e é melhor que
     * fique. Guardar chave de cliente em claro "só por enquanto" seria pior que
     * não oferecer a funcionalidade.
     */
    public boolean isConfigured() {
        return configured;
    }

    public String encrypt(String plaintext) {
        requireConfigured();
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            Base64.Encoder enc = Base64.getEncoder();
            return enc.encodeToString(iv) + ":" + enc.encodeToString(ciphertext);
        } catch (Exception e) {
            // A mensagem original pode conter fragmento do material cifrado
            // conforme o provider JCE; não propagamos.
            throw new IllegalStateException("Falha ao cifrar a credencial de IA", e);
        }
    }

    public String decrypt(String stored) {
        requireConfigured();
        int sep = stored == null ? -1 : stored.indexOf(':');
        if (sep <= 0) {
            throw new IllegalStateException("Credencial de IA em formato inválido");
        }
        try {
            Base64.Decoder dec = Base64.getDecoder();
            byte[] iv = dec.decode(stored.substring(0, sep));
            byte[] ciphertext = dec.decode(stored.substring(sep + 1));

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Falha ao decifrar a credencial de IA", e);
        }
    }

    /**
     * Últimos 4 caracteres, para o usuário reconhecer qual chave cadastrou.
     *
     * Quatro e não mais: o suficiente para distinguir duas chaves suas, curto
     * demais para ajudar quem não as tem.
     */
    public String hint(String plaintextKey) {
        if (plaintextKey == null || plaintextKey.length() < 4) {
            return "****";
        }
        return "****" + plaintextKey.substring(plaintextKey.length() - 4);
    }

    private void requireConfigured() {
        if (!configured) {
            throw new IllegalStateException(
                "app.ai.encryption-key não configurada — o BYOK fica desabilitado");
        }
    }

    private static byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 indisponível na JVM", e);
        }
    }
}
