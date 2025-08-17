@echo off
setlocal

REM Create venv and install deps
python -m venv .venv
call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt

REM Build windowed executable
pyinstaller --noconfirm --clean --windowed --name "CryptoTradingBot2025" main.py

echo.
echo Build complete. If successful, run: dist\CryptoTradingBot2025\CryptoTradingBot2025.exe
echo.
pause