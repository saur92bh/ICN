# Crypto Trading Bot 2025 (Desktop)

Real-time desktop app with Tkinter + Matplotlib. Uses CoinMarketCap (if API key set) with fallbacks to CoinGecko/Binance and a demo mode.

## Run (dev)

- Option A: set API key env and run

```bash
export CMC_API_KEY=your_key_here
python main.py
```

- Option B: no env var — app opens a setup dialog to choose API key, Free APIs, or Demo.

## Build an executable

- Windows (from Windows):

```bat
cd desktop_bot
build_windows.bat
```

- Linux (from Linux):

```bash
cd desktop_bot
chmod +x build_linux.sh
./build_linux.sh
```

Artifacts are produced in `dist/CryptoTradingBot2025/`.

## Notes

- API calls are retried with backoff; CMC free tier is within limits at the default 30s refresh.
- SQLite is configured with WAL + busy timeout so reads in UI won’t block while the background writer saves data.
- Supported symbols by default: BTC, ETH, SOL, ADA, DOT, MATIC, LINK, AVAX, UNI, ATOM.