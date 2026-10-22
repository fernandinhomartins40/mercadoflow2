package com.pdv2cloud.util;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.function.Predicate;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * Cliente HTTP/1.1 mínimo que resolve o host UMA vez, confere o IP e conecta
 * nesse mesmo IP (SEG-06, DNS rebinding).
 *
 * O java.net.http.HttpClient do Java 17 não aceita resolvedor próprio: ele
 * resolve o nome de novo na conexão, e um DNS que troca de resposta entre a
 * checagem do OutboundUrlGuard e a conexão levava a chamada para a rede
 * interna. Apontar o HttpClient direto para o IP também não serve: com host
 * IP ele não confere o nome do certificado (testado: aceita qualquer nome),
 * e o cabeçalho Host é proibido nele.
 *
 * Aqui o socket abre no IP validado e o TLS é feito por cima com o nome
 * original: SNI e conferência do certificado pelo nome (HTTPS). O Host vai
 * com o nome original. Sem keep-alive, sem compressão, sem redirecionamento
 * automático (quem chama decide, revalidando cada salto).
 */
public final class PinnedHttp {

    /** Resolve um nome em endereços. Trocável nos testes. */
    @FunctionalInterface
    public interface Resolver {
        InetAddress[] resolve(String host) throws UnknownHostException;
    }

    public record Response(int status, Map<String, String> headers, byte[] body) {
        /** Cabeçalho pelo nome, sem diferenciar maiúsculas. */
        public String header(String name) {
            return headers.get(name.toLowerCase(Locale.ROOT));
        }
    }

    /** Endereços públicos, DNS do sistema e a cadeia de certificados padrão da JVM. */
    public static final PinnedHttp DEFAULT =
        new PinnedHttp(InetAddress::getAllByName, OutboundUrlGuard::isPublic, null);

    private static final int MAX_HEADER_BYTES = 64 * 1024;

    private final Resolver resolver;
    private final Predicate<InetAddress> allowed;
    private final SSLSocketFactory sslFactory;

    /** @param sslFactory nulo usa {@link SSLSocketFactory#getDefault()} */
    public PinnedHttp(Resolver resolver, Predicate<InetAddress> allowed, SSLSocketFactory sslFactory) {
        this.resolver = resolver;
        this.allowed = allowed;
        this.sslFactory = sslFactory;
    }

