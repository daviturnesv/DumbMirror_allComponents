@echo off
sc.exe config Mosquitto binPath= "\"C:\Program Files\mosquitto\mosquitto.exe\" -c \"C:\Program Files\mosquitto\mosquitto.conf\""
if errorlevel 1 (
  echo [ERRO] Nao foi possivel atualizar o binPath.
  pause
  exit /b 1
) else (
  echo [OK] binPath atualizado. Execute "sc.exe qc Mosquitto" para confirmar.
)
