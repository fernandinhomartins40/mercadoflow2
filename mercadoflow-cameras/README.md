# MercadoFlow Câmeras

App de Windows que gera o mapa de calor da loja (Vender → Planta e prateleiras → Movimento).
O vídeo é analisado no computador da loja. **Só saem números**: segundos de presença por
célula de 50 cm da planta, por hora e por câmera. Nada de imagem, gravação, rosto ou rastreio
de pessoa entre quadros.

- `app/detector.py`: pessoas com YOLOX-tiny (Apache 2.0) em ONNX, na CPU.
- `app/mapping.py`: imagem → metros da planta (4 pontos marcados pelo lojista) → acumulado por hora, guardado em disco.
- `app/pipeline.py`: leitura da câmera, com reconexão e no máximo 1/4 do tempo ocupado analisando.
- `app/store.py`: configuração cifrada pelo Windows (DPAPI) e API (`/api/v1/agent/store-traffic`).
- `app/ui.py`: janela de chave, câmeras e calibração.

Verificar: `python tests/check_core.py [modelo.onnx] [video.mp4]`.
Gerar o instalador: `pwsh build/build.ps1`. O CI publica em `/api/v1/downloads/cameras-installer`.
