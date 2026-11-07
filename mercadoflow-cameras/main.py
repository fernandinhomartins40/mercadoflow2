"""MercadoFlow Câmeras: mapa de calor da loja, com o vídeo analisado neste computador."""
import sys


def self_check() -> int:
    """--check: prova que o pacote abre o modelo e analisa um quadro. O build roda isto no .exe."""
    import numpy as np

    from app.detector import PersonDetector
    from app.ui import resource

    boxes, _ = PersonDetector(resource("assets", "yolox_tiny.onnx")).detect(np.zeros((480, 640, 3), dtype=np.uint8))
    return 0 if len(boxes) == 0 else 1


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(self_check())
    from app.ui import App

    App(minimized="--minimized" in sys.argv).mainloop()
