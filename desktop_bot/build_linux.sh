#!/usr/bin/env bash
set -euo pipefail

python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

pyinstaller --noconfirm --clean --windowed --name "CryptoTradingBot2025" main.py

echo "Build complete. Run ./dist/CryptoTradingBot2025/CryptoTradingBot2025"