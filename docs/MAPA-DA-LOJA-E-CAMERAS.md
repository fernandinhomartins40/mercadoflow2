# Planta da loja, prateleiras, 3D e mapa de calor por câmeras

Estado em **07/11/2026**, para continuar em outra sessão. Tudo abaixo está em produção (mercadoflow.com),
salvo o que está em "O que falta".

No painel: **Vender → Planta e prateleiras** (`/app/mapa-loja`). Abas: Editar a planta, Prateleiras,
Onde mais vende, Movimento, Sugestões. Vistas: Planta, 3D, Corredor. `?aba=prateleiras` (ou `movimento`) abre direto numa aba.

## 1. Prateleiras por gôndola

Estrutura salva no JSON da planta (`store_layouts.plan`), validada por `StorePlan.java`:
móvel → lados (A/B em gôndola e ilha; só A nos outros) → módulos (largura própria, 20–400 cm, até 40) →
prateleiras de cima para baixo (1–12; prateleira, gancheira, cesto ou grade) → espaços (produto, setor inteiro
ou nome livre, com `share` = fração da prateleira e `facings` opcional). A soma por prateleira nunca passa de 100%.

- Regras puras: `frontend/src/features/store-map/shelves.ts` (verificação: `node scripts/shelves.check.ts`).
- Editor: `editor/ShelfEditor.tsx` (módulos, nº de prateleiras, divisórias arrastáveis, 80/20, pelas frentes, copiar lado A→B).
- Lado da gôndola em pé: A olha para oeste (esquerda da planta), B para leste; deitada: A para o fundo, B para a frente.
- "Onde fica?": `StoreMapService.locate` devolve `places` (gôndola, lado, módulo, prateleira, posição).
- Gerador de corredores (`AisleGenerator.tsx`) já cria as gôndolas com prateleiras montadas.

## 2. Bipar produtos na prateleira

`editor/ShelfScan.tsx`: leitor do Google (ML Kit) no Android, câmera no navegador/iPhone ou leitor USB.
Cada código entra na prateleira aberta; "Próxima prateleira" desce e passa ao próximo módulo.
Backend: `GET /api/v1/markets/{id}/store-map/barcode?code=` (produto, setor e lugares onde já está).

## 3. 3D realista

`view3d/Store3D.tsx` (three.js 0.169, carregado só ao abrir a aba 3D). Móveis na altura real, prateleiras e
produtos no espaço que ocupam, com a foto do catálogo na frente. Sem WebGL, cai na vista antiga (`IsoView`).

## 4. Mapa de calor: app MercadoFlow Câmeras

### Como funciona
1. Na aba **Movimento**, o lojista baixa o instalador e gera a chave da loja (chave de agente `pdv2_`, nome "Câmeras (mapa de calor)").
2. No app (Windows 10/11), cola a chave, cadastra câmeras (RTSP ou número de câmera USB) e marca **4 pontos do piso**
   na imagem e os mesmos 4 na planta (homografia).
3. O app detecta pessoas, usa o pé (base da caixa) como posição no piso, converte para metros da planta e soma
   **segundos de presença por célula de 50 cm, por hora, por câmera**. Envia a cada 5 minutos.
4. **Nenhuma imagem sai do computador.** Não grava, não reconhece rosto, não segue pessoa entre quadros.

### Código do app: `mercadoflow-cameras/`
- `app/detector.py`: YOLOX-tiny (Apache 2.0) em ONNX, CPU, limiar 0,4; um modelo compartilhado entre câmeras (lock).
- `app/mapping.py`: `FloorMap` (4 pontos → metros; só conta dentro da área marcada) e `Accumulator`
  (acumulado por hora em `%APPDATA%\MercadoFlowCameras\movimento-<id>.json`; guarda até 30 dias sem internet).
- `app/pipeline.py`: leitura com reconexão, no mínimo 1 s entre análises e no máximo 1/4 do tempo ocupado.
- `app/store.py`: configuração com chave e endereços das câmeras cifrados pelo Windows (DPAPI); chamadas à API.
- `app/ui.py`: janela (chave, lista de câmeras, Testar, Calibrar, Remover). Aviso de LGPD na primeira abertura.
- `main.py --check`: autoverificação (abre o modelo e analisa um quadro); o build roda no .exe.
- Teste: `python tests/check_core.py [modelo.onnx] [video.mp4]`. Instalador: `pwsh build/build.ps1`
  (PyInstaller + Inno Setup; cria atalho na inicialização do Windows com `--minimized`).
