@echo off
setlocal ENABLEEXTENSIONS
set "MM_ROOT=C:\Projetos\DumbMirror\MagicMirror-master-Original"
set "MM_COMMAND=npm run start:windows"

echo [mirror] Preparando ambiente em "%MM_ROOT%"
if not exist "%MM_ROOT%\package.json" (
  echo [ERRO] Nao encontrei package.json em %MM_ROOT%.
  echo        Ajuste a variavel MM_ROOT dentro deste arquivo.
  pause
  exit /b 1
)

pushd "%MM_ROOT%" >nul
if errorlevel 1 (
  echo [ERRO] Nao foi possivel acessar %MM_ROOT%.
  pause
  exit /b 1
)

echo [mirror] Rodando %MM_COMMAND%
call %MM_COMMAND%
popd >nul
