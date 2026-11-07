"""Da imagem da câmera para o piso da loja, e do piso para os números enviados."""
from __future__ import annotations

import json
import os
import threading
from datetime import datetime

import cv2
import numpy as np

CELL_SIZE = 0.5  # metros; igual ao StoreTrafficService do backend
MAX_STEP_SECONDS = 5.0  # câmera travada não vira "pessoa parada há horas"
KEEP_HOURS = 24 * 30  # sem internet, guarda até 30 dias (o servidor aceita 45)


class FloorMap:
    """4 pontos do piso na imagem (px) e os mesmos 4 na planta (metros)."""

    def __init__(self, image_points, plan_points):
        if len(image_points) != 4 or len(plan_points) != 4:
            raise ValueError("Marque 4 pontos na imagem e 4 na planta.")
        self.quad = np.array(image_points, dtype=np.float32)
        plan = np.array(plan_points, dtype=np.float32)
        if abs(cv2.contourArea(self.quad)) < 100:
            raise ValueError("Os pontos da imagem estão muito juntos ou em linha.")
        if abs(cv2.contourArea(plan)) < 0.25:
            raise ValueError("Os pontos da planta estão muito juntos ou em linha.")
        self.h = cv2.getPerspectiveTransform(self.quad, plan)

    def to_plan(self, foot_points: np.ndarray) -> list:
        """Só vale dentro da área marcada: fora dela a perspectiva dá posições sem sentido."""
        out = []
        if len(foot_points) == 0:
            return out
        mapped = cv2.perspectiveTransform(np.array(foot_points, dtype=np.float32).reshape(-1, 1, 2), self.h).reshape(-1, 2)
        for (px, py), (mx, my) in zip(foot_points, mapped):
            if cv2.pointPolygonTest(self.quad, (float(px), float(py)), False) >= 0:
                out.append((float(mx), float(my)))
        return out


class Accumulator:
    """
    Segundos de presença por hora e célula de uma câmera. É isto, e só isto, que
    sai do computador: sem imagem e sem nada que identifique uma pessoa. Guarda em
    disco para sobreviver a queda de luz e a dias sem internet.
    """

    def __init__(self, path: str | None = None):
        self.path = path
        self.lock = threading.Lock()
        self.hours: dict[str, dict[str, float]] = {}
        self.dirty: set[str] = set()
        if path and os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    saved = json.load(f)
                self.hours = saved.get("hours", {})
                self.dirty = set(saved.get("dirty", []))
            except (OSError, ValueError):
                self.hours, self.dirty = {}, set()

    def add(self, positions, seconds: float, when: datetime, width: float, height: float) -> int:
        step = min(max(0.0, seconds), MAX_STEP_SECONDS)
        hour = when.replace(minute=0, second=0, microsecond=0).isoformat()
        counted = 0
        with self.lock:
            cells = self.hours.setdefault(hour, {})
            for x, y in positions:
                if 0 <= x < width and 0 <= y < height:
                    key = f"{int(x / CELL_SIZE)},{int(y / CELL_SIZE)}"
                    cells[key] = round(cells.get(key, 0.0) + step, 1)
                    counted += 1
            if counted:
                self.dirty.add(hour)
        return counted

    def pending(self) -> list:
        """Horas que mudaram desde o último envio, com o acumulado (o servidor substitui, não soma)."""
        with self.lock:
            return [
                {
                    "start": h,
                    "cells": [
                        {"x": int(k.split(",")[0]), "y": int(k.split(",")[1]), "seconds": v}
                        for k, v in self.hours.get(h, {}).items()
                    ],
                }
                for h in sorted(self.dirty)
            ]

    def acknowledge(self, sent: list, now: datetime) -> None:
        """Confirma o envio. Só limpa o que não muda mais; a hora atual segue somando."""
        current = now.replace(minute=0, second=0, microsecond=0).isoformat()
        with self.lock:
            for bucket in sent:
                hour = bucket["start"]
                # Se somou depois de montar o envio, continua pendente.
                unchanged = sum(c["seconds"] for c in bucket["cells"]) == sum(self.hours.get(hour, {}).values())
                if unchanged:
                    self.dirty.discard(hour)
                    if hour < current:
                        self.hours.pop(hour, None)
            oldest = now.timestamp() - KEEP_HOURS * 3600
            for hour in list(self.hours):
                if datetime.fromisoformat(hour).timestamp() < oldest:
                    self.hours.pop(hour, None)
                    self.dirty.discard(hour)

    def today_seconds(self, now: datetime) -> float:
        day = now.date().isoformat()
        with self.lock:
            return sum(v for h, cells in self.hours.items() if h.startswith(day) for v in cells.values())

    def save(self) -> None:
        if not self.path:
            return
        with self.lock:
            data = {"hours": self.hours, "dirty": sorted(self.dirty)}
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(tmp, self.path)
