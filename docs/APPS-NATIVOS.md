# Apps nativos do MercadoFlow

Onde está cada app, como ele é feito e em que pé está a publicação. Revisado em 29/10/2026.

| App | Para quem | Lojas | Pasta | Situação |
|---|---|---|---|---|
| **Bipaê** (`br.com.bipae.confere`) | conferente e estoquista | Play Store | `frontend/android/` | Publicado, versão 1.0.2 (versionCode 3) |
| **MercadoFlow Gestão** (`br.com.mercadoflow.gestao`) | dono e equipe do supermercado | Play Store e App Store | `frontend/android-gestao/`, `frontend/ios-gestao/` | Android pronto para envio (1.0.0). iPhone: projeto pronto, falta a conta Apple e o build no Mac |
| **Agente Mercado Flow** (Windows) | computador do caixa | download no site; Microsoft Store possível | `pdv2cloud-agent/`, `pdv2cloud-config/` | Instalador Inno Setup sem assinatura digital |

## Bipaê

- App Capacitor que **abre o site** `mercadoflow.com/confere/`. Atualiza junto com o site, sem nova versão na loja.
- Nativo: leitor do Google (ML Kit), vibração, folha de compartilhar ("Baixar meus dados").
- Chave de envio: `C:\Users\fusea\.bipae\`. Guia: [BIPAE-PLAY-STORE.md](BIPAE-PLAY-STORE.md) e [bipae-play/AUDITORIA-PLAY-STORE.md](bipae-play/AUDITORIA-PLAY-STORE.md).
- **Atenção:** há uma mudança não salva em `frontend/android/gradle/wrapper/` (Gradle 8.11.1 → 9.7.1). Ela não foi feita nesta revisão. Antes da próxima versão do Bipaê, testar o build com ela ou descartá-la.

## MercadoFlow Gestão

- As **telas do painel vão dentro do app** (build `gestao` do mesmo código React, em `dist-gestao/`). Ele não abre o site e não é PWA: abre sem internet e fala com a API em `https://mercadoflow.com/api`.
- O que muda só no app fica em [`frontend/src/lib/nativeApp.ts`](../frontend/src/lib/nativeApp.ts) e é ligado por `VITE_NATIVE_APP=gestao` ([`frontend/.env.gestao`](../frontend/.env.gestao)):
  - login pelo cabeçalho `Authorization: Bearer`, com o token guardado no aparelho (`@capacitor/preferences`), em vez de cookie;
  - caminhos `/api/...` vindos do servidor (fotos, artes) viram endereço completo;
  - encartes, PDFs, CSVs e "Baixar meus dados" abrem a folha de compartilhar;
  - planos, pagamento, faturas e adicionais não aparecem (exigência da Play Store e da App Store); o cadastro nasce no Grátis;
  - `/` abre o painel em vez da página de vendas do site;
  - "Imprimir ou PDF" do pedido fica de fora (o WebView não imprime).
- Contar estoque no app tem o botão **Bipar** (leitor do Google no Android).
- Um projeto Capacitor serve os dois apps: `capacitor.config.ts` escolhe pelo `MF_APP` (`node scripts/cap.mjs gestao ...`). Sem a variável, vale o Bipaê, como antes.
- O servidor precisa aceitar as origens `https://localhost` e `capacitor://localhost` no `CORS_ORIGIN` da VPS. Já estão lá desde 29/10/2026.
- Build Android: Java 21 (`C:\Users\fusea\.jdks\jdk-21.0.13.0.2+1`), porque o Capacitor 7 exige.
- Chave de envio: `C:\Users\fusea\.mercadoflow-gestao\` (**fazer backup**).
- Guias: [Play Store](mercadoflow-gestao/PLAY-STORE.md) · [App Store](mercadoflow-gestao/APP-STORE.md).

### Comandos

```powershell
cd frontend
npm run android:gestao           # telas + sync Android
npm run ios:gestao               # telas + sync iOS (só no Mac)
cd android-gestao; $env:JAVA_HOME = "$env:USERPROFILE\.jdks\jdk-21.0.13.0.2+1"; .\gradlew.bat bundleRelease
```

### Próximos passos recomendados

1. **Notificações** (Firebase Cloud Messaging no Android e APNs no iPhone) para alertas de estoque, pedidos e pagamento em atraso. Ajuda na análise da Apple (diretriz 4.2).
2. Entrada por **digital ou rosto** (biometria) para reabrir o app.
3. Fontes do painel dentro do app. Hoje a Inter vem do Google Fonts e, sem internet, cai na fonte do sistema.

## Agente Mercado Flow (Windows)

- Serviço Python (`pdv2cloud-agent/service`) mais tela de configuração Electron (`pdv2cloud-config`), empacotados pelo Inno Setup (`pdv2cloud-agent/installer/setup.iss`).
- Microsoft Store: é possível enviar o `.exe` atual, mas exige **assinatura digital** (certificado de code signing; `build-installer.ps1 -Sign` já está pronto para usar), instalação silenciosa (`/VERYSILENT`) e conta de empresa no Partner Center. O `setup-silent.iss` roda `pip install` durante a instalação, o que a loja não aceita; usar o `setup.iss`.
