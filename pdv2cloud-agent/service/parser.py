from dataclasses import dataclass
from typing import Optional, List
from decimal import Decimal
from pathlib import Path
import hashlib
import logging
from lxml import etree
import textwrap

try:
    import xmlsec
except Exception:
    xmlsec = None


@dataclass
class InvoiceItem:
    codigo_ean: str
    codigo_interno: str
    descricao: str
    ncm: str
    cfop: str
    quantidade: Decimal
    valor_unitario: Decimal
    valor_total: Decimal
    valor_desconto: Decimal
    valor_frete: Decimal
    valor_outros: Decimal
    valor_liquido: Decimal
    icms: Optional[Decimal]
    pis: Optional[Decimal]
    cofins: Optional[Decimal]


@dataclass
class InvoiceData:
    chave_nfe: str
    cnpj_emitente: str
    data_emissao: str
    serie: str
    numero: str
    valor_total: Decimal
    cpf_cnpj_destinatario: Optional[str]
    items: List[InvoiceItem]


def parse_xml(xml_path: Path, xsd_paths: Optional[List[Path]] = None) -> InvoiceData:
    logger = logging.getLogger("PDV2Cloud")
    xml_bytes = xml_path.read_bytes()
    root = _parse_root(xml_bytes, logger)

    if xsd_paths:
        for xsd_path in xsd_paths:
            if not xsd_path.exists():
                continue
            schema = etree.XMLSchema(etree.parse(str(xsd_path)))
            schema.assertValid(root)

    if xmlsec is not None:
        _validate_signature(root)
    else:
        logger.warning("xmlsec not available; skipping XML signature validation")

    ns = {"nfe": "http://www.portalfiscal.inf.br/nfe"}
    inf_nfe = _find_inf_nfe(root, ns)
    if inf_nfe is None:
        raise ValueError("infNFe not found")

    chave_nfe = inf_nfe.get("Id", "").replace("NFe", "")
    emit = inf_nfe.find(".//nfe:emit", namespaces=ns)
    dest = inf_nfe.find(".//nfe:dest", namespaces=ns)
    ide = inf_nfe.find(".//nfe:ide", namespaces=ns)
    total = inf_nfe.find(".//nfe:ICMSTot", namespaces=ns)

    cnpj_emitente = _text(emit, "nfe:CNPJ", ns)
    data_emissao = _text(ide, "nfe:dhEmi", ns) or _text(ide, "nfe:dEmi", ns)
    serie = _text(ide, "nfe:serie", ns)
    numero = _text(ide, "nfe:nNF", ns)
    valor_total = Decimal(_text(total, "nfe:vNF", ns) or "0")

    cpf = _text(dest, "nfe:CPF", ns) if dest is not None else None
    cnpj = _text(dest, "nfe:CNPJ", ns) if dest is not None else None
    cpf_cnpj_destinatario = cpf or cnpj

    items: List[InvoiceItem] = []
    for det in inf_nfe.findall(".//nfe:det", namespaces=ns):
        prod = det.find(".//nfe:prod", namespaces=ns)
        imposto = det.find(".//nfe:imposto", namespaces=ns)

        item = InvoiceItem(
            codigo_ean=_text(prod, "nfe:cEAN", ns),
            codigo_interno=_text(prod, "nfe:cProd", ns),
            descricao=_text(prod, "nfe:xProd", ns),
            ncm=_text(prod, "nfe:NCM", ns),
            cfop=_text(prod, "nfe:CFOP", ns),
            quantidade=Decimal(_text(prod, "nfe:qCom", ns) or "0"),
            valor_unitario=Decimal(_text(prod, "nfe:vUnCom", ns) or "0"),
            valor_total=Decimal(_text(prod, "nfe:vProd", ns) or "0"),
            valor_desconto=Decimal(_text(prod, "nfe:vDesc", ns) or "0"),
            valor_frete=Decimal(_text(prod, "nfe:vFrete", ns) or "0"),
            valor_outros=Decimal(_text(prod, "nfe:vOutro", ns) or "0"),
            valor_liquido=Decimal(_text(prod, "nfe:vProd", ns) or "0")
                - Decimal(_text(prod, "nfe:vDesc", ns) or "0")
                + Decimal(_text(prod, "nfe:vFrete", ns) or "0")
                + Decimal(_text(prod, "nfe:vOutro", ns) or "0"),
            icms=_parse_tax(imposto, "nfe:ICMS", ns, "nfe:vICMS"),
            pis=_parse_tax(imposto, "nfe:PIS", ns, "nfe:vPIS"),
            cofins=_parse_tax(imposto, "nfe:COFINS", ns, "nfe:vCOFINS"),
        )
        items.append(item)

    return InvoiceData(
        chave_nfe=chave_nfe,
        cnpj_emitente=cnpj_emitente,
        data_emissao=data_emissao,
        serie=serie,
        numero=numero,
        valor_total=valor_total,
        cpf_cnpj_destinatario=cpf_cnpj_destinatario,
        items=items,
    )


