@echo off

curl -L -o python-installer.exe https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe

python-installer.exe /quiet InstallAllUsers=1 PrependPath=1

curl -L -o node.msi https://nodejs.org/dist/v20.20.2/node-v20.20.2-x64.msi
msiexec /i node.msi /quiet /norestart

npm install whatsapp-web.js qrcode-terminal

echo inicializando o chatbot...
timeout /t 2

node chatbot.js
    
pause