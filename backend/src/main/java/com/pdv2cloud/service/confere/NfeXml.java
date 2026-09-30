package com.pdv2cloud.service.confere;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.zip.GZIPInputStream;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * Leitura do XML da NF-e (nfeProc/NFe completo ou resNFe resumido).
 *
 * Só com a API padrão do Java. O parser é blindado: sem DTD e sem entidade
 * externa (XXE) — o XML pode vir de terceiros (upload do usuário, API).
 */
public final class NfeXml {

    private NfeXml() {}

    public record Item(
        int number, String code, String ean, String name, String ncm,
        String unit, BigDecimal quantity, BigDecimal unitPrice, BigDecimal total,
        String taxUnit, BigDecimal taxQuantity, String taxEan,
        String lot, String expiry, String cfop, BigDecimal discount) {}

    /** Endereço de emitente ou destinatário (enderEmit / enderDest). */
    public record Address(
        String street, String number, String neighborhood, String cityCode, String city,
        String uf, String postalCode) {}

    public record Data(
        String accessKey, boolean full,
        String emitterCnpj, String emitterName, String emitterTradeName,
        String recipientCnpj, String number, String series, LocalDateTime issuedAt,
        BigDecimal totalValue, Integer volumes, String volumeKind, BigDecimal grossWeight,
        List<Item> items, Address emitterAddress, Address recipientAddress) {}

    public static DocumentBuilder safeBuilder() {
        try {
            DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
            f.setNamespaceAware(true);
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            f.setFeature("http://xml.org/sax/features/external-general-entities", false);
            f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            f.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            f.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            f.setXIncludeAware(false);
            f.setExpandEntityReferences(false);
            return f.newDocumentBuilder();
        } catch (Exception e) {
            throw new IllegalStateException("Falha ao preparar o leitor de XML", e);
        }
    }

    public static Document parse(String xml) {
        if (xml == null || xml.isBlank()) {
            throw new IllegalArgumentException("XML vazio");
        }
        String clean = xml.strip();
        if (clean.charAt(0) == '﻿') {
            clean = clean.substring(1);
        }
        try {
            return safeBuilder().parse(new ByteArrayInputStream(clean.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalArgumentException("O arquivo não é um XML de nota fiscal válido");
        }
    }

    /** docZip da distribuição de DF-e: base64 de um gzip. */
    public static String unzipBase64(String base64) {
        try (GZIPInputStream in = new GZIPInputStream(new ByteArrayInputStream(Base64.getDecoder().decode(base64.trim())));
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            in.transferTo(out);
            return out.toString(StandardCharsets.UTF_8);
        } catch (IOException | IllegalArgumentException e) {
            throw new IllegalArgumentException("Documento compactado inválido");
        }
    }

    /** Lê nfeProc, NFe ou resNFe. */
    public static Data read(String xml) {
        Document doc = parse(xml);
        Element root = doc.getDocumentElement();
        String rootName = root.getLocalName();

        if ("resNFe".equals(rootName)) {
            return new Data(text(root, "chNFe"), false, text(root, "CNPJ"), text(root, "xNome"), null, null,
                null, null, dateTime(text(root, "dhEmi")), decimal(text(root, "vNF")), null, null, null, List.of(), null, null);
        }

        Element infNFe = first(doc, "infNFe");
        if (infNFe == null) {
            throw new IllegalArgumentException("O XML não é de uma NF-e");
        }
        String id = infNFe.getAttribute("Id");
        String key = id != null && id.startsWith("NFe") ? id.substring(3) : text(doc.getDocumentElement(), "chNFe");

        Element ide = child(infNFe, "ide");
        Element emit = child(infNFe, "emit");
        Element dest = child(infNFe, "dest");
        Element total = child(infNFe, "total");
        Element icmsTot = total == null ? null : child(total, "ICMSTot");
        Element transp = child(infNFe, "transp");

        Integer volumes = null;
        String volumeKind = null;
        BigDecimal weight = null;
        if (transp != null) {
            int sum = 0;
            boolean any = false;
            BigDecimal w = BigDecimal.ZERO;
            for (Element vol : children(transp, "vol")) {
                BigDecimal q = decimal(text(vol, "qVol"));
                if (q != null) {
                    sum += q.intValue();
                    any = true;
                }
                if (volumeKind == null) {
                    volumeKind = text(vol, "esp");
                }
                BigDecimal pb = decimal(text(vol, "pesoB"));
                if (pb != null) {
                    w = w.add(pb);
                }
            }
            volumes = any ? sum : null;
            weight = w.signum() > 0 ? w : null;
        }

        List<Item> items = new ArrayList<>();
        for (Element det : children(infNFe, "det")) {
            Element prod = child(det, "prod");
            if (prod == null) {
                continue;
            }
            int n;
            try {
                n = Integer.parseInt(det.getAttribute("nItem"));
            } catch (NumberFormatException e) {
                n = items.size() + 1;
            }
            String lot = null;
            String expiry = null;
            Element rastro = child(prod, "rastro");
            if (rastro != null) {
                lot = text(rastro, "nLote");
                expiry = text(rastro, "dVal");
            }
            items.add(new Item(n, text(prod, "cProd"), gtin(text(prod, "cEAN")), text(prod, "xProd"), text(prod, "NCM"),
                text(prod, "uCom"), decimal(text(prod, "qCom")), decimal(text(prod, "vUnCom")), decimal(text(prod, "vProd")),
                text(prod, "uTrib"), decimal(text(prod, "qTrib")), gtin(text(prod, "cEANTrib")), lot, expiry,
                text(prod, "CFOP"), decimal(text(prod, "vDesc"))));
        }

        return new Data(key, true,
            emit == null ? null : text(emit, "CNPJ"), emit == null ? null : text(emit, "xNome"),
            emit == null ? null : text(emit, "xFant"),
            dest == null ? null : text(dest, "CNPJ"),
            ide == null ? null : text(ide, "nNF"), ide == null ? null : text(ide, "serie"),
            ide == null ? null : dateTime(text(ide, "dhEmi") != null ? text(ide, "dhEmi") : text(ide, "dEmi")),
            icmsTot == null ? null : decimal(text(icmsTot, "vNF")), volumes, volumeKind, weight, items,
            address(emit == null ? null : child(emit, "enderEmit")),
            address(dest == null ? null : child(dest, "enderDest")));
    }

    private static Address address(Element e) {
        if (e == null) {
            return null;
        }
        String cep = text(e, "CEP");
        return new Address(text(e, "xLgr"), text(e, "nro"), text(e, "xBairro"), text(e, "cMun"), text(e, "xMun"),
            text(e, "UF"), cep == null ? null : cep.replaceAll("\\D", ""));
    }

    // ── Apoio ─────────────────────────────────────────────────────────────

    /** "SEM GTIN" e zeros não são código de barras. */
    private static String gtin(String v) {
        if (v == null) {
            return null;
        }
        String d = v.replaceAll("\\D", "");
        return d.length() >= 8 && !d.matches("0+") ? d : null;
    }

    static Element first(Document doc, String localName) {
        NodeList list = doc.getElementsByTagNameNS("*", localName);
        return list.getLength() == 0 ? null : (Element) list.item(0);
    }

    static Element child(Element parent, String localName) {
        for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n instanceof Element e && localName.equals(e.getLocalName())) {
                return e;
            }
        }
        return null;
    }

