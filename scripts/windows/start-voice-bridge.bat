@echo off
setlocal ENABLEEXTENSIONS

rem Tenta descobrir a raiz do repo a partir desta pasta scripts\windows
for %%I in ("%~dp0..\..") do set "REPO_ROOT=%%~fI"
set "MM_ROOT=%REPO_ROOT%\MagicMirror-master-Original"
set "VOICE_SERVER=%MM_ROOT%\modules\MMM-VoiceBridge\voice_server.py"
set "MODEL_PATH=models/vosk-pt-small"

if not exist "%VOICE_SERVER%" (
  echo [ERRO] Nao encontrei "%VOICE_SERVER%".
  echo        Confirme se o repositorio foi clonado corretamente.
  pause
  exit /b 1
)

set "PYTHON_EXE=%REPO_ROOT%\.venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" (
  set "PYTHON_EXE=%MM_ROOT%\.venv\Scripts\python.exe"
)

if not exist "%PYTHON_EXE%" (
  echo [ERRO] Nao encontrei python.exe em um ambiente virtual.
  echo        Crie o venv com "python -m venv .venv" e instale vosk, sounddevice e websockets.
  pause
  exit /b 1
)

pushd "%MM_ROOT%" >nul
if errorlevel 1 (
  echo [ERRO] Nao consegui acessar %MM_ROOT%.
  pause
  exit /b 1
)

echo [voice] Usando Python: %PYTHON_EXE%
echo [voice] Script  : %VOICE_SERVER%
echo [voice] Modelo  : %MODEL_PATH%
if not exist "%MM_ROOT%\%MODEL_PATH%" (
  echo [AVISO] Pasta do modelo nao encontrada, o script Python tentara auto detectar em ./models.
)

echo [voice] Iniciando bridge de voz (Ctrl+C para sair)...
"%PYTHON_EXE%" "%VOICE_SERVER%" --model "%MODEL_PATH%"
set "ERR=%ERRORLEVEL%"

popd >nul

if not "%ERR%"=="0" (
  echo [voice] O processo encerrou com codigo %ERR%.
) else (
  echo [voice] Bridge finalizada normalmente.
)

pause
exit /b %ERR%
