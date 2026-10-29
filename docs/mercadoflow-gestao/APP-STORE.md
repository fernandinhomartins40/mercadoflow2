# MercadoFlow Gestão na App Store (iPhone)

O projeto do iPhone já existe em `frontend/ios-gestao/`, com nome, ícones, tela de abertura e permissão de câmera prontos. Faltam três coisas que não dá para fazer no Windows: a conta Apple, um Mac (ou Mac na nuvem) e a análise da Apple.

| Item | Valor |
|---|---|
| Nome | **MercadoFlow Gestão** |
| Bundle ID | `br.com.mercadoflow.gestao` (o mesmo do Android) |
| Versão | 1.0.0 (build 1) |
| iOS mínimo | 14.0 |
| Projeto Xcode | `frontend/ios-gestao/App/App.xcodeproj` (Swift Package Manager, sem CocoaPods) |
| Política de privacidade | https://mercadoflow.com/privacidade |

## 1. Conta Apple Developer

1. Assine o **Apple Developer Program** (US$ 99 por ano) **como organização**. Isso exige o número D-U-N-S da empresa; se não tiver, a Apple ajuda a pedir, e pode levar alguns dias.
2. Em **Certificates, Identifiers & Profiles › Identifiers**, registre o App ID `br.com.mercadoflow.gestao`.
3. Em **App Store Connect › Apps › +**, crie o app: nome `MercadoFlow Gestão`, idioma Português (Brasil), bundle `br.com.mercadoflow.gestao`, SKU `mercadoflow-gestao`.

## 2. Gerar o app (precisa de macOS)

A Apple só aceita build feito no Xcode, que só roda em macOS. Três caminhos:

| Caminho | Custo | Observação |
|---|---|---|
| **Codemagic** (Mac na nuvem, conectado ao GitHub) | plano grátis com 500 min/mês | Recomendado: dá para automatizar o envio ao TestFlight |
| GitHub Actions com runner macOS | minutos de macOS são cobrados à parte | Exige configurar certificados como segredos |
| Um Mac emprestado ou alugado (MacinCloud) | por hora ou por mês | Mais manual |

No Mac, a sequência é sempre esta:
```bash
cd frontend
npm ci
npm run ios:gestao                 # build das telas + sync do iOS (refaz o Package.swift com caminhos do Mac)
open ios-gestao/App/App.xcodeproj
```
No Xcode: **Signing & Capabilities** › Team = a organização. Em seguida, **Product › Archive** › **Distribute App** › **App Store Connect**.

> Não rode `cap sync ios` no Windows: ele grava caminhos com barra invertida no `CapApp-SPM/Package.swift`, que quebram no Mac. Se acontecer, rode o sync de novo no Mac.

## 3. Diferenças do iPhone para o Android

- **Leitor de código de barras:** o plugin do Google (ML Kit) não tem versão para o Swift Package Manager. No iPhone, as telas usam a câmera pelo próprio app (`features/confere/Scanner.tsx`), e a permissão já está no `Info.plist` com o texto: "A câmera lê o código de barras dos produtos e das notas na conferência e na contagem de estoque."
- **Barra de status e margens:** `contentInset: 'never'`. O layout usa `env(safe-area-inset-*)`. Conferir num iPhone com notch na primeira build do TestFlight.

## 4. Pontos de análise da Apple

| Diretriz | Situação |
|---|---|
| 4.2 Funcionalidade mínima (não pode ser "site embrulhado") | As telas vão dentro do app e funcionam sem abrir o site. Há leitor de código de barras, compartilhamento de arquivos e sessão guardada no aparelho. Para reforçar, o próximo passo recomendado é ligar **notificações** (alertas de estoque e pedidos) |
| 3.1.1 Compras dentro do app | O app não vende nada: planos, faturas e adicionais não aparecem. A tela "Assinatura e planos" só mostra o plano em uso. **Não** colocar link nem texto que mande a pessoa pagar fora |
| 5.1.1(v) Exclusão de conta | Existe no app: Conta › Excluir minha conta |
| 2.1 Conta de revisão | Usar a mesma conta de demonstração da Play Store, com dados de exemplo |
| Privacidade (App Privacy) | Mesmas respostas da Segurança dos dados da Play Store: nome, e-mail, telefone e dados da loja, ligados à conta, sem rastreamento e sem anúncios |

## 5. Ficha na App Store

- **Subtítulo** (até 30): `O painel do seu mercado`
- **Descrição**: a mesma da Play Store (`PLAY-STORE.md`, passo 3)
- **Palavras-chave**: `supermercado,mercado,estoque,vendas,gestão,varejo,compras,ofertas,encarte,PDV`
- **Categoria**: Negócios
- **Capturas**: iPhone 6,9" (1320 × 2868) e 6,5" (1284 × 2778), tiradas com a conta de demonstração
- **Classificação etária**: 4+ (sem conteúdo sensível)
