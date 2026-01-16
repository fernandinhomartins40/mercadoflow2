import json
import time
import threading
import logging
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from .parser import parse_xml, xml_hash
from .queue_manager import QueueManager

IGNORED_SUFFIXES = (".tmp", ".~lock")
logger = logging.getLogger("PDV2Cloud")


def _is_valid_file(path: Path) -> bool:
    if path.suffix.lower() not in (".xml", ".zip"):
        return False
    if any(str(path).endswith(suffix) for suffix in IGNORED_SUFFIXES):
        return False
    return True


class WatchHandler(FileSystemEventHandler):
    def __init__(self, process_file, debounce_seconds: int = 5):
        self.process_file = process_file
        self.debounce_seconds = debounce_seconds
        self._pending = {}
        self._lock = threading.Lock()

    def on_created(self, event):
        if event.is_directory:
            return
        self._schedule(Path(event.src_path))

    def on_modified(self, event):
        if event.is_directory:
            return
        self._schedule(Path(event.src_path))

    def _schedule(self, path: Path):
        if not _is_valid_file(path):
            return
        with self._lock:
            self._pending[path] = time.time()

    def flush(self):
        now = time.time()
        to_process = []
        with self._lock:
            for path, ts in list(self._pending.items()):
                if now - ts >= self.debounce_seconds:
                    to_process.append(path)
                    del self._pending[path]
        for path in to_process:
            self.process_file(path)


class FileWatcher:
    def __init__(self, watch_paths, queue_manager: QueueManager, xsd_paths=None):
        self.watch_paths = [Path(p) for p in watch_paths]
        self.queue_manager = queue_manager
        self.xsd_paths = [Path(p) for p in (xsd_paths or [])]
        self.observer = Observer()
        self.handler = WatchHandler(self._process_file)

    def start(self):
        for path in self.watch_paths:
            path.mkdir(parents=True, exist_ok=True)
            self.observer.schedule(self.handler, str(path), recursive=False)
        self.observer.start()

    def stop(self):
        self.observer.stop()
        self.observer.join()

    def loop(self, stop_event):
        while not stop_event.is_set():
            self.handler.flush()
            time.sleep(1)

    def _process_file(self, path: Path):
        try:
            if path.suffix.lower() == ".zip":
                from .zip_utils import process_zip
                for xml in process_zip(path):
                    self._enqueue_xml(xml)
            else:
                self._enqueue_xml(path)
        except Exception as exc:
            logger.error("Failed processing file %s: %s", path, exc)

    def _enqueue_xml(self, xml_path: Path):
        invoice = parse_xml(xml_path, self.xsd_paths)
        payload = {
            "chaveNFe": invoice.chave_nfe,
            "cnpjEmitente": invoice.cnpj_emitente,
            "dataEmissao": invoice.data_emissao,
            "serie": invoice.serie,
            "numero": invoice.numero,
            "valorTotal": float(invoice.valor_total),
            "cpfCnpjDestinatario": invoice.cpf_cnpj_destinatario,
            "items": [
                {
                    "codigoEAN": item.codigo_ean,
                    "codigoInterno": item.codigo_interno,
                    "descricao": item.descricao,
                    "ncm": item.ncm,
                    "cfop": item.cfop,
                    "quantidade": float(item.quantidade),
                    "valorUnitario": float(item.valor_unitario),
                    "valorTotal": float(item.valor_total),
                    "icms": float(item.icms) if item.icms else None,
                    "pis": float(item.pis) if item.pis else None,
                    "cofins": float(item.cofins) if item.cofins else None,
                }
                for item in invoice.items
            ],
            "rawXmlHash": xml_hash(xml_path),
        }
        self.queue_manager.enqueue(invoice.chave_nfe, json.dumps(payload), payload["rawXmlHash"])