- Dependências fixadas para Python 3.13: onnxruntime 1.31.1, opencv-python-headless 5.0.0.93, pillow 13.0.0, numpy 2.5.4.
- O modelo não fica no git: o build baixa e confere o SHA-256 `427cc366…b0f7`.

### Decisões tomadas (com medição)
- **Sem Supervision/ByteTrack.** No vídeo de teste, a 1 análise/s o rastreador contava 3,1 das 23,6 pessoas
  (descartava quem anda); sem ele, 22,2. Presença não precisa de identidade.
- **YOLOX-tiny, não nano:** 23 pessoas detectadas contra 19, com custo aceitável (~200–370 ms por análise nesta máquina).
- Evitados por licença: Ultralytics (AGPL) e SKU-110K (não comercial).

### Backend
- Tabela `store_traffic_cells` (migração V112, com RLS): `market_id, camera_id, bucket_start (hora local), cell_x, cell_y, seconds`.
  O app manda o **acumulado** da hora e o servidor substitui (reenvio não soma duas vezes). Apaga após 400 dias.
- `GET /api/v1/agent/store-traffic/plan` e `POST /api/v1/agent/store-traffic` (chave `X-API-Key: pdv2_…`): `AgentStoreTrafficController`.
- `GET /api/v1/markets/{id}/store-map/traffic?days=&from=&to=`: `StoreTrafficService.report`.
- `GET /api/v1/downloads/cameras-installer`: arquivo em `/opt/pdv2cloud/installer/MercadoFlowCameras-Setup.exe` na VPS.
- Painel: `features/store-map/TrafficPanel.tsx`; camada no piso via prop `traffic` do `PlanCanvas`.
- CI: `.github/workflows/build-cameras-installer.yml` (Windows gera, Ubuntu envia à VPS e confere o hash do download).

## 5. App MercadoFlow Gestão (Android)

- Versão 1.0.1 (versionCode 2), pacote assinado em `C:\Users\fusea\.mercadoflow-gestao\mercadoflow-gestao-1.0.1.aab`.
  Guia: `docs/mercadoflow-gestao/PLAY-STORE.md`.
- Corrigido: a API recusava o app (403) por CORS. Agora `docker-compose.vps.yml` libera `https://localhost` e `capacitor://localhost`.

## O que falta (depende do usuário)

1. **Certificado de assinatura de código Windows.** Sem ele, o Windows avisa ao instalar e, com o Controle Inteligente de
   Aplicativos ligado (caso deste computador), **bloqueia o app**. Ao comprar, cadastrar no GitHub
   `PDV2CLOUD_CODESIGN_PFX_BASE64`, `PDV2CLOUD_CODESIGN_PFX_PASSWORD` e (opcional) `PDV2CLOUD_CODESIGN_TIMESTAMP_URL`.
   O build de Câmeras e o do Agente passam a assinar sozinhos.
2. **Play Store:** o MCP precisa de `C:\Users\fusea\.bipae\play-service-account.json` (não existe nesta máquina), ou enviar o `.aab` pelo Play Console.
3. **iPhone:** exige um Mac.
4. **Aviso de monitoramento por câmeras** visível na loja (LGPD); confirmar o texto com o jurídico.

## O que ainda não foi testado

- Câmera real (RTSP/USB): só vídeo em arquivo. Testados: instalação, janela, tela de calibração, desinstalação.
- Envio real com chave de verdade em produção (consultas testadas em transação desfeita; rota recusa sem chave).
- Telas do painel logado: aba Movimento, aba Prateleiras, 3D e bipar no celular.
- Câmeras com áreas sobrepostas contam em dobro no ponto em comum: orientar o lojista a não sobrepor.

## Próximo passo sugerido

Instalar o app no computador de uma loja, gerar a chave na aba Movimento, cadastrar uma câmera, marcar os 4 pontos e
conferir o calor na planta em ~5 minutos. Se falhar, ver a coluna "Situação" do app.
