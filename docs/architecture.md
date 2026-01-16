# Arquitetura

```mermaid
flowchart LR
  subgraph PDV
    A[PDV XML/NFe/NFCe]
  end

  subgraph Agent
    B[Watcher Python]
    C[Parser XML]
    D[Fila SQLite]
    E[Transmissor HTTP]
  end

  subgraph Cloud
    F[API Spring Boot]
    G[(SQLite/PostgreSQL)]
    H[Jobs Quartz]
    I[Analytics]
  end

  subgraph Web
    J[Frontend React]
  end

  A --> B --> C --> D --> E --> F --> G
  F --> H --> I
  J <--> F
```

## Componentes
- Agente desktop: monitora pastas, valida XML, envia para API e gerencia fila local.
- API: recebe ingestao, autentica, armazena e calcula analiticos.
- Web: dashboard, alertas, produtos e market basket.
