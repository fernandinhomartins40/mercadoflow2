package com.pdv2cloud.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** SEG-06: resolve uma vez, confere o IP e conecta nele, com o Host original. */
class PinnedHttpTest {

    private HttpServer server;
    private final AtomicReference<String> hostRecebido = new AtomicReference<>();
    private final AtomicReference<String> corpoRecebido = new AtomicReference<>();

    @BeforeEach
    void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/hook", ex -> {
            hostRecebido.set(ex.getRequestHeaders().getFirst("Host"));
            corpoRecebido.set(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] resp = "ok".getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(200, resp.length);
            ex.getResponseBody().write(resp);
            ex.close();
        });
        server.createContext("/chunked", ex -> {
            ex.sendResponseHeaders(200, 0); // 0 = chunked
            ex.getResponseBody().write("pedaco-1|".getBytes(StandardCharsets.UTF_8));
            ex.getResponseBody().flush();
            ex.getResponseBody().write("pedaco-2".getBytes(StandardCharsets.UTF_8));
            ex.close();
        });
        server.start();
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    private int port() {
        return server.getAddress().getPort();
    }

    @Test
    void dnsQueMudaDeRespostaNaoEConsultadoDeNovo() throws Exception {
        // 1ª resposta: o loopback (tratado como "público" neste teste); da 2ª em
        // diante, um IP interno. Se o cliente resolvesse de novo na conexão
        // (como o HttpClient faz), cairia no endereço interno.
        AtomicInteger consultas = new AtomicInteger();
        PinnedHttp.Resolver resolverFalso = host -> {
            assertThat(host).isEqualTo("parceiro.exemplo.test");
            return consultas.incrementAndGet() == 1
                ? new InetAddress[] {InetAddress.getLoopbackAddress()}
                : new InetAddress[] {InetAddress.getByName("10.0.0.5")};
        };
        PinnedHttp client = new PinnedHttp(resolverFalso, InetAddress::isLoopbackAddress, null);

        PinnedHttp.Response r = client.send("POST", "http://parceiro.exemplo.test:" + port() + "/hook",
            Map.of("Content-Type", "application/json"), "{\"a\":1}".getBytes(StandardCharsets.UTF_8), 5000, 1024);

        assertThat(r.status()).isEqualTo(200);
        assertThat(new String(r.body(), StandardCharsets.UTF_8)).isEqualTo("ok");
        assertThat(consultas.get()).isEqualTo(1);
        assertThat(hostRecebido.get()).isEqualTo("parceiro.exemplo.test:" + port());
        assertThat(corpoRecebido.get()).isEqualTo("{\"a\":1}");
    }

    @Test
    void hostQueResolveParaRedeInternaERecusadoSemConectar() {
        PinnedHttp.Resolver resolverFalso = host -> new InetAddress[] {
            InetAddress.getByName("203.0.113.10"), InetAddress.getByName("169.254.169.254")};
        PinnedHttp client = new PinnedHttp(resolverFalso, OutboundUrlGuard::isPublic, null);

        assertThatThrownBy(() -> client.send("POST", "https://parceiro.exemplo.test/hook", Map.of(), new byte[0], 2000, 1024))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("rede interna");
        assertThat(hostRecebido.get()).isNull();
    }

    @Test
    void loopbackComOResolvedorPadraoERecusado() {
        assertThatThrownBy(() -> PinnedHttp.DEFAULT.send("GET", "http://127.0.0.1:" + port() + "/hook", Map.of(), null, 2000, 1024))
            .isInstanceOf(IllegalArgumentException.class);
        assertThat(hostRecebido.get()).isNull();
    }

    @Test
    void leRespostaChunkedERespeitaOTeto() throws Exception {
        PinnedHttp client = new PinnedHttp(host -> new InetAddress[] {InetAddress.getLoopbackAddress()},
            InetAddress::isLoopbackAddress, null);
        String url = "http://img.exemplo.test:" + port() + "/chunked";

        PinnedHttp.Response r = client.send("GET", url, Map.of(), null, 5000, 1024);
        assertThat(new String(r.body(), StandardCharsets.UTF_8)).isEqualTo("pedaco-1|pedaco-2");

        assertThatThrownBy(() -> client.send("GET", url, Map.of(), null, 5000, 10))
            .hasMessageContaining("acima do limite");
    }

    @Test
    void cabecalhoComQuebraDeLinhaERecusado() {
        PinnedHttp client = new PinnedHttp(host -> new InetAddress[] {InetAddress.getLoopbackAddress()},
            InetAddress::isLoopbackAddress, null);
        assertThatThrownBy(() -> client.send("GET", "http://x.test:" + port() + "/hook",
            Map.of("X-Teste", "a\r\nHost: outro"), null, 5000, 1024))
            .isInstanceOf(IllegalArgumentException.class);
    }
}
