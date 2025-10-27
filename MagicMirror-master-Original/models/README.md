# 🎤 Modelos de Reconhecimento de Voz

Esta pasta contém os modelos de reconhecimento de voz para o **MMM-VoiceBridge**.

## 📥 Download do Modelo PT-BR

### Modelo Recomendado: `vosk-model-small-pt-0.3`

1. **Baixe** o modelo em: https://alphacephei.com/vosk/models
   - Link direto: https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip
   - Tamanho: ~40 MB

2. **Extraia** o arquivo ZIP

3. **Renomeie** a pasta extraída para `vosk-pt-small`

4. **Mova** para esta pasta (`models/`)

## 📁 Estrutura esperada:

```
models/
  └── vosk-pt-small/
      ├── am/
      ├── conf/
      ├── graph/
      ├── ivector/
      ├── README
      └── ... (outros arquivos do modelo)
```

## ✅ Verificação:

Após extrair, execute o detector de modelos:
```bash
cd d:\Projetos\DumbMirror\MagicMirror-master-Original
node modules/MMM-VoiceBridge/check_model.js
```

Ou tente iniciar o servidor de voz:
```bash
.venv\Scripts\python.exe modules\MMM-VoiceBridge\voice_server.py --model models\vosk-pt-small --rate 16000
```

Se aparecer `Carregando modelo: ...`, está correto! ✅

## 🌐 Outros modelos disponíveis:

### Português:
- **vosk-model-small-pt-0.3** (40 MB) - Recomendado ⭐
- **vosk-model-pt-fb-v0.1.1-20220516_2113** (1.6 GB) - Alta precisão

### Outros idiomas:
- Inglês: vosk-model-small-en-us-0.15
- Espanhol: vosk-model-small-es-0.42
- Francês: vosk-model-small-fr-0.22
- Alemão: vosk-model-small-de-0.15

Veja todos em: https://alphacephei.com/vosk/models

## ⚙️ Configuração:

No `config.js`, ajuste o caminho se necessário:
```javascript
{
    module: "MMM-VoiceBridge",
    config: {
        modelPath: "models/vosk-pt-small",
        sampleRate: 16000
    }
}
```

## 🚫 Por que não está no Git?

Modelos de ML são arquivos binários grandes (~40-1600 MB) que:
- Tornam o repositório pesado
- Aumentam muito o tempo de clone
- Não devem ser versionados no Git

Por isso, baixe separadamente! 📦

---

**Última atualização:** Outubro 2025
