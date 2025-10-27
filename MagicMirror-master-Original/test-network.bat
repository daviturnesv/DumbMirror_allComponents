@echo off
echo ========================================
echo   TESTE DE CONECTIVIDADE - MagicMirror
echo ========================================
echo.

echo [1/4] Verificando se porta 8080 esta LISTENING...
netstat -ano | findstr ":8080" | findstr "LISTENING"
if %ERRORLEVEL% EQU 0 (
    echo [OK] Porta 8080 esta escutando!
) else (
    echo [ERRO] Porta 8080 NAO esta escutando!
    pause
    exit /b 1
)
echo.

echo [2/4] Verificando IP da rede local...
ipconfig | findstr "IPv4"
echo.

echo [3/4] Testando acesso local (localhost)...
curl -I -s -o nul -w "Status: %%{http_code}\n" http://localhost:8080/remote.html
echo.

echo [4/4] Testando acesso via IP da rede (192.168.238.183)...
curl -I -s -o nul -w "Status: %%{http_code}\n" http://192.168.238.183:8080/remote.html
echo.

echo ========================================
echo   REGRAS DE FIREWALL
echo ========================================
echo Verificando se existe regra para porta 8080...
netsh advfirewall firewall show rule name=all | findstr "8080"
echo.

echo ========================================
echo   TESTE NO CELULAR
echo ========================================
echo.
echo Acesse no celular:
echo   http://192.168.238.183:8080/modules/MMM-Remote-Control/remote.html
echo.
echo Se NAO funcionar:
echo   1. Libere o Firewall (execute como Administrador):
echo      netsh advfirewall firewall add rule name="MagicMirror" dir=in action=allow protocol=TCP localport=8080
echo.
echo   2. Verifique se celular esta no mesmo WiFi que o PC
echo.
pause
