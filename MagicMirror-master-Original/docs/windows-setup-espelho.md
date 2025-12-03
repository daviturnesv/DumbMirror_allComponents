# Guia de configuração do DumbMirror no Windows

## Visão geral
Este guia documenta como preparar um PC Windows recém-formatado para executar o espelho DumbMirror. Ele cobre a instalação dos requisitos do sistema, configuração do MagicMirror, módulos personalizados, pastas auxiliares (`mqtt_external`, `mmvoice_stage`) e serviços de suporte.

## Checklist rápido
- Node.js 22.14 ou superior e Git instalados
- Visual Studio Build Tools (Desktop development with C++) para compilar dependências nativas
- Python 3.11+ com `pip` para o bridge de voz
- Broker MQTT disponível (Mosquitto local ou URL remota)
- Modelo Vosk PT extraído em `MagicMirror-master-Original/models/vosk-pt-small`
- Arquivo `.env` preenchido com credenciais (Relay, APIs, Spotify, Genius etc.)

## 1. Preparação do ambiente Windows
### 1.1 Softwares obrigatórios
1. **Node.js 22.14+** – recomendado instalar via `nvm-windows` para facilitar upgrades:
   ```powershell
   winget install CoreyButler.NVMforWindows
   nvm install 22.14.0
   nvm use 22.14.0
   ```
2. **Git**:
   ```powershell
   winget install Git.Git
   ```
3. **Visual Studio Build Tools** – selecione o workload *Desktop development with C++* (inclui MSVC, Windows SDK e CMake). Necessário para `better-sqlite3` e outras dependências nativas.
4. **Python 3.11 ou 3.12** – instale com a opção “Add to PATH” marcada.

### 1.2 Softwares opcionais
- **Mosquitto** (broker MQTT local):
  ```powershell
  winget install EclipseFoundation.Mosquitto
  ```
  Inicie e configure o serviço para inicializar com o sistema, ou ajuste `mqttServer` no `config.js` para outro broker.
- **7-Zip** ou similar para extrair o modelo Vosk.

## 2. Clonar o repositório
```powershell
cd C:\
mkdir DumbMirror
cd DumbMirror
git clone https://github.com/daviturnesv/DumbMirror_allComponents.git
cd DumbMirror_allComponents
git submodule update --init --recursive
```
> O submódulo `relay-server/` não precisa rodar dentro do espelho, mas mantenha-o atualizado para testes locais.

## 3. Estrutura relevante
```
MagicMirror-master-Original/
  config/                  ← configurações do MagicMirror
  data/                    ← banco `sensordata.db` + exports CSV
  models/vosk-pt-small/    ← modelo Vosk PT para voz
  modules/                 ← módulos customizados (Relay, Sensores, Spotify, Voz etc.)
mqtt_external/             ← scripts Node auxiliares relacionados a MQTT
mmvoice_stage/             ← workspace Node para protótipos de voz
```
Se estiver migrando, copie também `data/` e quaisquer scripts locais de `mqtt_external/` ou `mmvoice_stage/`.

## 4. Configurar o `.env`
Copie `MagicMirror-master-Original/.env` do ambiente antigo ou crie um novo. Principais variáveis:

| Variável | Finalidade |
|----------|------------|
| `MIRROR_NAME`, `MIRROR_PORT`, `MIRROR_IP` | Identidade e porta HTTP do MagicMirror |
| `RELAY_BASE_URL`, `RELAY_MIRROR_ID`, `RELAY_MIRROR_SECRET` | Credenciais para conectar ao relay DumbMirror |
| `DB_TYPE`, `DB_PATH` | Persistência do módulo de sensores (SQLite) |
| `EXPORT_*` | Controle de exportação CSV de sensores |
| `GEMINI_API_KEY`, `OPENAI_API_KEY`, `HUGGINGFACE_*` | Provedores utilizados por `MMM-AIManager`/resumos |
| `MM_LAT`, `MM_LON`, `MM_LANGUAGE`, `MM_LOCALE`, `OPENWEATHER_API_KEY` | Localização e clima |
| `ONSPOTIFY_*`, `LIVELYRICS_GENIUS_TOKEN` | Integração com Spotify e letras |

