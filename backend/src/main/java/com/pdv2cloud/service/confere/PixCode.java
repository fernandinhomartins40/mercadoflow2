package com.pdv2cloud.service.confere;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;

/**
 * Pix "copia e cola" (BR Code estático do Banco Central, padrão EMV) com valor
 * e identificador da transação, e o QR code em PNG.
 *
 * O pagamento cai direto na chave Pix da plataforma. Como não há banco
 * avisando, a baixa é feita no painel do superadmin conferindo o txid no
 * extrato — o txid aparece no comprovante do pagador e no extrato do recebedor.
 */
public final class PixCode {

    private PixCode() {}

    public static String payload(String pixKey, String merchantName, String merchantCity, BigDecimal amount, String txid) {
        String account = field("00", "br.gov.bcb.pix") + field("01", pixKey.trim());
        StringBuilder sb = new StringBuilder()
            .append(field("00", "01"))
            .append(field("26", account))
            .append(field("52", "0000"))
            .append(field("53", "986"))
            .append(field("54", amount.setScale(2, RoundingMode.HALF_UP).toPlainString()))
            .append(field("58", "BR"))
            .append(field("59", clean(merchantName, 25)))
            .append(field("60", clean(merchantCity, 15)))
            .append(field("62", field("05", txid)))
            .append("6304");
        return sb + crc16(sb.toString());
    }

    public static String qrPngBase64(String payload) {
        try {
            BitMatrix m = new QRCodeWriter().encode(payload, BarcodeFormat.QR_CODE, 360, 360,
                Map.of(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M, EncodeHintType.MARGIN, 1,
                    EncodeHintType.CHARACTER_SET, "UTF-8"));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(m, "PNG", out);
            return Base64.getEncoder().encodeToString(out.toByteArray());
        } catch (Exception e) {
            throw new IllegalStateException("Falha ao gerar o QR code do Pix", e);
        }
    }

    private static String field(String id, String value) {
        int len = value.getBytes(StandardCharsets.UTF_8).length;
        if (len > 99) {
            throw new IllegalArgumentException("Campo do Pix grande demais");
        }
        return id + String.format(Locale.ROOT, "%02d", len) + value;
    }

    /** Sem acento, maiúsculas, só o que o BR Code aceita. */
    static String clean(String text, int max) {
        String s = Normalizer.normalize(text == null ? "" : text, Normalizer.Form.NFD)
            .replaceAll("\\p{M}+", "").replaceAll("[^A-Za-z0-9 .-]", "").trim().toUpperCase(Locale.ROOT);
        if (s.isEmpty()) {
            s = "MERCADOFLOW";
        }
        return s.length() > max ? s.substring(0, max) : s;
    }

    /** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), em hexa maiúsculo. */
    static String crc16(String data) {
        int crc = 0xFFFF;
        for (byte b : data.getBytes(StandardCharsets.UTF_8)) {
            crc ^= (b & 0xFF) << 8;
            for (int i = 0; i < 8; i++) {
                crc = (crc & 0x8000) != 0 ? (crc << 1) ^ 0x1021 : crc << 1;
                crc &= 0xFFFF;
            }
        }
        return String.format(Locale.ROOT, "%04X", crc);
    }
}