def xml_hash(xml_path: Path) -> str:
    data = xml_path.read_bytes()
    return hashlib.sha256(data).hexdigest()


def _parse_root(xml_bytes: bytes, logger) -> etree._Element:
    root = _parse_root_bytes(xml_bytes)
    ns = {"nfe": "http://www.portalfiscal.inf.br/nfe"}
    if _find_inf_nfe(root, ns) is not None:
        return root

    normalized = _normalize_escaped_xml(xml_bytes)
    if normalized != xml_bytes:
        normalized_root = _parse_root_bytes(normalized)
        if _find_inf_nfe(normalized_root, ns) is not None:
            logger.warning("Detected escaped XML attributes; normalized file before parsing")
            return normalized_root

    return root


def _parse_root_bytes(xml_bytes: bytes) -> etree._Element:
    parser = etree.XMLParser(resolve_entities=False, recover=True)
    return etree.fromstring(xml_bytes, parser)


def _normalize_escaped_xml(xml_bytes: bytes) -> bytes:
    if b'\\"' not in xml_bytes:
        return xml_bytes
    return xml_bytes.replace(b'\\"', b'"')


def _find_inf_nfe(root, ns):
    if root is None:
        return None
    if root.tag in {
        "infNFe",
        "{http://www.portalfiscal.inf.br/nfe}infNFe",
    }:
        return root
    return root.find(".//nfe:infNFe", namespaces=ns)


def _validate_signature(root) -> None:
    signature_node = root.find(".//{http://www.w3.org/2000/09/xmldsig#}Signature")
    if signature_node is None:
        return
    xmlsec.tree.add_ids(root, ["Id"])
    ctx = xmlsec.SignatureContext()
    cert_text = _extract_cert(signature_node)
    if cert_text:
        key = xmlsec.Key.from_memory(cert_text, xmlsec.KeyFormat.CERT_PEM, None)
        ctx.key = key
    ctx.verify(signature_node)


def _text(node, path, ns) -> str:
    if node is None:
        return ""
    value = node.findtext(path, namespaces=ns)
    return value.strip() if value else ""


def _parse_tax(imposto, group_path, ns, value_path) -> Optional[Decimal]:
    if imposto is None:
        return None
    group = imposto.find(group_path, namespaces=ns)
    if group is None:
        return None
    value = group.findtext(value_path, namespaces=ns)
    return Decimal(value) if value else None


def _extract_cert(signature_node) -> Optional[str]:
    cert_node = signature_node.find(".//{http://www.w3.org/2000/09/xmldsig#}X509Certificate")
    if cert_node is None or not cert_node.text:
        return None
    cert_clean = "".join(cert_node.text.split())
    cert_wrapped = "\n".join(textwrap.wrap(cert_clean, 64))
    return f"-----BEGIN CERTIFICATE-----\n{cert_wrapped}\n-----END CERTIFICATE-----\n"
