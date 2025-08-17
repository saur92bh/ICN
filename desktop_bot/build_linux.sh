#!/usr/bin/env bash
set -euo pipefail

python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install certifi

pyinstaller --noconfirm --clean --windowed --name "CryptoTradingBot2025" \
  --hidden-import=requests \
  --hidden-import=urllib3 \
  --hidden-import=certifi \
  main.py

echo "Build complete. Run ./dist/CryptoTradingBot2025/CryptoTradingBot2025"
echo "Log file will be at ./dist/CryptoTradingBot2025/bot.log"