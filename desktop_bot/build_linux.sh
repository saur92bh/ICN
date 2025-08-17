#!/usr/bin/env bash
set -euo pipefail

python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install certifi 'requests[security]'

pyinstaller --noconfirm --clean --windowed --name "CryptoTradingBot2025" \
  --hidden-import=requests \
  --hidden-import=requests.packages.urllib3 \
  --hidden-import=urllib3 \
  --hidden-import=certifi \
  main.py

REQ_DIR=$(python - << 'PY'
import os, requests, inspect
print(os.path.dirname(inspect.getfile(requests)))
PY
)
if [ -f "$REQ_DIR/cacert.pem" ]; then
  cp "$REQ_DIR/cacert.pem" "dist/CryptoTradingBot2025/cacert.pem" || true
fi

echo "Build complete. Run ./dist/CryptoTradingBot2025/CryptoTradingBot2025"
echo "Log file will be at ./dist/CryptoTradingBot2025/bot.log"