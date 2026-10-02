package com.pdv2cloud.service.team;

import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Código de 6 dígitos que muda a cada 30 segundos (RFC 6238), o mesmo dos
 * aplicativos autenticadores (Google Authenticator, Microsoft Authenticator,
 * Authy). Aceita um passo antes e um depois para relógio fora de hora.
 */
public final class Totp {

    private static final String ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final SecureRandom RANDOM = new SecureRandom();

    private Totp() {
    }

    /** Segredo novo em base32 (160 bits). */
    public static String newSecret() {
        byte[] raw = new byte[20];
        RANDOM.nextBytes(raw);
        return base32(raw);
    }

    /** Endereço que o aplicativo lê pelo QR. */
    public static String uri(String secret, String account) {
        String issuer = "MercadoFlow";
        return "otpauth://totp/" + enc(issuer + ":" + account) + "?secret=" + secret + "&issuer=" + enc(issuer)
            + "&algorithm=SHA1&digits=6&period=30";
    }

    public static boolean verify(String secret, String code, long epochSeconds) {
        if (secret == null || code == null) {
            return false;
        }
        String c = code.replaceAll("\\s", "");
        if (!c.matches("\\d{6}")) {
            return false;
        }
        long step = epochSeconds / 30;
        for (long s = step - 1; s <= step + 1; s++) {
            if (java.security.MessageDigest.isEqual(code(secret, s).getBytes(StandardCharsets.US_ASCII), c.getBytes(StandardCharsets.US_ASCII))) {
                return true;
            }
        }
        return false;
    }

    /** Código do passo de tempo (exposto para teste). */
    static String code(String secret, long step) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(base32Decode(secret), "HmacSHA1"));
            byte[] h = mac.doFinal(ByteBuffer.allocate(8).putLong(step).array());
            int o = h[h.length - 1] & 0x0f;
            int bin = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
            return String.format("%06d", bin % 1_000_000);
        } catch (java.security.GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    static String base32(byte[] data) {
        StringBuilder out = new StringBuilder();
        int buffer = 0;
        int bits = 0;
        for (byte b : data) {
            buffer = (buffer << 8) | (b & 0xff);
            bits += 8;
            while (bits >= 5) {
                out.append(ALPHABET.charAt((buffer >> (bits - 5)) & 31));
                bits -= 5;
            }
        }
        if (bits > 0) {
            out.append(ALPHABET.charAt((buffer << (5 - bits)) & 31));
        }
        return out.toString();
    }

    static byte[] base32Decode(String s) {
        String clean = s.replace("=", "").replace(" ", "").toUpperCase();
        ByteBuffer out = ByteBuffer.allocate(clean.length() * 5 / 8);
        int buffer = 0;
        int bits = 0;
        for (char ch : clean.toCharArray()) {
            int v = ALPHABET.indexOf(ch);
            if (v < 0) {
                throw new IllegalArgumentException("Segredo inválido");
            }
            buffer = (buffer << 5) | v;
            bits += 5;
            if (bits >= 8) {
                out.put((byte) ((buffer >> (bits - 8)) & 0xff));
                bits -= 8;
            }
        }
        return java.util.Arrays.copyOf(out.array(), out.position());
    }

    private static String enc(String v) {
        return URLEncoder.encode(v, StandardCharsets.UTF_8).replace("+", "%20");
    }
}
