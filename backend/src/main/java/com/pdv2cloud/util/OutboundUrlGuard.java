package com.pdv2cloud.util;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.util.Locale;

/**
 * Barra chamadas de saída para endereços internos (SSRF).
 *
 * O provedor de IA "endpoint próprio" deixa o cliente informar qualquer URL, e
 * o backend faz a chamada. Sem esta checagem um mercado conseguia apontar para
 * serviços da rede interna da VPS — que é compartilhada com outras aplicações —
 * ou para portas do próprio host.
 *
 * Exige https e um host que resolva só para endereços públicos. Deve ser
 * chamada ao salvar a URL E antes de cada chamada: a segunda protege
 * credenciais gravadas antes desta regra e troca de DNS depois do cadastro.
 */
public final class OutboundUrlGuard {

    private OutboundUrlGuard() {
    }

    /** @throws IllegalArgumentException com mensagem para o usuário quando a URL não é aceitável */
    public static void assertPublicHttps(String url) {
        URI uri;
        try {
            uri = URI.create(url.trim());
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("URL do serviço inválida.");
        }
        if (uri.getScheme() == null || !"https".equals(uri.getScheme().toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("A URL do serviço precisa começar com https://.");
        }
        String host = uri.getHost();
        if (host == null || host.isBlank() || uri.getUserInfo() != null) {
            throw new IllegalArgumentException("URL do serviço inválida.");
        }
        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (UnknownHostException e) {
            throw new IllegalArgumentException("Não foi possível encontrar o endereço do serviço.");
        }
        for (InetAddress address : addresses) {
            if (!isPublic(address)) {
                throw new IllegalArgumentException(
                    "A URL do serviço aponta para um endereço interno e não é permitida.");
            }
        }
    }

    static boolean isPublic(InetAddress a) {
        if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress()
            || a.isSiteLocalAddress() || a.isMulticastAddress()) {
            return false;
        }
        byte[] b = a.getAddress();
        if (a instanceof Inet4Address) {
            int first = b[0] & 0xff;
            int second = b[1] & 0xff;
            if (first == 0) return false;                                  // 0.0.0.0/8
            if (first == 100 && second >= 64 && second <= 127) return false; // 100.64.0.0/10 (CGNAT)
            if (first == 192 && second == 0 && (b[2] & 0xff) == 0) return false; // 192.0.0.0/24
            if (first == 198 && (second == 18 || second == 19)) return false;    // 198.18.0.0/15
            if (first >= 240) return false;                                // reservado e broadcast
            return true;
        }
        if (a instanceof Inet6Address) {
            int first = b[0] & 0xff;
            if ((first & 0xfe) == 0xfc) return false;                      // fc00::/7 (ULA)
            return true;
        }
        return false;
    }
}
