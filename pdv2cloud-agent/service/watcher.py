import json
import time
import threading
import logging
from pathlib import Path
import shutil
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

    def on_moved(self, event):
        if event.is_directory:
            return
        dest_path = getattr(event, "dest_path", None)
        if not dest_path:
            return
        self._schedule(Path(dest_path))

    def _schedule(self, path: Path):
        if not _is_valid_file(path):
            return
        with self._lock:
            self._pending[path] = time.time()
        logger.info("Detected file event for processing: %s", path)

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
        if not self.watch_paths:
            logger.warning("No watch paths configured - file watcher not started")
            return

        for path in self.watch_paths:
            try:
                path.mkdir(parents=True, exist_ok=True)
                self.observer.schedule(self.handler, str(path), recursive=False)
                logger.info("Watching path: %s", path)
            except Exception as exc:
                logger.warning("Failed to watch path %s: %s", path, exc)

        if self.observer.handlers:
            self.observer.start()
            logger.info("File watcher started with %d paths", len(self.observer.handlers))
        else:
            logger.warning("File watcher not started - no valid paths")

    def scan_existing(self, limit: int = 5000):
        processed = 0
        for root in self.watch_paths:
            if not root.exists():
                continue
            for path in sorted(root.iterdir()):
                if processed >= limit:
                    return processed
                if path.is_file() and _is_valid_file(path):
                    self._process_file(path)
                    processed += 1
        return processed

    def stop(self):
        self.observer.stop()
        self.observer.join()

    def loop(self, stop_event):
        while not stop_event.is_set():
            self.handler.flush()
            time.sleep(1)

    def _process_file(self, path: Path):
        try:
            if not path.exists():
                logger.warning("Skipping disappeared file: %s", path)
                return
            if path.suffix.lower() == ".zip":
                from .zip_utils import extract_zip
                extract_dir, xml_files = extract_zip(path)
                try:
                    for xml in xml_files:
                        self._enqueue_xml(xml)
                finally:
                    shutil.rmtree(extract_dir, ignore_errors=True)
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
        enqueue_result = self.queue_manager.enqueue(
            invoice.chave_nfe,
            json.dumps(payload),
            payload["rawXmlHash"]
        )
        if enqueue_result == "queued":
            logger.info(
                "Invoice queued successfully | chave=%s | file=%s",
                invoice.chave_nfe,
                xml_path,
            )
        elif enqueue_result == "duplicate_chave":
            logger.info(
                "Ignoring XML already known by chave | chave=%s | file=%s",
                invoice.chave_nfe,
                xml_path,
            )
        elif enqueue_result == "duplicate_hash":
            logger.info(
                "Ignoring XML already known by content hash | chave=%s | file=%s",
                invoice.chave_nfe,
                xml_path,
            )
