"""Uma câmera: lê o vídeo, acha as pessoas e soma a presença de cada uma no piso."""
from __future__ import annotations

import os
import threading
import time
from datetime import datetime

import cv2
import numpy as np

from .detector import PersonDetector
from .mapping import Accumulator, FloorMap

MIN_INTERVAL = 1.0
# Analisa no máximo 1/4 do tempo: o computador também atende o caixa e o resto da loja.
BUSY_SHARE = 0.25
# TCP: RTSP por UDP perde pacote e entorta a imagem nas redes de loja.
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp|timeout;10000000")


def open_source(source: str) -> cv2.VideoCapture:
    """Número = câmera USB; o resto = endereço RTSP ou arquivo."""
    src = source.strip()
    return cv2.VideoCapture(int(src)) if src.isdigit() else cv2.VideoCapture(src)


def grab_frame(source: str):
    """Um quadro para testar e calibrar. O quadro nunca sai deste computador."""
    cap = open_source(source)
    try:
        ok, frame = False, None
        for _ in range(15):  # o primeiro quadro de RTSP costuma vir cinza
            ok, frame = cap.read()
        return frame if ok else None
    finally:
        cap.release()


def foot_points(xyxy: np.ndarray) -> np.ndarray:
    """O pé é a base da caixa: é o ponto da pessoa que está no piso."""
    return np.stack(((xyxy[:, 0] + xyxy[:, 2]) / 2, xyxy[:, 3]), 1) if len(xyxy) else np.empty((0, 2))


class Analyzer:
    """
    Passo de análise sem câmera nem thread: é o que os testes exercitam.

    Sem rastrear pessoa entre quadros, de propósito. Medido em vídeo real, o
    ByteTrack a 1 análise por segundo descartava 87% de quem anda e deixaria o
    mapa só com quem fica parado. Presença não precisa de identidade: basta somar
    onde há gente a cada análise, e ainda não sobra nada que siga uma pessoa.
    """

    def __init__(self, detector: PersonDetector, floor: FloorMap, acc: Accumulator, width: float, height: float):
        self.detector, self.floor, self.acc = detector, floor, acc
        self.width, self.height = width, height

    def step(self, frame: np.ndarray, seconds: float, when: datetime) -> int:
        boxes, _ = self.detector.detect(frame)
        return self.acc.add(self.floor.to_plan(foot_points(boxes)), seconds, when, self.width, self.height)


class CameraWorker(threading.Thread):
    def __init__(self, cam: dict, detector: PersonDetector, floor: FloorMap, acc: Accumulator, width: float, height: float):
        super().__init__(daemon=True, name=f"camera-{cam['id']}")
        self.cam = cam
        self.analyzer = Analyzer(detector, floor, acc, width, height)
        self.stopping = threading.Event()
        self.status = "Iniciando"
        self.people = 0

    def stop(self) -> None:
        self.stopping.set()

    def run(self) -> None:
        wait = 5
        while not self.stopping.is_set():
            cap = open_source(self.cam["source"])
            if not cap.isOpened():
                cap.release()
                self.status = f"Sem imagem. Tentando de novo em {wait} s"
                self.people = 0
                self.stopping.wait(wait)
                wait = min(wait * 2, 300)
                continue
            wait = 5
            self.status = "Analisando"
            self._loop(cap)
            cap.release()
        self.status = "Parada"

    def _loop(self, cap: cv2.VideoCapture) -> None:
        last = time.monotonic()
        interval = MIN_INTERVAL
        while not self.stopping.is_set():
            # Grab descarta o vídeo sem decodificar: analisa sempre o quadro mais novo, com pouca CPU.
            if not cap.grab():
                self.status = "A câmera parou de enviar imagem. Reconectando"
                self.people = 0
                self.stopping.wait(5)
                return
            began = time.monotonic()
            if began - last < interval:
                continue
            ok, frame = cap.retrieve()
            if not ok:
                continue
            self.people = self.analyzer.step(frame, began - last, datetime.now())
            last = began
            interval = max(MIN_INTERVAL, (time.monotonic() - began) / BUSY_SHARE)
