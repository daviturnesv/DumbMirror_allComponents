# MMM-LocalCamera

Módulo simples para exibir a webcam local do notebook diretamente no MagicMirror via `getUserMedia` (no navegador). Não utiliza `node_helper` nem serviços externos.

Permissões: ao carregar a página do MagicMirror, o navegador solicitará permissão para acessar a câmera.

Configuração mínima (exemplo):

```
{
  module: "MMM-LocalCamera",
  position: "top_center",
  config: { width: 360, height: 202, mirror: true }
}
```

Notificações suportadas:
- `LOCALCAMERA_TOGGLE` (boolean opcional; sem payload alterna para ligado)
- `LOCALCAMERA_START`
- `LOCALCAMERA_STOP`
- `LOCALCAMERA_ZOOM` { set?: number, delta?: number } — aumenta/diminui ou define o zoom
- `LOCALCAMERA_SIZE` { set?: number, delta?: number } — altera a escala do quadro (tamanho na tela)
- `LOCALCAMERA_FILTER` { name?: string, cycle?: boolean } — troca filtro ou faz ciclo entre presets

Opções:
- `width`/`height`: tamanho do vídeo.
- `mirror`: espelhar horizontalmente (padrão true).
- `facingMode`: `user` ou `environment`.
- `deviceId`: ID específico da câmera (opcional).
- `frameRate`: FPS desejado.
- `retryMs`: tempo entre tentativas em caso de erro.
- `zoom`, `minZoom`, `maxZoom`, `zoomStep`.
- `sizeScale`, `minScale`, `maxScale`, `scaleStep`.
- `filter`: preset inicial (none, grayscale, sepia, invert, contrast, saturate, warm, cool, blur).

Compatível com navegadores modernos. Em desktops, certifique-se que o site (ex.: http://localhost:8080) tem permissão de câmera.
