<#
.SYNOPSIS
    Automatiza a preparação de um PC Windows para rodar o espelho DumbMirror.

.DESCRIPTION
    Instala ou valida dependências (winget, nvm, Node.js 22.14, Git, Visual Studio Build Tools, Python),
    executa `npm install` nos componentes principais, monta um venv para o bridge de voz, cria um `.env` de
    placeholders e registra o status inicial do setup no diretório `Andamento/`.

.NOTES
    Execute como Administrador. O script detecta se o `winget` está disponível e emite avisos caso falte algum recurso.
#>

[CmdletBinding()]
param(
    [string]
    $NodeVersion = "22.14.0",

    [switch]
    $SkipWinget
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Text) {
    Write-Host "[setup] $Text"
}

function Confirm-AdminElevation {
    $current = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($current)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Este script precisa ser executado como administrador."
    }
        Write-Step 'Iniciando setup do DumbMirror (setup-dumbmirror-windows.ps1) ...'
}

function Install-WithWinget([string]$PackageId, [string]$DisplayName) {
    if ($SkipWinget) {
        Write-Step "Pulando instalação do $DisplayName porque -SkipWinget foi usado."
        return
    }

    if (-not $wingetAvailable) {
        Write-Step "winget não disponível; não foi possível instalar $DisplayName automaticamente."
        return
    }

    Write-Step "Consultando winget para ver se $DisplayName já existe..."
    $already = & winget list --id $PackageId 2>$null | Select-String -Quiet $PackageId
    if ($already) {
        Write-Step "$DisplayName já instalado."
        return
    }

    $wingetArgs = "install -e --id $PackageId --accept-source-agreements --accept-package-agreements"
    Write-Step "Instalando $DisplayName via winget..."
    try {
        $proc = Start-Process -FilePath "winget" -ArgumentList $wingetArgs -NoNewWindow -Wait -PassThru
        if ($proc.ExitCode -eq 0) {
            Write-Step "$DisplayName instalado (ou já instalado)."
        } else {
            Write-Warning "winget retornou código $($proc.ExitCode) para $DisplayName. Execute manualmente se necessário."
        }
    } catch {
        Write-Warning "Falha ao instalar $DisplayName via winget: $_"
    }
}

function Initialize-NvmSettings([string]$Root, [string]$Symlink) {
    $settingsPath = Join-Path $Root 'settings.txt'
    if (-not (Test-Path $settingsPath)) {
        $content = @'
root: {0}
path: {1}
arch: 64
proxy: 
'@ -f $Root, $Symlink
        $content | Out-File -FilePath $settingsPath -Encoding ASCII
        Write-Step "settings.txt criado em $settingsPath."
    } else {
        Write-Step "settings.txt já existe em $settingsPath."
    }
}

function Get-NvmExe {
    $candidates = @(
        "$env:ProgramFiles\nvm\nvm.exe",
        "$env:ProgramFiles(x86)\nvm\nvm.exe",
        "$env:localappdata\nvm\nvm.exe"
    )
    return $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

function Invoke-NpmInstall([string]$TargetDir, [string[]]$Arguments) {
    $pkg = Join-Path $TargetDir 'package.json'
    if (-not (Test-Path $pkg)) {
        Write-Step "Pulando $TargetDir (sem package.json)."
        return
    }

    Write-Step "npm install em $TargetDir"
    Push-Location $TargetDir
    try {
        $npmArgs = @('install')
        if ($Arguments) {
            $npmArgs += $Arguments
        }
        & npm @npmArgs
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            Write-Warning ("npm install retornou código {0} em {1}. Veja o log acima." -f $exitCode, $TargetDir)
        } else {
            Write-Step "npm install concluído em $TargetDir"
        }
        return $exitCode
    } catch {
        Write-Warning ("npm install falhou em {0}: {1}" -f $TargetDir, $_)
    } finally {
        Pop-Location
    }
}

function Initialize-MmmRemoteControlConfig([string]$TargetDir) {
    $template = Join-Path $TargetDir 'modules.json.template'
    $destination = Join-Path $TargetDir 'modules.json'
    if (-not (Test-Path $template)) {
        Write-Warning "MMM-Remote-Control: modules.json.template não encontrado em $TargetDir."
        return
    }

    try {
        Copy-Item -Path $template -Destination $destination -Force
        Write-Step "MMM-Remote-Control: modules.json foi gerado a partir do template."
    } catch {
        $msg = "Não foi possível copiar modules.json.template em {0}: {1}" -f $TargetDir, $_
        Write-Warning $msg
    }
}

function Resolve-PythonPath {
    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd -and (Test-Path $pythonCmd.Source)) {
        return $pythonCmd.Source
    }

    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        foreach ($version in @('3.11', '3.10', '3.12')) {
            try {
                $path = & $pyLauncher.Source -$version -c "import sys; print(sys.executable)" 2>$null
                if ($path) {
                    $candidate = $path.Trim()
                    if (Test-Path $candidate) {
                        return $candidate
                    }
                }
            } catch {
                continue
            }
        }
    }

    return $null
}

