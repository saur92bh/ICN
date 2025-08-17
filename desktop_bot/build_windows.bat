@echo off
setlocal

REM Create venv and install deps
python -m venv .venv
call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install certifi

REM Build windowed executable with common hidden imports
pyinstaller --noconfirm --clean --windowed --name "CryptoTradingBot2025" ^
  --hidden-import=requests ^
  --hidden-import=urllib3 ^
  --hidden-import=certifi ^
  main.py

echo.
echo Build complete. If successful, run: dist\CryptoTradingBot2025\CryptoTradingBot2025.exe
echo Log file will be at: dist\CryptoTradingBot2025\bot.log
echo.
pause