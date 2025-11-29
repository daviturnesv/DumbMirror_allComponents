# DumbMirror Remote App

Aplicativo Android nativo (Kotlin + Jetpack Compose) para controlar e monitorar o espelho inteligente à distância, com suporte tanto para rede local quanto via relay hospedado no Render.

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

## Requisitos de build

- Android Studio Iguana ou mais recente.
- Gradle 8.5+
- JDK 17

Após clonar o repositório, abra `android-app` no Android Studio e execute:

```bash
./gradlew tasks
```

> Se preferir, gere o wrapper localmente com `gradle wrapper` antes do primeiro build.
