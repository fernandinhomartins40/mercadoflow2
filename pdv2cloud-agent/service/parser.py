from dataclasses import dataclass
from typing import Optional, List
from decimal import Decimal
from pathlib import Path
import hashlib
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
    if xmlsec is None:
        raise RuntimeError("xmlsec not available for signature validation")
    xml_bytes = xml_path.read_bytes()
    parser = etree.XMLParser(resolve_entities=False, recover=True)
    root = etree.fromstring(xml_bytes, parser)

    if xsd_paths:
        for xsd_path in xsd_paths:
            schema = etree.XMLSchema(etree.parse(str(xsd_path)))
            schema.assertValid(root)

    if xmlsec is not None:
        _validate_signature(root)

    ns = {"nfe": "http://www.portalfiscal.inf.br/nfe"}
    inf_nfe = root.find(".//nfe:infNFe", namespaces=ns)
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
