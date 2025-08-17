# Crypto Trading Workspace

This repo contains:

- `app/`: React web UI (Vite + TS)
- `server/`: Node/Express API for exchange orders (ccxt)
- `desktop_bot/`: Tkinter desktop app with real-time data and charts

## Web UI + API (existing)

- API: `cd server && npm install && npm run dev`
- Web: `cd app && npm install && npm run dev`
- Open `http://localhost:5173`

## Desktop App (new)

Run without building:

```bash
cd desktop_bot
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export CMC_API_KEY=your_key_optional
python main.py
```

Build executable (Linux):

```bash
cd desktop_bot
chmod +x build_linux.sh
./build_linux.sh
```

Build executable (Windows):

```bat
cd desktop_bot
build_windows.bat
```

The app uses CoinMarketCap when an API key is provided, otherwise falls back to CoinGecko/Binance, and can run in Demo mode.