Mantenha este arquivo fora do versionamento e atualize tokens quando necessário.

## 5. Instalar dependências Node.js
### 5.1 Núcleo do MagicMirror
```powershell
cd MagicMirror-master-Original
npm install
```

### 5.2 Módulos personalizados
Execute os comandos abaixo em cada pasta (quando existir `package.json`):

| Diretório | Comando |
|-----------|---------|
| `modules/MMM-SensorData` | `npm install` (instala `mqtt` e tenta `better-sqlite3`; requer Build Tools) |
| `modules/MMM-RemoteRelay` | `npm install` |
| `modules/MMM-Remote-Control` | `npm install --omit=dev` (ou completo se quiser ferramentas de lint) |
| `modules/MMM-LiveLyrics` | `npm install` |
| `modules/MMM-Screencast` | `npm install` |
| `modules/MMM-OnSpotify` | `npm install` |
| `modules/MMM-OnSpotify/web` | `npm install` e `npm run build` para gerar os assets do painel |

### 5.3 Pastas auxiliares externas
- `mqtt_external/`: `npm install` garante a dependência `mqtt` para scripts de suporte (simulação de sensores, automações externas).
- `mmvoice_stage/`: mantenha dependências alinhadas ao ambiente original; esta pasta hospeda protótipos/skills que interagem com módulos do espelho.

## 6. Dependências Python para voz (`MMM-VoiceBridge`)
```powershell
cd MagicMirror-master-Original
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install vosk sounddevice websockets
```
Para executar o recognizer:
```powershell
.\.venv\Scripts\python.exe modules/MMM-VoiceBridge/voice_server.py --model models/vosk-pt-small
```
Garanta que o Windows concedeu acesso ao microfone para o Python.

## 7. Baixar e posicionar o modelo Vosk
1. Baixe o modelo *Vosk small Portuguese* em <https://alphacephei.com/vosk/models>.
2. Extraia para `MagicMirror-master-Original/models/vosk-pt-small/`.
3. Verifique se arquivos como `final.mdl` e `mfcc.conf` estão diretamente nessa pasta (sem níveis extras). O script ajusta automaticamente se houver um subdiretório único.

## 8. Serviços auxiliares
- **Broker MQTT:** certifique-se de que o Mosquitto esteja ativo (`services.msc`). Caso use broker remoto, atualize o campo `mqttServer` no `config.js` do `MMM-SensorData`.
- **Scripts externos:** se houver automações em `mqtt_external/` ou `mmvoice_stage/`, configure o Agendador de Tarefas do Windows ou scripts `.bat` para iniciar junto com o espelho.

### 8.1 Mosquitto como serviço Windows
1. **Instale o pacote oficial** com o `winget` indicado na seção 1.2 e execute (uma única vez) `"C:\Program Files\mosquitto\mosquitto.exe" install` em um PowerShell elevado para registrar o serviço.
2. **Configure o arquivo** `C:\Program Files\mosquitto\mosquitto.conf` para permitir conexões remotas e gravar logs (ajuste conforme sua política de segurança):
  ```
  listener 1883 0.0.0.0
  allow_anonymous true
  persistence true
  persistence_location C:/mosquitto/data/
  log_dest file C:/mosquitto/log/mosquitto.log
  log_dest stdout
  log_type all
  connection_messages true
  log_timestamp true
  ```
  > Se preferir autenticação, troque `allow_anonymous true` por `allow_anonymous false` e configure `password_file` e/ou `psk_file`.
3. **Garanta as pastas** de dados e log com permissões de escrita para `LocalSystem` (conta usada pelo serviço):
  ```powershell
  New-Item -ItemType Directory -Force -Path C:\mosquitto\data,C:\mosquitto\log | Out-Null
  icacls C:\mosquitto /grant "NT AUTHORITY\SYSTEM:(OI)(CI)(M)"
  ```
4. **Ajuste o binário usado pelo serviço (corrige o argumento `run` que encerra imediatamente):**
  ```powershell
  sc.exe config Mosquitto binPath= "\"C:\Program Files\mosquitto\mosquitto.exe\" -c \"C:\Program Files\mosquitto\mosquitto.conf\""
  ```
  > Dica: o espaço após `binPath=` é obrigatório e todas as aspas internas precisam estar escapadas com `\"` quando o comando é digitado dentro do PowerShell.
