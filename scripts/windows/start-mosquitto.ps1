param(
    [string]$MosquittoExe = "C:\Program Files\mosquitto\mosquitto.exe",
    [string]$ConfigFile = "C:\Program Files\mosquitto\mosquitto.conf"
)

function Fail($message) {
    Write-Error $message
    exit 1
}

if (-not (Test-Path $MosquittoExe)) {
    Fail "Mosquitto não encontrado em '$MosquittoExe'. Ajuste o parâmetro -MosquittoExe."
}

if (-not (Test-Path $ConfigFile)) {
    Fail "Arquivo de configuração não encontrado em '$ConfigFile'. Ajuste o parâmetro -ConfigFile."
}

Write-Host "[mosquitto] Finalizando instâncias anteriores..."
Get-Process -Name mosquitto -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "[mosquitto] Iniciando broker usando $ConfigFile"
Write-Host "[mosquitto] Use Ctrl+C nesta janela para desligar"

& $MosquittoExe -c $ConfigFile -v
