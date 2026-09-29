package com.pdv2cloud.service.confere;

import java.io.ByteArrayInputStream;
import java.io.StringWriter;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.xml.crypto.dsig.CanonicalizationMethod;
import javax.xml.crypto.dsig.DigestMethod;
import javax.xml.crypto.dsig.Reference;
import javax.xml.crypto.dsig.SignatureMethod;
import javax.xml.crypto.dsig.SignedInfo;
import javax.xml.crypto.dsig.Transform;
import javax.xml.crypto.dsig.XMLSignature;
import javax.xml.crypto.dsig.XMLSignatureFactory;
import javax.xml.crypto.dsig.dom.DOMSignContext;
import javax.xml.crypto.dsig.keyinfo.KeyInfo;
import javax.xml.crypto.dsig.keyinfo.KeyInfoFactory;
import javax.xml.crypto.dsig.keyinfo.X509Data;
import javax.xml.crypto.dsig.spec.C14NMethodParameterSpec;
import javax.xml.crypto.dsig.spec.TransformParameterSpec;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;

/**
 * Ambiente Nacional da NF-e, autenticado pelo certificado A1 do mercado.
 *
 * - NFeDistribuicaoDFe (NT 2014.002): notas emitidas contra o CNPJ, por NSU
 *   ou pela chave. Grátis para o destinatário.
 * - NFeRecepcaoEvento4: "Ciência da Operação" (210210), que libera o XML
 *   completo para o destinatário baixar.
 *
 * Tudo com a JDK: TLS mútuo com o .pfx e assinatura XMLDSig (RSA-SHA1 e C14N,
 * o que o leiaute da NF-e exige).
 */
@Component
public class SefazClient {

    static final String DIST_URL = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";
    static final String EVENT_URL = "https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx";
    private static final String NS_NFE = "http://www.portalfiscal.inf.br/nfe";

    /** Certificado aberto: chave privada, cadeia e o contexto TLS. */
    public record Credential(PrivateKey key, X509Certificate certificate, List<X509Certificate> chain, SSLContext ssl) {}

