package com.pdv2cloud.service.art;

import com.pdv2cloud.util.OutboundUrlGuard;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import org.springframework.stereotype.Service;

/**
 * Busca a foto de um produto hospedada fora da plataforma.
 *
 * O navegador desenha a arte num canvas e exporta PNG. Uma imagem de outro
 * domínio sem CORS "suja" o canvas e a exportação falha. Passando pelo nosso
 * domínio, a imagem vira da mesma origem.
 *
 * Só http/https de host público (OutboundUrlGuard em cada salto), só imagem, até 6 MB.
 */
@Service
public class ArtImageProxy {

    private static final int MAX_BYTES = 6 * 1024 * 1024;
    private static final int MAX_REDIRECTS = 3;

    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(8))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();

    public record Image(byte[] bytes, String contentType) {}

    public Image fetch(String url) {
        String current = url;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            OutboundUrlGuard.assertPublicWeb(current);
            try {
                HttpRequest request = HttpRequest.newBuilder(URI.create(current))
                    .timeout(Duration.ofSeconds(15))
                    .header("User-Agent", "MercadoFlow/1.0 (+https://mercadoflow.com)")
                    .header("Accept", "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8")
                    .GET().build();
                HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
                int status = response.statusCode();
                if (status >= 300 && status < 400) {
                    response.body().close();
                    String location = response.headers().firstValue("Location").orElse(null);
                    if (location == null) {
                        break;
                    }
                    current = URI.create(current).resolve(location).toString();
                    continue;
                }
                try (InputStream body = response.body()) {
                    if (status != 200) {
                        throw new IllegalArgumentException("A imagem não está disponível (" + status + ")");
                    }
                    String type = response.headers().firstValue("Content-Type").orElse("").toLowerCase(Locale.ROOT);
                    if (!type.startsWith("image/") || type.contains("svg")) {
                        throw new IllegalArgumentException("O endereço não é uma imagem");
                    }
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    byte[] buffer = new byte[16384];
                    int total = 0;
                    int read;
                    while ((read = body.read(buffer)) != -1) {
                        total += read;
                        if (total > MAX_BYTES) {
                            throw new IllegalArgumentException("A imagem passa de 6 MB");
                        }
                        out.write(buffer, 0, read);
                    }
                    return new Image(out.toByteArray(), type.split(";")[0].trim());
                }
            } catch (IllegalArgumentException e) {
                throw e;
            } catch (Exception e) {
                throw new IllegalArgumentException("Não foi possível baixar a imagem");
            }
        }
        throw new IllegalArgumentException("A imagem redireciona demais");
    }
}
