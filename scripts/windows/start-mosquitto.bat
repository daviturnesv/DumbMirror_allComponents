@echo off
setlocal ENABLEEXTENSIONS
set "MOSQUITTO_EXE=C:\Program Files\mosquitto\mosquitto.exe"
set "MOSQUITTO_CONF=C:\Program Files\mosquitto\mosquitto.conf"

echo [mosquitto] Encerrando instâncias anteriores...
taskkill /IM mosquitto.exe /F >nul 2>&1

if not exist "%MOSQUITTO_EXE%" (
  echo [ERRO] Nao encontrei %%MOSQUITTO_EXE%%. Edite este .bat com o caminho correto.
  pause
  exit /b 1
)

if not exist "%MOSQUITTO_CONF%" (
  echo [ERRO] Nao encontrei %%MOSQUITTO_CONF%%. Edite este .bat com o caminho correto.
  pause
  exit /b 1
)

echo [mosquitto] Iniciando broker usando "%MOSQUITTO_CONF%"
echo [mosquitto] Feche esta janela ou pressione Ctrl+C para desligar.
"%MOSQUITTO_EXE%" -c "%MOSQUITTO_CONF%" -v
