@echo off 
echo Você tem certeza que deseja limpar os dados do QR Code? (S/N)
set /p resposta=
if /i "%resposta%"=="S" (
    del /s /q .wwebjs_auth
    del /s /q .wwebjs_cache
    echo Dados do QR Code limpos com sucesso.
) else (
    echo Operação cancelada. Os dados do QR Code não foram limpos.
    exit 
)