    public static Credential open(byte[] pfx, char[] password) {
        try {
            KeyStore ks = KeyStore.getInstance("PKCS12");
            ks.load(new ByteArrayInputStream(pfx), password);
            String alias = null;
            for (Enumeration<String> e = ks.aliases(); e.hasMoreElements(); ) {
                String a = e.nextElement();
                if (ks.isKeyEntry(a)) {
                    alias = a;
                    break;
                }
            }
            if (alias == null) {
                throw new IllegalArgumentException("O arquivo não tem chave privada. Envie o certificado A1 (.pfx) completo.");
            }
            PrivateKey key = (PrivateKey) ks.getKey(alias, password);
            List<X509Certificate> chain = new ArrayList<>();
            for (java.security.cert.Certificate c : ks.getCertificateChain(alias)) {
                chain.add((X509Certificate) c);
            }
            KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
            kmf.init(ks, password);
            SSLContext ssl = SSLContext.getInstance("TLS");
            ssl.init(kmf.getKeyManagers(), null, null);
            return new Credential(key, chain.get(0), chain, ssl);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (java.io.IOException e) {
            throw new IllegalArgumentException("Senha do certificado incorreta ou arquivo inválido");
        } catch (Exception e) {
            throw new IllegalArgumentException("Não foi possível abrir o certificado: " + e.getMessage());
        }
    }

    /** CNPJ do titular: o e-CNPJ ICP-Brasil traz "RAZÃO SOCIAL:CNPJ" no CN. */
    public static String cnpjOf(X509Certificate cert) {
        String dn = cert.getSubjectX500Principal().getName();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("CN=[^,]*?:(\\d{14})").matcher(dn);
        if (m.find()) {
            return m.group(1);
        }
        m = java.util.regex.Pattern.compile("(\\d{14})").matcher(dn);
        return m.find() ? m.group(1) : null;
    }

    public static String holderOf(X509Certificate cert) {
        String dn = cert.getSubjectX500Principal().getName();
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("CN=([^,:]+)").matcher(dn);
        return m.find() ? m.group(1).trim() : dn;
    }

    // ── Distribuição ──────────────────────────────────────────────────────

    public record Doc(String nsu, String schema, String xml) {}

    public record DistResult(String cStat, String reason, String lastNsu, String maxNsu, List<Doc> docs) {
        public boolean found() {
            return "138".equals(cStat);
        }
    }

    public DistResult distByNsu(Credential c, String ufCode, String cnpj, String lastNsu) {
        return dist(c, ufCode, cnpj, "<distNSU><ultNSU>" + lastNsu + "</ultNSU></distNSU>");
    }

    public DistResult distByKey(Credential c, String ufCode, String cnpj, String accessKey) {
        return dist(c, ufCode, cnpj, "<consChNFe><chNFe>" + accessKey + "</chNFe></consChNFe>");
    }

    private DistResult dist(Credential c, String ufCode, String cnpj, String query) {
        String body =
            "<distDFeInt xmlns=\"" + NS_NFE + "\" versao=\"1.01\">" +
            "<tpAmb>1</tpAmb><cUFAutor>" + ufCode + "</cUFAutor><CNPJ>" + cnpj + "</CNPJ>" + query +
            "</distDFeInt>";
        String envelope =
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
            "<soap12:Envelope xmlns:soap12=\"http://www.w3.org/2003/05/soap-envelope\"><soap12:Body>" +
            "<nfeDistDFeInteresse xmlns=\"http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe\">" +
            "<nfeDadosMsg>" + body + "</nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>";
        String response = post(c, DIST_URL, envelope,
            "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse");
        return parseDist(response);
    }

    static DistResult parseDist(String response) {
        Document doc = NfeXml.parse(response);
        Element ret = NfeXml.first(doc, "retDistDFeInt");
        if (ret == null) {
            throw new IllegalStateException("Resposta inesperada da Sefaz");
        }
        List<Doc> docs = new ArrayList<>();
        Element lote = NfeXml.child(ret, "loteDistDFeInt");
        if (lote != null) {
            for (Element z : NfeXml.children(lote, "docZip")) {
                docs.add(new Doc(z.getAttribute("NSU"), z.getAttribute("schema"), NfeXml.unzipBase64(z.getTextContent())));
            }
        }
        return new DistResult(NfeXml.text(ret, "cStat"), NfeXml.text(ret, "xMotivo"), NfeXml.text(ret, "ultNSU"),
            NfeXml.text(ret, "maxNSU"), docs);
    }

    // ── Ciência da operação ───────────────────────────────────────────────

    public record EventResult(String cStat, String reason) {
        /** 135 registrado; 573 já existia (duplicidade) — os dois liberam o XML. */
        public boolean ok() {
            return "135".equals(cStat) || "136".equals(cStat) || "573".equals(cStat);
        }
    }

    public EventResult acknowledge(Credential c, String cnpj, String accessKey) {
        String signedEvent = signedAcknowledgement(c, cnpj, accessKey, OffsetDateTime.now(ZoneOffset.ofHours(-3)));
        String envelope =
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
            "<soap12:Envelope xmlns:soap12=\"http://www.w3.org/2003/05/soap-envelope\"><soap12:Body>" +
            "<nfeDadosMsg xmlns=\"http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4\">" +
            "<envEvento xmlns=\"" + NS_NFE + "\" versao=\"1.00\"><idLote>" + (System.currentTimeMillis() % 1_000_000_000_000L) +
            "</idLote>" + signedEvent + "</envEvento></nfeDadosMsg></soap12:Body></soap12:Envelope>";
        String response = post(c, EVENT_URL, envelope,
            "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento");
        Document doc = NfeXml.parse(response);
        Element retEvento = NfeXml.first(doc, "retEvento");
        Element scope = retEvento != null ? retEvento : NfeXml.first(doc, "retEnvEvento");
        if (scope == null) {
            throw new IllegalStateException("Resposta inesperada da Sefaz ao registrar a ciência");
        }
        return new EventResult(NfeXml.text(scope, "cStat"), NfeXml.text(scope, "xMotivo"));
    }

    /** Evento 210210 assinado (visível ao pacote para teste de assinatura). */
    static String signedAcknowledgement(Credential c, String cnpj, String accessKey, OffsetDateTime when) {
        String id = "ID210210" + accessKey + "01";
        String dh = when.truncatedTo(ChronoUnit.SECONDS).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        String xml =
            "<evento xmlns=\"" + NS_NFE + "\" versao=\"1.00\"><infEvento Id=\"" + id + "\">" +
            "<cOrgao>91</cOrgao><tpAmb>1</tpAmb><CNPJ>" + cnpj + "</CNPJ><chNFe>" + accessKey + "</chNFe>" +
            "<dhEvento>" + dh + "</dhEvento><tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento>" +
            "<verEvento>1.00</verEvento><detEvento versao=\"1.00\"><descEvento>Ciencia da Operacao</descEvento></detEvento>" +
            "</infEvento></evento>";
        try {
            Document doc = NfeXml.safeBuilder().parse(new ByteArrayInputStream(xml.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
            Element infEvento = (Element) doc.getElementsByTagNameNS(NS_NFE, "infEvento").item(0);
            infEvento.setIdAttribute("Id", true);

            XMLSignatureFactory f = XMLSignatureFactory.getInstance("DOM");
            List<Transform> transforms = List.of(
                f.newTransform(Transform.ENVELOPED, (TransformParameterSpec) null),
                f.newTransform(CanonicalizationMethod.INCLUSIVE, (TransformParameterSpec) null));
            Reference ref = f.newReference("#" + id, f.newDigestMethod(DigestMethod.SHA1, null), transforms, null, null);
            SignedInfo si = f.newSignedInfo(
                f.newCanonicalizationMethod(CanonicalizationMethod.INCLUSIVE, (C14NMethodParameterSpec) null),
                f.newSignatureMethod(SignatureMethod.RSA_SHA1, null), Collections.singletonList(ref));
            KeyInfoFactory kif = f.getKeyInfoFactory();
            X509Data x509 = kif.newX509Data(Collections.singletonList(c.certificate()));
            KeyInfo ki = kif.newKeyInfo(Collections.singletonList(x509));
            // Assinatura como irmã de infEvento, dentro de <evento>.
            DOMSignContext ctx = new DOMSignContext(c.key(), doc.getDocumentElement());
            XMLSignature signature = f.newXMLSignature(si, ki);
            signature.sign(ctx);

            Transformer t = TransformerFactory.newInstance().newTransformer();
            t.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "yes");
            StringWriter out = new StringWriter();
            t.transform(new DOMSource(doc), new StreamResult(out));
            return out.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Falha ao assinar o evento: " + e.getMessage(), e);
        }
    }

    // ── Transporte ────────────────────────────────────────────────────────

    private String post(Credential c, String url, String envelope, String action) {
        HttpClient http = HttpClient.newBuilder()
            .sslContext(c.ssl())
            .connectTimeout(Duration.ofSeconds(15))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
        try {
            HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(60))
                    .header("Content-Type", "application/soap+xml; charset=utf-8; action=\"" + action + "\"")
                    .POST(HttpRequest.BodyPublishers.ofString(envelope))
                    .build(),
                HttpResponse.BodyHandlers.ofString());
            if (r.statusCode() >= 400) {
                String snippet = r.body() == null ? "" : r.body().replaceAll("\\s+", " ");
                throw new IllegalStateException("Sefaz respondeu " + r.statusCode() + ": "
                    + (snippet.length() > 200 ? snippet.substring(0, 200) : snippet));
            }
            return r.body();
        } catch (IllegalStateException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Comunicação com a Sefaz interrompida");
        } catch (Exception e) {
            throw new IllegalStateException("Falha de comunicação com a Sefaz: " + e.getMessage());
        }
    }

    /** Código IBGE da UF (cUFAutor). */
    public static String ufCode(String uf) {
        if (uf == null) {
            return null;
        }
        return switch (uf.trim().toUpperCase(java.util.Locale.ROOT)) {
            case "RO" -> "11"; case "AC" -> "12"; case "AM" -> "13"; case "RR" -> "14"; case "PA" -> "15";
            case "AP" -> "16"; case "TO" -> "17"; case "MA" -> "21"; case "PI" -> "22"; case "CE" -> "23";
            case "RN" -> "24"; case "PB" -> "25"; case "PE" -> "26"; case "AL" -> "27"; case "SE" -> "28";
            case "BA" -> "29"; case "MG" -> "31"; case "ES" -> "32"; case "RJ" -> "33"; case "SP" -> "35";
            case "PR" -> "41"; case "SC" -> "42"; case "RS" -> "43"; case "MS" -> "50"; case "MT" -> "51";
            case "GO" -> "52"; case "DF" -> "53";
            default -> null;
        };
    }
}