function New-EnvTemplate([string]$Path) {
    if (Test-Path $Path) {
        Write-Step "Arquivo .env já existe em $Path."
        return
    }

    $template = @'
# Valores de exemplo. Substitua por credenciais reais antes de iniciar o espelho.
MIRROR_NAME=DumbMirror
MIRROR_PORT=8080
MIRROR_IP=127.0.0.1

RELAY_BASE_URL=https://relay.dumbmirror.example
RELAY_MIRROR_ID=exemplo
RELAY_MIRROR_SECRET=troque-esse-secret

DB_TYPE=sqlite
DB_PATH=data/sensordata.db

MM_LAT=-23.5505
MM_LON=-46.6333
MM_LANGUAGE=pt-BR
MM_LOCALE=pt-BR
OPENWEATHER_API_KEY=troque-esse-token

OPENAI_API_KEY=troque-esse-token
GEMINI_API_KEY=troque-esse-token
HUGGINGFACE_API_TOKEN=troque-esse-token

ONSPOTIFY_CLIENT_ID=troque-esse-token
ONSPOTIFY_CLIENT_SECRET=troque-esse-token
LIVELYRICS_GENIUS_TOKEN=troque-esse-token

EXPORT_CSV=false
'@

    $template | Out-File -FilePath $Path -Encoding UTF8
    Write-Step ".env de placeholders criado em $Path."
}

function Write-Andamento([string]$Content) {
    $timestamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
    $path = Join-Path $andamentoDir "$timestamp.md"
    $Content | Out-File -FilePath $path -Encoding UTF8
    Write-Step "Registro criado em Andamento/$(Split-Path -Leaf $path)."
}

Confirm-AdminElevation

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$workspaceRoot = Resolve-Path $scriptDir
$magicMirrorDir = Join-Path $workspaceRoot 'MagicMirror-master-Original'

if (-not (Test-Path $magicMirrorDir)) {
    throw "Não localizei a pasta MagicMirror-master-Original em $workspaceRoot."
}

$andamentoDir = Join-Path $workspaceRoot 'Andamento'
if (-not (Test-Path $andamentoDir)) {
    New-Item -ItemType Directory -Path $andamentoDir | Out-Null
}

$wingetAvailable = $false
if (Get-Command winget -ErrorAction SilentlyContinue) {
    $wingetAvailable = $true
    Write-Step 'winget foi localizado e será usado para instalar pacotes.'
} else {
    Write-Step 'winget não encontrado; o script continuará, mas você precisará instalar dependências manualmente ou usar -SkipWinget para ignorar.'
}

Install-WithWinget -PackageId 'CoreyButler.NVMforWindows' -DisplayName 'nvm for Windows'
Install-WithWinget -PackageId 'Git.Git' -DisplayName 'Git'
Install-WithWinget -PackageId 'Microsoft.VisualStudio.2022.BuildTools' -DisplayName 'Visual Studio Build Tools'
Install-WithWinget -PackageId 'Python.Python.311' -DisplayName 'Python 3.11'
Install-WithWinget -PackageId 'EclipseFoundation.Mosquitto' -DisplayName 'Mosquitto (opcional)'

$nvmExe = Get-NvmExe
if (-not $nvmExe) {
    throw 'nvm.exe não encontrado; verifique se a instalação via winget concluiu ou instale manualmente.'
}

$nvmRoot = Split-Path -Parent $nvmExe
Write-Step "Usando nvm localizado em $nvmExe"
$env:NVM_HOME = $nvmRoot
$nvmSymlink = 'C:\Program Files\nodejs'
$existingSymlink = Get-Item -LiteralPath $nvmSymlink -ErrorAction SilentlyContinue
if ($existingSymlink) {
    $isJunction = ($existingSymlink.Attributes -band [IO.FileAttributes]::ReparsePoint)
    if (-not $isJunction) {
        $backup = "${nvmSymlink}-pre-nvm-$(Get-Date -Format 'yyyyMMddHHmmss')"
        try {
            Move-Item -Path $nvmSymlink -Destination $backup -Force
            Write-Step "Pasta antiga em $nvmSymlink movida para $backup para liberar o NVM_SYMLINK."
        } catch {
            throw "Não foi possível mover $nvmSymlink. Feche terminais que o estejam usando ou especifique outro diretório para o NVM. Detalhes: $_"
        }
    } else {
        Write-Step "$nvmSymlink já é um junction; reutilizando para o nvm."
    }
}
if (Test-Path $nvmSymlink) {
    # nvm precisa que o caminho não exista para criar o junction
    try {
        Remove-Item -LiteralPath $nvmSymlink -Force
    } catch {
        Write-Warning "Não consegui remover $nvmSymlink; o nvm pode reclamar novamente. Detalhes: $_"
    }
}
$env:NVM_SYMLINK = $nvmSymlink
try {
    setx NVM_HOME $nvmRoot | Out-Null
    setx NVM_SYMLINK $nvmSymlink | Out-Null
    Write-Step 'NVM_HOME/NVM_SYMLINK persistidos nas variáveis de usuário.'
} catch {
    Write-Warning "Não foi possível persistir as variáveis NVM_HOME/NVM_SYMLINK. Continue mesmo assim ou ajuste manualmente em Sistema. Detalhes: $_"
}
Initialize-NvmSettings -Root $nvmRoot -Symlink $nvmSymlink
$env:Path = "$nvmRoot;$nvmSymlink;$env:Path"

