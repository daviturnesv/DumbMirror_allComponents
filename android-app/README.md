# DumbMirror Remote App

Aplicativo Android nativo (Kotlin + Jetpack Compose) para controlar e monitorar o espelho inteligente à distância, com suporte tanto para rede local quanto, futuramente, via relay hospedado (ex.: Vercel).

## Visão geral

- **Plataforma:** Android 8.0 (API 26) ou superior.
- **UI:** Jetpack Compose, Material 3.
- **Arquitetura:** camadas `data` (serviços REST/WebSocket), `domain` (use cases) e `ui` (ViewModels + Compose).
- **Comunicação:** Retrofit/OkHttp + kotlinx-serialization para REST; biblioteca socket.io-kotlin para eventos em tempo real.
- **Autenticação inicial:** Token compartilhado salvo no MagicMirror (config futura). Preparado para evoluir para relay cloud.

## Estrutura de pacotes

```text
android-app/
  app/
    src/main/java/com/dumbmirror/remote/
      data/       <- clientes HTTP, DTOs, websocket manager
      domain/     <- casos de uso e modelos de domínio
      ui/         <- telas Compose + ViewModels (Hilt no futuro)
      util/       <- helpers (config, formato, etc.)
```

## Roadmap imediato

1. Criar clientes de API para MMM-Remote-Control (REST) e assinaturas socket.io.
2. Implementar tela de emparelhamento (configuração de host, teste de conexão, salvar preferências).
3. Construir dashboard inicial com status do espelho (página atual, música tocando, resumo disponível, sensores).
4. Adicionar seções dedicadas (Mídia, Sensores, Câmera/Screencast, Resumo diário) com as ações existentes.
5. Integrar recebimento de broadcasts (NOW_PLAYING, SENSORDATA_REPORT_BROADCAST, etc.) via socket.
6. Preparar abstração para Relay cloud (interface `RemoteGateway` intercambiável entre LAN e SaaS).

## Requisitos de build

- Android Studio Iguana ou mais recente.
- Gradle 8.5+
- JDK 17

Após clonar o repositório, abra `android-app` no Android Studio e execute:

```bash
./gradlew tasks
```

> Se preferir, gere o wrapper localmente com `gradle wrapper` antes do primeiro build.

## Próximos passos

- Definir formato de mensagens para o futuro servidor relay.
- Implementar armazenamento seguro de tokens (EncryptedSharedPreferences / Jetpack DataStore).
- Adicionar testes unitários para use cases e clientes de rede.
- Preparar pipelines de CI (GitHub Actions) para lint e build do app.
