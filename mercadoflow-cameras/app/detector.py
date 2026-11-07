"""Detecta pessoas com YOLOX-tiny (Apache 2.0) em ONNX, na CPU do computador da loja."""
from __future__ import annotations

import threading

import cv2
import numpy as np
import onnxruntime as ort

SIZE = 416
PERSON = 0
STRIDES = (8, 16, 32)


class PersonDetector:
    def __init__(self, model_path: str, confidence: float = 0.4, threads: int = 2):
        opts = ort.SessionOptions()
        # Divide o computador com o caixa e o resto da loja.
        opts.intra_op_num_threads = threads
        opts.inter_op_num_threads = 1
        self.session = ort.InferenceSession(model_path, opts, providers=["CPUExecutionProvider"])
        self.input = self.session.get_inputs()[0].name
        self.confidence = confidence
        # Várias câmeras dividem o modelo, uma por vez: o custo de CPU não cresce com o número delas.
        self.lock = threading.Lock()
        grids, expanded = [], []
        for s in STRIDES:
            n = SIZE // s
            xv, yv = np.meshgrid(np.arange(n), np.arange(n))
            grids.append(np.stack((xv, yv), 2).reshape(1, -1, 2))
            expanded.append(np.full((1, n * n, 1), s))
        self.grid = np.concatenate(grids, 1)
        self.stride = np.concatenate(expanded, 1)

    def detect(self, frame: np.ndarray) -> tuple:
        """Devolve (caixas xyxy em pixels da imagem, confianças)."""
        h, w = frame.shape[:2]
        ratio = min(SIZE / h, SIZE / w)
        resized = cv2.resize(frame, (int(w * ratio), int(h * ratio)), interpolation=cv2.INTER_LINEAR)
        canvas = np.full((SIZE, SIZE, 3), 114, dtype=np.uint8)
        canvas[: resized.shape[0], : resized.shape[1]] = resized
        blob = canvas.transpose(2, 0, 1)[None].astype(np.float32)
        with self.lock:
            out = self.session.run(None, {self.input: blob})[0]
        out[..., :2] = (out[..., :2] + self.grid) * self.stride
        out[..., 2:4] = np.exp(out[..., 2:4]) * self.stride
        pred = out[0]
        scores = pred[:, 4] * pred[:, 5 + PERSON]
        keep = scores >= self.confidence
        if not keep.any():
            return np.empty((0, 4), dtype=np.float32), np.empty((0,), dtype=np.float32)
        pred, scores = pred[keep], scores[keep]
        boxes = np.empty_like(pred[:, :4])
        boxes[:, 0] = pred[:, 0] - pred[:, 2] / 2
        boxes[:, 1] = pred[:, 1] - pred[:, 3] / 2
        boxes[:, 2] = pred[:, 0] + pred[:, 2] / 2
        boxes[:, 3] = pred[:, 1] + pred[:, 3] / 2
        boxes /= ratio
        xywh = [[float(b[0]), float(b[1]), float(b[2] - b[0]), float(b[3] - b[1])] for b in boxes]
        idx = cv2.dnn.NMSBoxes(xywh, scores.tolist(), self.confidence, 0.45)
        idx = np.array(idx).reshape(-1) if len(idx) else np.empty((0,), dtype=int)
        return boxes[idx].astype(np.float32), scores[idx].astype(np.float32)
