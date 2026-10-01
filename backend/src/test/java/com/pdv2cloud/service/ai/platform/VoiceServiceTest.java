package com.pdv2cloud.service.ai.platform;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.pdv2cloud.service.ai.AiUsageRecorder;
import com.sun.net.httpserver.HttpServer;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Voz do Copiloto: só as reservas pagas passam pelo servidor, com portão, cobrança e nada de áudio guardado. */
class VoiceServiceTest {

    private final AiGate gate = mock(AiGate.class);
    private final JevClient jev = mock(JevClient.class);
    private final AiUsageRecorder usage = mock(AiUsageRecorder.class);
    private final VoiceService service = new VoiceService(gate, jev, usage);
    private final UUID market = UUID.randomUUID();
    private HttpServer server;
    private final AtomicReference<String> seenAuth = new AtomicReference<>();
    private final AtomicReference<String> seenQuery = new AtomicReference<>();

    @BeforeEach
    void startServer() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/listen", ex -> {
            seenAuth.set(ex.getRequestHeaders().getFirst("Authorization"));
            seenQuery.set(ex.getRequestURI().getQuery());
            ex.getRequestBody().readAllBytes();
            byte[] body = ("{\"metadata\":{\"duration\":4.2},\"results\":{\"channels\":[{\"alternatives\":"
                + "[{\"transcript\":\"quanto vendi ontem\",\"confidence\":0.97}]}]}}").getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(200, body.length);
            try (OutputStream os = ex.getResponseBody()) {
                os.write(body);
            }
        });
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    private AiPlatformConfig.Route route(String task, String layer, double threshold) {
        return new AiPlatformConfig.Route(task, task, layer, layer.equals("VOZ") ? "DEEPGRAM" : "JEV",
            layer.equals("VOZ") ? "nova-3" : "jev-latest", 60, 0, 0, threshold, layer.equals("VOZ") ? 1 : 0,
            BigDecimal.valueOf(71.6667), BigDecimal.ZERO, false, true, null, null, null);
    }

    private void allow(String task, String layer, double threshold) {
        String base = "http://127.0.0.1:" + server.getAddress().getPort();
        when(gate.decide(market, task)).thenReturn(new AiGate.Decision(AiGate.Reason.OK, route(task, layer, threshold),
            new AiPlatformConfig.Key(layer.equals("VOZ") ? "DEEPGRAM" : "JEV", base, "chave-teste", null)));
    }

    @Test
    void transcreveCobraERegistraSegundos() {
        allow(VoiceService.TRANSCRIBE_TASK, "VOZ", 0.8);
        when(gate.charge(eq(market), any(), eq("voz"))).thenReturn(1);

        VoiceService.Transcript t = service.transcribe(market, new byte[] {1, 2, 3}, "audio/webm;codecs=opus");

        assertTrue(t.ok());
        assertEquals("quanto vendi ontem", t.texto());
        assertEquals(1, t.creditosUsados());
        assertEquals("Token chave-teste", seenAuth.get());
        assertTrue(seenQuery.get().contains("language=pt-BR"));
        // 4,2 s de áudio viram 5 "tokens" (segundos) no registro de uso.
        verify(usage).recordFull(eq(market), eq(VoiceService.TRANSCRIBE_TASK), eq("DEEPGRAM"), eq("nova-3"), anyString(),
            any(), eq(5), eq(0), any(), any(), any(), any(), eq("VOZ"), eq(1), eq(true));
    }

    @Test
    void semCreditoNaoChamaProvedor() {
        when(gate.decide(market, VoiceService.TRANSCRIBE_TASK)).thenReturn(new AiGate.Decision(AiGate.Reason.NO_CREDITS,
            route(VoiceService.TRANSCRIBE_TASK, "VOZ", 0.8), null));

        VoiceService.Transcript t = service.transcribe(market, new byte[] {1}, "audio/webm");

        assertFalse(t.ok());
        assertTrue(t.aviso().contains("créditos"));
        assertNull(seenAuth.get());
        verify(gate, never()).charge(any(), any(), any());
    }

    @Test
    void recusaAudioGrandeOuFormatoEstranhoSemGastar() {
        assertFalse(service.transcribe(market, new byte[VoiceService.MAX_AUDIO_BYTES + 1], "audio/webm").ok());
        assertFalse(service.transcribe(market, new byte[] {1}, "application/json").ok());
        assertFalse(service.transcribe(market, new byte[0], "audio/webm").ok());
        verifyNoInteractions(gate);
    }

    private void jevAnswers(String action, double confidence) {
        when(jev.decide(anyString(), anyString(), anyString(), any(), any())).thenReturn(new JevClient.Result(true,
            Map.of("acao", new JevClient.Answer(action, confidence, null, Map.of())), 120, 30, null));
    }

    @Test
    void jevEscolheAcaoDaTela() {
        allow(VoiceService.COMMAND_TASK, "JEV", 0.7);
        jevAnswers("avaria", 0.9);

        VoiceService.Command c = service.command(market, "CONFERENCIA", "essa caixa chegou toda molhada");

        assertEquals("avaria", c.acao());
        assertEquals("JEV", c.origem());
    }

    @Test
    void jevInseguroOuAcaoForaDaTelaNaoAge() {
        allow(VoiceService.COMMAND_TASK, "JEV", 0.7);
        jevAnswers("avaria", 0.4);
        assertNull(service.command(market, "CONFERENCIA", "hum").acao());

        jevAnswers("detalhe", 0.99);
        assertNull(service.command(market, "CONFERENCIA", "detalhe").acao(), "ação de outra tela não vale");

        jevAnswers("nenhuma", 0.99);
        assertNull(service.command(market, "CONFERENCIA", "bom dia").acao());
    }

    @Test
    void telaDesconhecidaNemChamaOJev() {
        assertNull(service.command(market, "QUALQUER", "aprova").acao());
        verifyNoInteractions(jev);
    }
}
