# MMM-VoiceBridge (Python Bridge)

Bridge simples que permite comandos de voz sem compilar módulos nativos Node problemáticos no Windows.

## Visão Geral

- Um script Python (`voice_server.py`) usa Vosk + sounddevice para transcrever áudio do microfone.
- Cada frase final reconhecida é gravada em `voice_cmd.txt`.
- O módulo front-end `MMM-VoiceBridge` faz polling do arquivo e compara a frase com comandos configurados.
- Ao casar (exato ou fuzzy) envia a notificação configurada (ex: `SENSORDATA_EXPORT`).

## Requisitos

- Python 3.11+ (testado 3.12)
- Pacotes: `vosk`, `sounddevice`, `websockets` (este último reservado para futura evolução)
- Modelo Vosk PT em `models/vosk-pt-small` (coloque dentro da raiz MagicMirror ou ajuste argumento `--model`).

### Estrutura do modelo Vosk

Alguns tutoriais mais antigos mostram subpastas `am/`, `graph/`, `conf/`. Modelos mais novos (ou convertidos) podem conter apenas arquivos no topo + uma pasta `ivector/`, por exemplo:

```text
final.mdl
Gr.fst
HCLr.fst
mfcc.conf
phones.txt
word_boundary.int
README
ivector/ (final.dubm, final.ie, final.mat, splice.conf, online_cmvn.conf, global_cmvn.stats)
```

Essa estrutura é perfeitamente válida. O script aceita qualquer diretório raiz que contenha pelo menos `final.mdl` e `mfcc.conf` (ou arquivos principais equivalentes). Se você não tiver as pastas `am`/`graph`, não é erro — apenas um layout diferente do pacote.

Caso o zip tenha criado um nível extra (ex: `models/vosk-pt-small/vosk-model-small-pt-0.3/...`), você pode:

1. Mover o conteúdo interno para `models/vosk-pt-small`, ou
2. Passar `--model` apontando diretamente para a subpasta correta.

O script tenta detectar automaticamente um diretório adequado se o caminho padrão não existir.

## Instalação de Dependências Python

Dentro da raiz do projeto (onde está o `package.json` principal) crie um venv e instale:

```powershell
python -m venv .venv
./.venv/Scripts/Activate.ps1
pip install vosk sounddevice websockets
```

## Execução do Servidor de Voz

Em uma janela separada:

```powershell
./.venv/Scripts/python.exe modules/MMM-VoiceBridge/voice_server.py --model models/vosk-pt-small
```

Se o modelo não existir, baixe um pacote Vosk PT (small) e extraia para `models/vosk-pt-small`.

Logs:

- `RECO:frase reconhecida` no stdout
- Arquivo atualizado: `modules/MMM-VoiceBridge/voice_cmd.txt`

## Configuração do Módulo

Exemplo em `config.js`:

```js
{
  module: 'MMM-VoiceBridge',
  position: 'bottom_left',
  config: {
    hotword: 'espelho',
    stripHotword: true,
    fuzzy: true,
    fuzzyThreshold: 0.78,
    commands: {
      'exportar dados': { notification: 'SENSORDATA_EXPORT' },
      'atualizar sensores': { notification: 'SENSORDATA_REFRESH_HISTORY' },
      'mostrar resumo': { notification: 'SENSORDATA_COMMAND', payload: { action: 'summary' } }
    }
  }
}
```

## Funcionamento do Matching

1. Se `hotword` definida, frase precisa começar por ela.
2. Remove hotword se `stripHotword`.
3. Tenta match exato nos comandos.
4. Se não encontrou e `fuzzy` habilitado, calcula similaridade (Levenshtein) e aceita se >= `fuzzyThreshold`.

## Evoluções Futuras

- Substituir polling por WebSocket.
- Feedback visual (último comando reconhecido).
- Suporte a vários idiomas/modelos dinâmicos.

## Troubleshooting

- Sem reconhecimento: verifique permissões de microfone no Windows para Python.
- Latência alta: reduza `sample_rate` ou teste outro modelo (small vs large).
- Arquivo não muda: confirme caminho relativo e se script Python realmente escreve `voice_cmd.txt`.
