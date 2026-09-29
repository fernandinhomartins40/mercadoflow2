package com.pdv2cloud.service.confere;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.zip.GZIPOutputStream;
import javax.xml.crypto.dsig.XMLSignature;
import javax.xml.crypto.dsig.XMLSignatureFactory;
import javax.xml.crypto.dsig.dom.DOMValidateContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * O que dá para provar sem Sefaz nem Meu Danfe: leitura do XML, resposta de
 * distribuição, assinatura do evento de ciência e o BR Code do Pix.
 */
class ConfereCoreTest {

    static final String KEY = NfeXml.withCheckDigit("3526091234567800019955001000012345100001234");

    static final String NFE_PROC = """
        <?xml version="1.0" encoding="UTF-8"?>
        <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe%s" versao="4.00">
        <ide><cUF>35</cUF><nNF>12345</nNF><serie>1</serie><dhEmi>2026-09-28T10:15:00-03:00</dhEmi></ide>
        <emit><CNPJ>12345678000199</CNPJ><xNome>DISTRIBUIDORA EXEMPLO LTDA</xNome><xFant>Dist Exemplo</xFant></emit>
        <dest><CNPJ>98765432000155</CNPJ><xNome>MERCADO TESTE</xNome></dest>
        <det nItem="1"><prod><cProd>A1</cProd><cEAN>17891000100100</cEAN><xProd>LEITE COND MOCA 395G CX 24</xProd><NCM>04029900</NCM>
          <uCom>CX</uCom><qCom>10.0000</qCom><vUnCom>150.00</vUnCom><vProd>1500.00</vProd>
          <cEANTrib>7891000100103</cEANTrib><uTrib>UN</uTrib><qTrib>240.0000</qTrib></prod></det>
        <det nItem="2"><prod><cProd>B2</cProd><cEAN>SEM GTIN</cEAN><xProd>BANANA PRATA KG</xProd><NCM>08039000</NCM>
          <uCom>KG</uCom><qCom>35.500</qCom><vUnCom>4.20</vUnCom><vProd>149.10</vProd>
          <rastro><nLote>L77</nLote><qLote>35.5</qLote><dFab>2026-09-20</dFab><dVal>2026-10-05</dVal></rastro></prod></det>
        <total><ICMSTot><vNF>1649.10</vNF></ICMSTot></total>
        <transp><vol><qVol>10</qVol><esp>CAIXA</esp><pesoB>120.500</pesoB></vol><vol><qVol>2</qVol><esp>CAIXA</esp></vol></transp>
        </infNFe></NFe><protNFe><infProt><chNFe>%s</chNFe></infProt></protNFe></nfeProc>
        """.formatted(KEY, KEY);

    @Test
    void readsFullNfe() {
        NfeXml.Data d = NfeXml.read(NFE_PROC);
        assertTrue(d.full());
        assertEquals(KEY, d.accessKey());
        assertEquals("Dist Exemplo", d.emitterTradeName());
        assertEquals("12345", d.number());
        assertEquals(12, d.volumes());
        assertEquals(new BigDecimal("1649.10"), d.totalValue());
        assertEquals(2, d.items().size());
        NfeXml.Item leite = d.items().get(0);
        assertEquals("17891000100100", leite.ean());
        assertEquals("7891000100103", leite.taxEan());
        assertEquals("CX", leite.unit());
        assertEquals(0, new BigDecimal("240").compareTo(leite.taxQuantity()));
        NfeXml.Item banana = d.items().get(1);
        assertNull(banana.ean(), "SEM GTIN não é código de barras");
        assertEquals("L77", banana.lot());
        assertEquals("2026-10-05", banana.expiry());
    }

    @Test
    void rejectsXxe() {
        String evil = "<?xml version=\"1.0\"?><!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/passwd\">]><resNFe>&e;</resNFe>";
        try {
            NfeXml.read(evil);
            throw new AssertionError("XML com DTD deveria ser recusado");
        } catch (IllegalArgumentException expected) {
            // ok
        }
    }

    @Test
    void checkDigit() {
        assertTrue(NfeXml.validKey(KEY));
        assertTrue(NfeXml.isNfe(KEY));
        String wrong = KEY.substring(0, 43) + ((KEY.charAt(43) - '0' + 1) % 10);
        assertFalse(NfeXml.validKey(wrong));
    }

