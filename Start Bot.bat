@echo off
cd /d "%~dp0"
start "Bot API" /min cmd /c "cd server && npm install && npm run dev"
timeout /t 5 > nul
start "Bot UI" /min cmd /c "cd app && npm install && npm run dev"
timeout /t 5 > nul
start "" http://localhost:5173