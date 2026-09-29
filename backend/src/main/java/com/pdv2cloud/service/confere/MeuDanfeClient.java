package com.pdv2cloud.service.confere;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * API v2 do Meu Danfe, conforme a documentação oficial
 * (https://meudanfe.com.br/documentacao.php → doc/v2.php).
 *
 *   PUT /v2/fd/add/{chave}      busca a NF-e na Receita e guarda na conta
 *                                (R$ 0,03; nota que já está na conta não é
 *                                cobrada). Resposta: {value, type, status,
 *                                statusMessage}, status WAITING | SEARCHING |
 *                                NOT_FOUND | OK | ERROR. O mesmo endpoint serve
 *                                para acompanhar a busca — aguardar ao menos 1 s
 *                                entre as chamadas, senão bloqueiam.
 *   GET /v2/fd/get/xml/{chave}  XML de nota já na conta (grátis). Resposta:
 *                                {name, type, format: XML | BASE64, data}.
 * Cabeçalho {@code Api-Key}. Erros: 400 chave de acesso inválida, 401 Api-Key
 * inválida, 402 saldo insuficiente, 403 Api-Key substituída, 404 nota fora da
 * conta, 500 erro deles.
 */
@Component
public class MeuDanfeClient {

    private static final Logger log = LoggerFactory.getLogger(MeuDanfeClient.class);
    private final String base;
    private static final Duration WAIT = Duration.ofSeconds(55);

    private final HttpClient http = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .followRedirects(HttpClient.Redirect.NEVER)
        .build();
    private final ObjectMapper mapper = new ObjectMapper();

    public MeuDanfeClient(@org.springframework.beans.factory.annotation.Value(
        "${app.confere.meudanfe-base-url:https://api.meudanfe.com.br/v2/fd}") String base) {
        this.base = base.replaceAll("/+$", "");
    }

    public enum Outcome { OK, NOT_FOUND, INVALID_KEY, UNAUTHORIZED, NO_BALANCE, TIMEOUT, ERROR }

    public record Result(Outcome outcome, String xml, String message) {}

    /**
     * Valida a Api-Key sem gastar nada: baixa o XML de uma chave que não está
     * na conta. Chave boa → 404; chave ruim → 401/403.
     */
    public String checkKey(String apiKey) {
        try {
            HttpResponse<String> r = http.send(get("/get/xml/" + NfeXml.withCheckDigit("3526090000000000000055001000000001100000001"), apiKey),
                HttpResponse.BodyHandlers.ofString());
            return switch (r.statusCode()) {
                case 401 -> "A Api-Key foi recusada pelo Meu Danfe";
                case 403 -> "A Api-Key foi substituída. Gere e cole a nova";
                case 404, 200 -> null;
                default -> "O Meu Danfe respondeu " + r.statusCode();
            };
        } catch (Exception e) {
            return "Não foi possível falar com o Meu Danfe: " + e.getMessage();
        }
    }

    public Result fetch(String apiKey, String accessKey) {
        return fetch(apiKey, accessKey, null);
    }

    /**
     * @param trace quando não nulo, recebe cada chamada e a resposta (diagnóstico
     *              do superadmin). Nunca inclui a Api-Key.
     */
    public Result fetch(String apiKey, String accessKey, java.util.List<String> trace) {
        long deadline = System.currentTimeMillis() + WAIT.toMillis();
        try {
            // Nota já na conta (busca anterior): vem de graça.
            Result ready = download(apiKey, accessKey, trace);
            if (ready.outcome() != Outcome.NOT_FOUND) {
                return ready;
            }
            while (true) {
                HttpResponse<String> add = http.send(
                    HttpRequest.newBuilder(URI.create(base + "/add/" + accessKey))
                        .timeout(Duration.ofSeconds(30))
                        .header("Api-Key", apiKey)
                        .header("Accept", "application/json")
                        .PUT(HttpRequest.BodyPublishers.noBody())
                        .build(),
                    HttpResponse.BodyHandlers.ofString());
                note(trace, "PUT /add/" + accessKey, add.statusCode(), add.body());
                switch (add.statusCode()) {
                    case 400: return new Result(Outcome.INVALID_KEY, null, "Chave de acesso inválida");
                    case 401: return new Result(Outcome.UNAUTHORIZED, null, "A Api-Key do Meu Danfe foi recusada");
                    case 402: return new Result(Outcome.NO_BALANCE, null, "Sem saldo na conta do Meu Danfe");
                    case 403: return new Result(Outcome.UNAUTHORIZED, null, "A Api-Key do Meu Danfe foi substituída");
                    default: break;
                }
                if (add.statusCode() != 200) {
                    return new Result(Outcome.ERROR, null, "O Meu Danfe respondeu " + add.statusCode() + ". Tente de novo.");
                }
                JsonNode body = mapper.readTree(add.body());
                String status = body.path("status").asText("").toUpperCase(Locale.ROOT);
                String message = body.path("statusMessage").asText("");
                log.info("Meu Danfe add | status={} msg={}", status, message);
                switch (status) {
                    case "OK":
                        // O XML pode levar um instante para ficar disponível depois do OK.
                        for (int attempt = 0; attempt < 4; attempt++) {
                            Result r = download(apiKey, accessKey, trace);
                            if (r.outcome() != Outcome.NOT_FOUND) {
                                return r;
                            }
                            Thread.sleep(1500);
                        }
                        return new Result(Outcome.ERROR, null, "O Meu Danfe achou a nota, mas o XML ainda não ficou disponível. Tente de novo em instantes");
                    case "NOT_FOUND":
                        return new Result(Outcome.NOT_FOUND, null,
                            "O Meu Danfe não encontrou essa nota na Receita" + (message.isBlank() || "Ok".equalsIgnoreCase(message) ? "" : " (" + message + ")"));
                    case "ERROR":
                        return new Result(Outcome.ERROR, null, message.isBlank() ? "O Meu Danfe não conseguiu consultar" : message);
                    default:
                        // WAITING / SEARCHING: acompanha pelo mesmo endpoint, com calma.
                        if (System.currentTimeMillis() > deadline) {
                            return new Result(Outcome.TIMEOUT, null, "A Receita está demorando. Tente de novo em instantes.");
                        }
                        Thread.sleep(1500);
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new Result(Outcome.ERROR, null, "Busca interrompida");
        } catch (Exception e) {
            log.warn("Falha na busca do Meu Danfe: {}", e.getMessage());
            return new Result(Outcome.ERROR, null, "Falha de comunicação com o Meu Danfe");
        }
    }

    /** XML de nota já na conta. NOT_FOUND quando ainda não está (404). */
    private Result download(String apiKey, String accessKey, java.util.List<String> trace) throws Exception {
        HttpResponse<String> r = http.send(get("/get/xml/" + accessKey, apiKey), HttpResponse.BodyHandlers.ofString());
        note(trace, "GET /get/xml/" + accessKey, r.statusCode(), r.statusCode() == 200 ? "(XML recebido)" : r.body());
        switch (r.statusCode()) {
            case 200: break;
            case 404: return new Result(Outcome.NOT_FOUND, null, null);
            case 400: return new Result(Outcome.INVALID_KEY, null, "Chave de acesso inválida");
            case 401, 403: return new Result(Outcome.UNAUTHORIZED, null, "A Api-Key do Meu Danfe foi recusada");
            default: return new Result(Outcome.ERROR, null, "O Meu Danfe respondeu " + r.statusCode());
        }
        JsonNode body = mapper.readTree(r.body());
        String data = body.path("data").asText("");
        String format = body.path("format").asText("XML").toUpperCase(Locale.ROOT);
        String xml = "BASE64".equals(format)
            ? new String(Base64.getDecoder().decode(data.replaceAll("\\s", "")), StandardCharsets.UTF_8)
            : data;
        if (!xml.contains("infNFe")) {
            return new Result(Outcome.ERROR, null, "O Meu Danfe devolveu um arquivo que não é NF-e");
        }
        return new Result(Outcome.OK, xml, null);
    }

    private static void note(java.util.List<String> trace, String call, int status, String body) {
        if (trace == null) {
            return;
        }
        String b = body == null ? "" : body.replaceAll("\\s+", " ").trim();
        trace.add(call + " → HTTP " + status + (b.isEmpty() ? "" : ": " + (b.length() > 300 ? b.substring(0, 300) + "…" : b)));
    }

    private HttpRequest get(String path, String apiKey) {
        return HttpRequest.newBuilder(URI.create(base + path))
            .timeout(Duration.ofSeconds(30))
            .header("Api-Key", apiKey)
            .header("Accept", "application/json")
            .GET().build();
    }
}
