"""
Verificação do núcleo, sem câmera: python tests/check_core.py [modelo.onnx] [video.mp4]
Com modelo e vídeo, roda o caminho inteiro em imagem real e confere o que seria enviado.
"""
import json
import os
import sys
import tempfile
from datetime import datetime, timedelta

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.mapping import Accumulator, CELL_SIZE, FloorMap  # noqa: E402

# Imagem 1000x1000 mapeada na loja de 20x10 m: o centro cai no meio da planta.
square = [[0, 0], [1000, 0], [1000, 1000], [0, 1000]]
floor = FloorMap(square, [[0, 0], [20, 0], [20, 10], [0, 10]])
pos = floor.to_plan(np.array([[500.0, 500.0], [1500.0, 500.0]]))
assert len(pos) == 1, "ponto fora da área marcada não conta"
assert abs(pos[0][0] - 10) < 1e-3 and abs(pos[0][1] - 5) < 1e-3, pos

for bad in ([[0, 0]] * 4, [[0, 0], [1, 0], [2, 0], [3, 0]]):
    try:
        FloorMap(bad, [[0, 0], [20, 0], [20, 10], [0, 10]])
        raise AssertionError("pontos em linha deveriam ser recusados")
    except ValueError:
        pass

now = datetime(2026, 11, 7, 10, 30)
acc = Accumulator()
assert acc.add([(10.2, 5.1), (10.3, 5.2), (99, 1)], 1.0, now, 20, 10) == 2, "fora da loja não conta"
acc.add([(10.2, 5.1)], 600, now, 20, 10)  # câmera travada soma no máximo 5 s
sent = acc.pending()
assert sent[0]["start"] == "2026-11-07T10:00:00"
assert sent[0]["cells"] == [{"x": int(10.2 / CELL_SIZE), "y": int(5.1 / CELL_SIZE), "seconds": 7.0}], sent

# O envio é só número: nenhuma chave além de hora, célula e segundos.
assert set(sent[0]) == {"start", "cells"} and set(sent[0]["cells"][0]) == {"x", "y", "seconds"}

# Hora em andamento continua somando o acumulado; hora fechada sai da memória depois de enviada.
acc.acknowledge(sent, now)
assert acc.pending() == []
acc.add([(10.2, 5.1)], 1.0, now, 20, 10)
assert acc.pending()[0]["cells"][0]["seconds"] == 8.0, "reenvia o acumulado, não a diferença"
later = now + timedelta(hours=2)
acc.acknowledge(acc.pending(), later)
assert acc.hours == {}

# Soma feita durante o envio não se perde.
acc.add([(1, 1)], 1.0, now, 20, 10)
snapshot = acc.pending()
acc.add([(1, 1)], 1.0, now, 20, 10)
acc.acknowledge(snapshot, later)
assert acc.pending()[0]["cells"][0]["seconds"] == 2.0

# Sobrevive a reiniciar o computador.
with tempfile.TemporaryDirectory() as d:
    path = os.path.join(d, "m.json")
    a = Accumulator(path)
    a.add([(2, 2)], 3.0, now, 20, 10)
    a.save()
    assert Accumulator(path).pending()[0]["cells"][0]["seconds"] == 3.0

print("núcleo: ok")

if len(sys.argv) > 2:
    import cv2

    from app.detector import PersonDetector
    from app.pipeline import Analyzer

    detector = PersonDetector(sys.argv[1])
    cap = cv2.VideoCapture(sys.argv[2])
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    acc = Accumulator()
    analyzer = Analyzer(detector, FloorMap([[0, 0], [w, 0], [w, h], [0, h]], [[0, 0], [20, 0], [20, 10], [0, 10]]), acc, 20, 10)
    step, frames, people, spent = int(fps) or 1, 0, 0, 0.0
    t0 = datetime(2026, 11, 7, 10, 0)
    while frames < fps * 30:
        ok, frame = cap.read()
        if not ok:
            break
        if frames % step == 0:
            began = datetime.now()
            people += analyzer.step(frame, step / fps, t0)
            spent += (datetime.now() - began).total_seconds()
        frames += 1
    analyses = max(1, frames // step)
    buckets = acc.pending()
    payload = json.dumps({"cameraId": "teste", "buckets": buckets})
    total = sum(c["seconds"] for b in buckets for c in b["cells"])
    print(f"vídeo: {frames} quadros, {analyses} análises, {people / analyses:.1f} pessoas por análise, "
          f"{1000 * spent / analyses:.0f} ms por análise, {sum(len(b['cells']) for b in buckets)} células, "
          f"{total:.0f} s de presença, envio de {len(payload)} bytes")
    assert people > 0, "nenhuma pessoa detectada no vídeo"
    assert '"jpg"' not in payload and "data:" not in payload
    print("caminho real: ok")
