@echo off
echo ========================================
echo   NGROK - Tunel HTTPS para MagicMirror
echo ========================================
echo.
echo Este script cria um tunel HTTPS publico para o MagicMirror
echo.
echo IMPORTANTE:
echo 1. Baixe ngrok em: https://ngrok.com/download
echo 2. Extraia o arquivo ngrok.exe nesta pasta
echo 3. Execute este script
echo.
pause

if not exist ngrok.exe (
    echo.
    echo [ERRO] ngrok.exe nao encontrado!
    echo.
    echo Baixe em: https://ngrok.com/download
    echo Extraia aqui: %cd%
    echo.
    pause
    exit /b 1
)

echo.
echo Iniciando tunel HTTPS na porta 8080...
echo.
echo Aguarde a URL aparecer (algo como: https://abc123.ngrok-free.app)
echo.
echo DEIXE ESTA JANELA ABERTA enquanto estiver usando!
echo.

ngrok.exe http 8080

pause