    @Test
    void parsesDistributionWithZippedDocs() throws Exception {
        String res = "<resNFe xmlns=\"http://www.portalfiscal.inf.br/nfe\" versao=\"1.01\"><chNFe>" + KEY + "</chNFe>"
            + "<CNPJ>12345678000199</CNPJ><xNome>DISTRIBUIDORA</xNome><dhEmi>2026-09-28T10:15:00-03:00</dhEmi><vNF>1649.10</vNF></resNFe>";
        String response = "<soap:Envelope xmlns:soap=\"http://www.w3.org/2003/05/soap-envelope\"><soap:Body>"
            + "<nfeDistDFeInteresseResponse xmlns=\"http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe\"><nfeDistDFeInteresseResult>"
            + "<retDistDFeInt xmlns=\"http://www.portalfiscal.inf.br/nfe\" versao=\"1.01\"><tpAmb>1</tpAmb><cStat>138</cStat>"
            + "<xMotivo>Documento localizado</xMotivo><ultNSU>000000000000012</ultNSU><maxNSU>000000000000020</maxNSU>"
            + "<loteDistDFeInt><docZip NSU=\"000000000000011\" schema=\"resNFe_v1.01.xsd\">" + gzip(res) + "</docZip>"
            + "<docZip NSU=\"000000000000012\" schema=\"procNFe_v4.00.xsd\">" + gzip(NFE_PROC.strip()) + "</docZip></loteDistDFeInt>"
            + "</retDistDFeInt></nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>";
        SefazClient.DistResult r = SefazClient.parseDist(response);
        assertTrue(r.found());
        assertEquals("000000000000012", r.lastNsu());
        assertEquals(2, r.docs().size());
        NfeXml.Data summary = NfeXml.read(r.docs().get(0).xml());
        assertFalse(summary.full());
        assertEquals(KEY, summary.accessKey());
        assertTrue(NfeXml.read(r.docs().get(1).xml()).full());
    }

    @Test
    void signsAcknowledgementLikeSefazExpects(@TempDir Path dir) throws Exception {
        Path p12 = dir.resolve("teste.p12");
        String keytool = Path.of(System.getProperty("java.home"), "bin", "keytool").toString();
        Process proc = new ProcessBuilder(keytool, "-genkeypair", "-alias", "a1", "-keyalg", "RSA", "-keysize", "2048",
            "-sigalg", "SHA256withRSA", "-validity", "30", "-storetype", "PKCS12", "-keystore", p12.toString(),
            "-storepass", "senha123", "-keypass", "senha123",
            "-dname", "CN=EMPRESA TESTE LTDA:98765432000155, OU=AR, O=ICP-Brasil, C=BR")
            .redirectErrorStream(true).start();
        assertEquals(0, proc.waitFor());
        SefazClient.Credential c = SefazClient.open(Files.readAllBytes(p12), "senha123".toCharArray());
        assertEquals("98765432000155", SefazClient.cnpjOf(c.certificate()));

        String signed = SefazClient.signedAcknowledgement(c, "98765432000155", KEY,
            OffsetDateTime.of(2026, 9, 29, 10, 0, 0, 0, ZoneOffset.ofHours(-3)));
        Document doc = NfeXml.parse(signed);
        Element inf = (Element) doc.getElementsByTagNameNS("http://www.portalfiscal.inf.br/nfe", "infEvento").item(0);
        inf.setIdAttribute("Id", true);
        assertEquals("ID210210" + KEY + "01", inf.getAttribute("Id"));
        assertEquals("210210", NfeXml.text(inf, "tpEvento"));
        assertEquals("2026-09-29T10:00:00-03:00", NfeXml.text(inf, "dhEvento"));

        NodeList sigs = doc.getElementsByTagNameNS(XMLSignature.XMLNS, "Signature");
        assertEquals(1, sigs.getLength());
        // A assinatura é irmã de infEvento, dentro de <evento>.
        assertEquals("evento", sigs.item(0).getParentNode().getLocalName());
        DOMValidateContext ctx = new DOMValidateContext(c.certificate().getPublicKey(), sigs.item(0));
        // A JDK recusa validar SHA-1 por padrão; a NF-e ainda exige RSA-SHA1.
        ctx.setProperty("org.jcp.xml.dsig.secureValidation", Boolean.FALSE);
        XMLSignature sig = XMLSignatureFactory.getInstance("DOM").unmarshalXMLSignature(ctx);
        assertTrue(sig.validate(ctx), "assinatura deve ser válida");
        assertTrue(signed.contains("rsa-sha1") && signed.contains("xml-c14n-20010315"), "RSA-SHA1 e C14N, como a NF-e exige");
    }

    @Test
    void pixCrcMatchesCentralBankExample() {
        // Exemplo do manual do BR Code do Banco Central (CRC 1D3D).
        String body = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR"
            + "5913Fulano de Tal6008BRASILIA62070503***6304";
        assertEquals("1D3D", PixCode.crc16(body));
        String payload = PixCode.payload("contato@mercadoflow.com", "Mercado Flow Ltda", "São Paulo",
            new BigDecimal("5.9"), "MFCABC123");
        assertTrue(payload.contains("54045.90"), payload);
        assertTrue(payload.contains("5917MERCADO FLOW LTDA"), payload);
        assertTrue(payload.contains("62130509MFCABC123"), payload);
        assertTrue(payload.contains("6009SAO PAULO"));
        assertEquals(PixCode.crc16(payload.substring(0, payload.length() - 4)), payload.substring(payload.length() - 4));
    }

    private static String gzip(String s) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (GZIPOutputStream gz = new GZIPOutputStream(out)) {
            gz.write(s.getBytes(StandardCharsets.UTF_8));
        }
        return Base64.getEncoder().encodeToString(out.toByteArray());
    }
}