Write-Step "Instalando/selecionando Node $NodeVersion com nvm..."

& $nvmExe install $NodeVersion
& $nvmExe use $NodeVersion

try {
    $current = & $nvmExe current
    Write-Step "nvm current: $current"
} catch {
    Write-Warning "Não foi possível obter a versão atual do nvm: $_"
}

$nodejsDir = Join-Path $nvmRoot 'nodejs'
if (Test-Path $nodejsDir) {
    $env:Path = "$nodejsDir;$env:Path"
}

npm --version
Write-Step 'Preparando npm install do core e dos módulos.'

Invoke-NpmInstall -TargetDir $magicMirrorDir

$moduleDirs = @(
    'MMM-WinVoice',
    'MMM-WinVoice2',
    'MMM-SensorControl',
    'MMM-SensorData',
    'MMM-RemoteRelay',
    'MMM-Screencast',
    'MMM-LiveLyrics',
    'MMM-OnSpotify',
    'MMM-Remote-Control'
)

foreach ($module in $moduleDirs) {
    $dir = Join-Path $magicMirrorDir "modules\$module"
    if (Test-Path $dir) {
        if ($module -eq 'MMM-Remote-Control') {
            Invoke-NpmInstall -TargetDir $dir -Arguments @('--ignore-scripts') | Out-Null
            Initialize-MmmRemoteControlConfig -TargetDir $dir
        } else {
            Invoke-NpmInstall -TargetDir $dir | Out-Null
        }
    }
}

$spotifyWebDir = Join-Path $magicMirrorDir 'modules\MMM-OnSpotify\web'
Invoke-NpmInstall -TargetDir $spotifyWebDir

$mqttDir = Join-Path $workspaceRoot 'mqtt_external'
if (Test-Path $mqttDir) {
    Invoke-NpmInstall -TargetDir $mqttDir
}

$mmvoiceDir = Join-Path $workspaceRoot 'mmvoice_stage'
if (Test-Path $mmvoiceDir) {
    Invoke-NpmInstall -TargetDir $mmvoiceDir
}

$venvDir = Join-Path $magicMirrorDir '.venv'
$pythonExe = Resolve-PythonPath
if (-not $pythonExe) {
    throw 'Python não encontrado no PATH. Instale Python 3.11 ou ajuste manualmente o caminho.'
}
Write-Step "Usando Python em $pythonExe para o ambiente virtual."
if (-not (Test-Path (Join-Path $venvDir 'Scripts\python.exe'))) {
    Write-Step "Criando virtualenv em $venvDir"
    & $pythonExe -m venv $venvDir
}

$venvPython = Join-Path $venvDir 'Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
    throw "Não foi possível criar o virtualenv em $venvDir (python.exe não localizado)."
}
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install vosk sounddevice websockets
Write-Step 'Dependências Python (vosk, sounddevice, websockets) instaladas no ambiente virtual.'

New-EnvTemplate -Path (Join-Path $magicMirrorDir '.env')
Write-Step '.env de placeholders criado/confirmado.'

$body = @"
## setup-dumbmirror-windows.ps1
- Instalou/validou winget, nvm, Node.js 22.14, Git, Python 3.11 e Build Tools.
- Executou `npm install` no core, módulos personalizados e pastas auxiliares.
- Criou ambiente Python `.venv` e instalou vosk + sounddevice + websockets.
- Criou `.env` com valores de exemplo para fácil substituição posterior.
- Capturou eventuais códigos de saída do `winget`; instale os pacotes que falharem manualmente.
- Garantiu `NVM_HOME/NVM_SYMLINK` e `settings.txt`, então o `nvm install` deve funcionar mesmo antes de reiniciar o prompt.
- Se a pasta `C:\Program Files\nodejs` já existia, ela é salva com timestamp e recriada como junction do nvm.
- Contornou o postinstall do MMM-Remote-Control (gera `modules.json` via PowerShell em vez de depender de `cp`).
- Resolve automaticamente o caminho do Python antes de criar o `.venv`.
"@

Write-Andamento -Content $body
Write-Step 'Registro em Andamento escrito com o resumo das ações realizadas.'

Write-Step 'Automação concluída. Revise o output para confirmar eventuais erros e preencha tokens reais no .env.'