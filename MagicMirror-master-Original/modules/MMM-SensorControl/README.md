# MMM-SensorControl

Módulo auxiliar para controlar o `MMM-SensorData` através de comandos de voz ou gestos vindos de outros módulos (ex: MMM-Voice, MMM-GroveGestures, MMM-Gestures, módulos de Assistant / Google).

## Ideia

Escuta notificações de voz/gesto e traduz em:

- `SENSORDATA_EXPORT` – exporta CSV agora
- `SENSORDATA_REFRESH_HISTORY` – recarrega histórico completo

Assim você não altera código dos módulos originais, só adiciona este como ponte.

## Instalação

Coloque a pasta em `modules/MMM-SensorControl` e nenhuma dependência extra é necessária.

## Configuração Básica

```javascript
{
  module: "MMM-SensorControl",
  position: "top_left", // posição qualquer (não exibe nada)
  config: {
    debug: false,
    showAlert: true,
    voiceMap: {
      export: ["exportar dados", "export csv", "salvar csv"],
      refresh: ["atualizar histórico", "refresh history"]
    },
    gestureMap: {
      export: ["CLOCKWISE", "SWIPE_UP"],
      refresh: ["COUNTER_CLOCKWISE", "SWIPE_DOWN"]
    },
    directNotificationMap: { SWIPE_UP: "export", SWIPE_DOWN: "refresh" }
  }
}
```

## Integração com Módulos de Voz

Configure seu módulo de reconhecimento (ex: MMM-Voice) para emitir `VOICE_COMMAND` com a frase reconhecida. O SensorControl faz correspondência case/acentos-insensível.

Para módulos Assistant que enviam outra notificação (ex: `ASSISTANT_ACTION` ou objeto com `text`), também é tratado.

Se preferir usar MMM-NotificationTrigger, mapeie a frase diretamente para `SENSORDATA_EXPORT` e não precisa deste módulo; ele é útil quando quer centralizar várias origens (voz + gestos) em uma lógica de sinônimos.

## Integração com Gestos

Módulos como MMM-GroveGestures emitem `GESTURE_DETECTED` com payload `{gesture: 'CLOCKWISE'}`. Ajuste `gestureMap` conforme nomes emitidos. Alguns módulos disparam notificações simples como `SWIPE_UP`; use `directNotificationMap`.

## Personalização de Frases

Adicione/remova expressões em `voiceMap.export` e `voiceMap.refresh`. A correspondência remove acentos ("histórico" == "historico") e ignora maiúsculas/minúsculas.

## Feedback

`showAlert: true` envia um `SHOW_ALERT` (padrão do MagicMirror) confirmando ação. Desative em uso diário se quiser interface silenciosa.

## Extensões Futuras

- Adicionar ação para alternar exibição de gráficos
- Suporte a frase para alterar janela `historyMinutes`
- Ação para ligar/desligar `broadcastSummary` em tempo de execução

PRs / adaptações locais são simples – veja `_doAction` em `MMM-SensorControl.js`.