    static List<Element> children(Element parent, String localName) {
        List<Element> out = new ArrayList<>();
        for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n instanceof Element e && localName.equals(e.getLocalName())) {
                out.add(e);
            }
        }
        return out;
    }

    /** Texto do primeiro descendente com esse nome. */
    static String text(Element scope, String localName) {
        NodeList list = scope.getElementsByTagNameNS("*", localName);
        if (list.getLength() == 0) {
            return null;
        }
        String v = list.item(0).getTextContent();
        return v == null || v.isBlank() ? null : v.trim();
    }

    private static BigDecimal decimal(String v) {
        if (v == null) {
            return null;
        }
        try {
            return new BigDecimal(v.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static LocalDateTime dateTime(String v) {
        if (v == null) {
            return null;
        }
        try {
            return OffsetDateTime.parse(v).toLocalDateTime();
        } catch (Exception e) {
            try {
                return java.time.LocalDate.parse(v.substring(0, 10)).atStartOfDay();
            } catch (Exception ignored) {
                return null;
            }
        }
    }

    /** Dígito verificador da chave (módulo 11). */
    public static boolean validKey(String key) {
        if (key == null || !key.matches("\\d{44}")) {
            return false;
        }
        return checkDigit(key.substring(0, 43)) == key.charAt(43) - '0';
    }

    static int checkDigit(String first43) {
        int sum = 0;
        int weight = 2;
        for (int i = first43.length() - 1; i >= 0; i--) {
            sum += (first43.charAt(i) - '0') * weight;
            weight = weight == 9 ? 2 : weight + 1;
        }
        return sum % 11 < 2 ? 0 : 11 - sum % 11;
    }

    public static String withCheckDigit(String first43) {
        return first43 + checkDigit(first43);
    }

    /** Modelo 55 (NF-e) nas posições 21-22 da chave. */
    public static boolean isNfe(String key) {
        return key != null && key.length() == 44 && "55".equals(key.substring(20, 22));
    }
}