5. **Defina inicialização automática e política de recuperação:**
  ```powershell
  Set-Service -Name Mosquitto -StartupType Automatic
  sc.exe failure Mosquitto reset= 0 actions= restart/60000
  ```
6. **Inicie e valide:**
  ```powershell
  Start-Service -Name Mosquitto
  sc.exe query Mosquitto
  "C:\Windows\System32\netstat.exe" -ano | findstr 1883
  Get-Content C:\mosquitto\log\mosquitto.log -Wait
  & "C:\Program Files\mosquitto\mosquitto.exe" -c "C:\Program Files\mosquitto\mosquitto.conf" -v
  ```
  O status deve aparecer como `RUNNING` e o `netstat` deve listar `0.0.0.0:1883`. Use o `Get-Content -Wait` para acompanhar conexões. Se o serviço parar logo em seguida, consulte o *Event Viewer → Windows Logs → System* e filtre pelo `Source = Service Control Manager` para ver o código de falha.

  > Alternativas manuais: se preferir subir o broker apenas quando necessário, use `scripts/windows/start-mosquitto.ps1` (PowerShell) ou `scripts/windows/start-mosquitto.bat` (duplo clique → Executar como administrador). Ambos encerram instâncias antigas e rodam o `mosquitto.exe -v` com o mesmo `mosquitto.conf`, mantendo o log na tela até você fechar a janela ou apertar `Ctrl+C`.

## 9. Executar o MagicMirror
```powershell
cd MagicMirror-master-Original
npm run start:windows
```
> Alternativa rápida: crie um atalho para `scripts/windows/start-mirror.bat` (Executar como administrador opcional). Ele garante o `cd` para a pasta do MagicMirror e executa `npm run start:windows` automaticamente.
Para apenas o servidor HTTP (sem Electron):
```powershell
npm run server
```
Automatize com `pm2` (já listado em dependências):
```powershell
npx pm2 start npm --name dumbmirror -- run start:windows
npx pm2 save
```
Configure o `pm2` como serviço ou crie uma tarefa agendada para rodar `pm2 resurrect` após o boot.

## 10. Testes pós-instalação
1. Acesse `http://localhost:8080` e confirme que a UI carrega.
2. Verifique logs do console (Electron) para garantir que módulos como `MMM-RemoteRelay` e `MMM-SensorData` estão sem erros.
3. Valide a conexão com o relay (log "auth-success").
4. Publique um payload MQTT de teste e veja se a UI de sensores atualiza e o arquivo `data/sensordata.db` cresce.
5. Rode o bridge de voz e confira se `modules/MMM-VoiceBridge/voice_cmd.txt` recebe transcrições.
6. No app Android, teste as ações de sensores e comandos remotos via relay.

## 11. Troubleshooting
- **Falha ao compilar `better-sqlite3`:** reabra o instalador do Build Tools e garanta que MSVC + Windows SDK estão presentes. Depois rode `npm rebuild better-sqlite3` na pasta `MMM-SensorData`.
- **Janela branca no Electron:** teste `set ELECTRON_ENABLE_GPU=0` antes de `npm run start:windows` ou use `npm run server` com navegador externo.
- **Python sem microfone:** verifique *Configurações → Privacidade → Microfone → Aplicativos de desktop*.
- **Tokens de APIs expirados:** gere novos e atualize o `.env`. Reinicie o MagicMirror para recarregar.
- **Deploy do relay falha por MongoDB TLS:** revise `MONGODB_URI/MONGODB_DB` e garanta que a instância Atlas aceite TLS moderno (`tls=true&authSource=admin`).

## 12. Próximos passos sugeridos
- Automatizar backups do diretório `data/` e do `.env`.
- Monitorar o tamanho do banco de sensores e ajustar parâmetros de downsampling (`MMM-SensorData`).
- Criar scripts de inicialização que iniciem o broker MQTT, o bridge de voz e o MagicMirror sequencialmente.
- Revisar periodicamente logs do Render/relay e do MagicMirror para detectar falhas de conexão.
