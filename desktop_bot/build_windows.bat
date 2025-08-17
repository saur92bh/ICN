@echo off
setlocal

REM Create venv and install deps
python -m venv .venv
call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install certifi requests[security]

REM Build windowed executable with common hidden imports
pyinstaller --noconfirm --clean --windowed --name "CryptoTradingBot2025" ^
  --hidden-import=requests ^
  --hidden-import=requests.packages.urllib3 ^
  --hidden-import=urllib3 ^
  --hidden-import=certifi ^
  main.py

REM Copy requests cert bundle if available
for /f "delims=" %%i in ('python -c "import os,requests;import inspect;import requests.certs as c;print(os.path.dirname(inspect.getfile(requests)))"') do set REQ_DIR=%%i
if exist "%REQ_DIR%\cacert.pem" copy /Y "%REQ_DIR%\cacert.pem" "dist\CryptoTradingBot2025\cacert.pem" >nul 2>&1

echo.
echo Build complete. If successful, run: dist\CryptoTradingBot2025\CryptoTradingBot2025.exe
echo Log file will be at: dist\CryptoTradingBot2025\bot.log
echo.
pause