    /**
     * Faz a requisição. Só http/https e host que resolva apenas para endereços
     * permitidos.
     *
     * @param maxBody   teto do corpo da resposta, em bytes
     * @throws IllegalArgumentException endereço recusado (mensagem para o usuário)
     * @throws IOException              falha de rede, TLS, tempo esgotado ou resposta acima do teto
     */
    public Response send(String method, String url, Map<String, String> headers, byte[] body,
                         int timeoutMillis, int maxBody) throws IOException {
        URI uri;
        try {
            uri = URI.create(url.trim());
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("Endereço inválido.");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        boolean tls = "https".equals(scheme);
        if (!tls && !"http".equals(scheme)) {
            throw new IllegalArgumentException("O endereço precisa começar com http:// ou https://.");
        }
        String host = uri.getHost();
        if (host == null || host.isBlank() || uri.getUserInfo() != null) {
            throw new IllegalArgumentException("Endereço inválido.");
        }
        int port = uri.getPort() != -1 ? uri.getPort() : (tls ? 443 : 80);
        InetAddress target = resolveAllowed(host);

        Socket raw = new Socket();
        try {
            raw.connect(new InetSocketAddress(target, port), timeoutMillis);
            raw.setSoTimeout(timeoutMillis);
            Socket socket = raw;
            if (tls) {
                SSLSocketFactory factory = sslFactory != null ? sslFactory : (SSLSocketFactory) SSLSocketFactory.getDefault();
                // Nome original (sem colchetes de IPv6): vira SNI e é conferido no certificado.
                String tlsHost = host.startsWith("[") ? host.substring(1, host.length() - 1) : host;
                SSLSocket ssl = (SSLSocket) factory.createSocket(raw, tlsHost, port, true);
                SSLParameters params = ssl.getSSLParameters();
                params.setEndpointIdentificationAlgorithm("HTTPS");
                ssl.setSSLParameters(params);
                ssl.startHandshake();
                socket = ssl;
            }
            writeRequest(socket.getOutputStream(), method, uri, host, port, tls, headers, body);
            return readResponse(new BufferedInputStream(socket.getInputStream()), method, maxBody);
        } finally {
            try {
                raw.close();
            } catch (IOException ignored) {
                // fechamento best-effort
            }
        }
    }

    /** Resolve uma vez e exige que todos os endereços sejam permitidos (a mesma regra do OutboundUrlGuard). */
    InetAddress resolveAllowed(String host) {
        String bare = host.startsWith("[") ? host.substring(1, host.length() - 1) : host;
        InetAddress[] addresses;
        try {
            addresses = resolver.resolve(bare);
        } catch (UnknownHostException e) {
            throw new IllegalArgumentException("Não foi possível encontrar o endereço do serviço.");
        }
        if (addresses == null || addresses.length == 0) {
            throw new IllegalArgumentException("Não foi possível encontrar o endereço do serviço.");
        }
        for (InetAddress address : addresses) {
            if (!allowed.test(address)) {
                throw new IllegalArgumentException("O endereço aponta para a rede interna e não é permitido.");
            }
        }
        return addresses[0];
    }

    private static void writeRequest(OutputStream out, String method, URI uri, String host, int port, boolean tls,
                                     Map<String, String> headers, byte[] body) throws IOException {
        String path = uri.getRawPath() == null || uri.getRawPath().isEmpty() ? "/" : uri.getRawPath();
        if (uri.getRawQuery() != null) {
            path += "?" + uri.getRawQuery();
        }
        boolean defaultPort = (tls && port == 443) || (!tls && port == 80);
        StringBuilder sb = new StringBuilder();
        sb.append(method).append(' ').append(path).append(" HTTP/1.1\r\n");
        sb.append("Host: ").append(host).append(defaultPort ? "" : ":" + port).append("\r\n");
        sb.append("Connection: close\r\n");
        if (headers != null) {
            for (Map.Entry<String, String> h : headers.entrySet()) {
                String name = h.getKey();
                String value = h.getValue() == null ? "" : h.getValue();
                // Sem quebra de linha em cabeçalho (injeção de cabeçalho/requisição).
                if (name.indexOf('\r') >= 0 || name.indexOf('\n') >= 0 || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) {
                    throw new IllegalArgumentException("Cabeçalho inválido.");
                }
                String lower = name.toLowerCase(Locale.ROOT);
                if (lower.equals("host") || lower.equals("connection") || lower.equals("content-length")) {
                    continue;
                }
                sb.append(name).append(": ").append(value).append("\r\n");
            }
        }
        if (body != null) {
            sb.append("Content-Length: ").append(body.length).append("\r\n");
        }
        sb.append("\r\n");
        out.write(sb.toString().getBytes(StandardCharsets.ISO_8859_1));
        if (body != null) {
            out.write(body);
        }
        out.flush();
    }

    private static Response readResponse(InputStream in, String method, int maxBody) throws IOException {
        String statusLine = readLine(in);
        // Respostas 1xx (100 Continue) não trazem corpo: pula até a final.
        int status;
        Map<String, String> headers;
        while (true) {
            String[] parts = statusLine.split(" ", 3);
            if (parts.length < 2 || !parts[0].startsWith("HTTP/1.")) {
                throw new IOException("Resposta HTTP inválida");
            }
            try {
                status = Integer.parseInt(parts[1].trim());
            } catch (NumberFormatException e) {
                throw new IOException("Resposta HTTP inválida");
            }
            headers = readHeaders(in);
            if (status >= 100 && status < 200) {
                statusLine = readLine(in);
                continue;
            }
            break;
        }
        byte[] body;
        if ("HEAD".equalsIgnoreCase(method) || status == 204 || status == 304) {
            body = new byte[0];
        } else if (headers.getOrDefault("transfer-encoding", "").toLowerCase(Locale.ROOT).contains("chunked")) {
            body = readChunked(in, maxBody);
        } else if (headers.containsKey("content-length")) {
            long length;
            try {
                length = Long.parseLong(headers.get("content-length").trim());
            } catch (NumberFormatException e) {
                throw new IOException("Resposta HTTP inválida");
            }
            if (length < 0 || length > maxBody) {
                throw new IOException("Resposta acima do limite");
            }
            body = in.readNBytes((int) length);
        } else {
            body = readLimited(in, maxBody);
        }
        return new Response(status, headers, body);
    }

    private static Map<String, String> readHeaders(InputStream in) throws IOException {
        Map<String, String> headers = new LinkedHashMap<>();
        int total = 0;
        String line;
        while (!(line = readLine(in)).isEmpty()) {
            total += line.length();
            if (total > MAX_HEADER_BYTES) {
                throw new IOException("Cabeçalhos grandes demais");
            }
            int colon = line.indexOf(':');
            if (colon > 0) {
                String name = line.substring(0, colon).trim().toLowerCase(Locale.ROOT);
                String value = line.substring(colon + 1).trim();
                headers.merge(name, value, (a, b) -> a + ", " + b);
            }
        }
        return headers;
    }

    private static byte[] readChunked(InputStream in, int maxBody) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        while (true) {
            String sizeLine = readLine(in);
            int semi = sizeLine.indexOf(';');
            String hex = (semi >= 0 ? sizeLine.substring(0, semi) : sizeLine).trim();
            int size;
            try {
                size = Integer.parseInt(hex, 16);
            } catch (NumberFormatException e) {
                throw new IOException("Resposta HTTP inválida");
            }
            if (size == 0) {
                // trailers até a linha vazia
                while (!readLine(in).isEmpty()) {
                    // ignora
                }
                return out.toByteArray();
            }
            if (size < 0 || out.size() + (long) size > maxBody) {
                throw new IOException("Resposta acima do limite");
            }
            byte[] chunk = in.readNBytes(size);
            if (chunk.length != size) {
                throw new IOException("Resposta HTTP incompleta");
            }
            out.write(chunk);
            readLine(in); // CRLF do fim do pedaço
        }
    }

    private static byte[] readLimited(InputStream in, int maxBody) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[16384];
        int read;
        while ((read = in.read(buffer)) != -1) {
            if (out.size() + read > maxBody) {
                throw new IOException("Resposta acima do limite");
            }
            out.write(buffer, 0, read);
        }
        return out.toByteArray();
    }

    /** Lê até CRLF (ou LF). Fim do fluxo antes de qualquer byte é erro. */
    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        int c;
        boolean any = false;
        while ((c = in.read()) != -1) {
            any = true;
            if (c == '\n') {
                break;
            }
            if (c != '\r') {
                if (line.size() >= MAX_HEADER_BYTES) {
                    throw new IOException("Linha grande demais");
                }
                line.write(c);
            }
        }
        if (!any) {
            throw new IOException("Conexão encerrada antes da resposta");
        }
        return line.toString(StandardCharsets.ISO_8859_1);
    }
}
