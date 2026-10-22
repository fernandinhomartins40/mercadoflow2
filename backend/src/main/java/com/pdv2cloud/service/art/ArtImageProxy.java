package com.pdv2cloud.service.art;

import com.pdv2cloud.util.OutboundUrlGuard;
import com.pdv2cloud.util.PinnedHttp;
import java.io.IOException;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Busca a foto de um produto hospedada fora da plataforma.
 *
 * O navegador desenha a arte num canvas e exporta PNG. Uma imagem de outro
 * domínio sem CORS "suja" o canvas e a exportação falha. Passando pelo nosso
 * domínio, a imagem vira da mesma origem.
 *
 * Só http/https de host público (OutboundUrlGuard em cada salto, e a conexão
 * vai no IP conferido), só imagem, até 6 MB.
 */
@Service
public class ArtImageProxy {

    private static final int MAX_BYTES = 6 * 1024 * 1024;
    private static final int MAX_REDIRECTS = 3;

    /** Resolve uma vez e conecta no IP conferido (SEG-06, DNS rebinding). Trocável nos testes. */
    PinnedHttp http = PinnedHttp.DEFAULT;

    public record Image(byte[] bytes, String contentType) {}

    public Image fetch(String url) {
        String current = url;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            OutboundUrlGuard.assertPublicWeb(current);
            try {
                Map<String, String> headers = new LinkedHashMap<>();
                headers.put("User-Agent", "MercadoFlow/1.0 (+https://mercadoflow.com)");
                headers.put("Accept", "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8");
                PinnedHttp.Response response = http.send("GET", current, headers, null, 15_000, MAX_BYTES);
                int status = response.status();
                if (status >= 300 && status < 400) {
                    String location = response.header("Location");
                    if (location == null) {
                        break;
                    }
                    current = URI.create(current).resolve(location).toString();
                    continue;
                }
                if (status != 200) {
                    throw new IllegalArgumentException("A imagem não está disponível (" + status + ")");
                }
                String type = response.header("Content-Type");
                type = type == null ? "" : type.toLowerCase(Locale.ROOT);
                if (!type.startsWith("image/") || type.contains("svg")) {
                    throw new IllegalArgumentException("O endereço não é uma imagem");
                }
                return new Image(response.body(), type.split(";")[0].trim());
            } catch (IllegalArgumentException e) {
                throw e;
            } catch (IOException e) {
                if ("Resposta acima do limite".equals(e.getMessage())) {
                    throw new IllegalArgumentException("A imagem passa de 6 MB");
                }
                throw new IllegalArgumentException("Não foi possível baixar a imagem");
            } catch (Exception e) {
                throw new IllegalArgumentException("Não foi possível baixar a imagem");
            }
        }
        throw new IllegalArgumentException("A imagem redireciona demais");
    }
}
