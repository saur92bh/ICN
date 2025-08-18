import os
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('TkAgg')
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure
import matplotlib.dates as mdates
import requests
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import warnings
from dataclasses import dataclass
import sqlite3
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import sys
import logging

warnings.filterwarnings('ignore')

# Ensure requests has certificates in frozen exe
try:
    import certifi
    os.environ.setdefault('SSL_CERT_FILE', certifi.where())
except Exception:
    pass

# Basic file logging to help diagnose silent startup failures on Windows exe
try:
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.getcwd()
    log_path = os.path.join(base_dir, 'bot.log')
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(levelname)s %(message)s',
        handlers=[logging.FileHandler(log_path, encoding='utf-8')]
    )
    logging.info('CryptoTradingBot starting...')
except Exception:
    pass


@dataclass
class CryptoData:
    symbol: str
    price: float
    change_24h: float
    change_7d: float
    volume_24h: float
    market_cap: float
    timestamp: datetime


class CryptoDataProvider:
    """Multi-source real-time crypto data provider"""

    def __init__(self, cmc_api_key: Optional[str] = None):
        self.cmc_api_key = cmc_api_key
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': 'CryptoBot/1.0', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache'})

        # Robust retries for flaky networks and 429s
        retries = Retry(
            total=5,
            backoff_factor=1.2,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS"]
        )
        adapter = HTTPAdapter(max_retries=retries)
        self.session.mount('https://', adapter)
        self.session.mount('http://', adapter)
        self.last_source = 'Unknown'

        # CoinMarketCap API setup
        if cmc_api_key:
            self.cmc_headers = {
                'Accepts': 'application/json',
                'X-CMC_PRO_API_KEY': cmc_api_key,
            }

        # Alternative free APIs
        self.coingecko_base = "https://api.coingecko.com/api/v3"
        self.binance_base = "https://api.binance.com/api/v3"

    def get_real_time_data(self, symbols: List[str]) -> Dict[str, CryptoData]:
        """Get real-time data using multiple sources"""

        # Normalize requested symbols: map BTCUSD/BTCUSDT -> BTC for CMC; remember original keys
        normalized_to_requested: Dict[str, str] = {}
        cmc_symbols: List[str] = []
        for s in symbols:
            base = s.replace('/', '').upper()
            if base.endswith('USDT'):
                base = base[:-4]
            elif base.endswith('USD'):
                base = base[:-3]
            normalized_to_requested[base] = s
            if base not in cmc_symbols:
                cmc_symbols.append(base)

        result_base: Dict[str, CryptoData] = {}

        # Try CoinMarketCap first (if API key provided)
        if self.cmc_api_key:
            try:
                result_base = self._get_cmc_data(cmc_symbols)
                if result_base:
                    self.last_source = 'CoinMarketCap'
            except Exception as e:
                print(f"CMC API error: {e}")

        # Fallback to free APIs
        if not result_base:
            try:
                result_base = self._get_coingecko_data(cmc_symbols)
                if result_base:
                    self.last_source = 'CoinGecko'
            except Exception as e:
                print(f"CoinGecko API error: {e}")

        if not result_base:
            try:
                result_base = self._get_binance_data(cmc_symbols)
                if result_base:
                    self.last_source = 'Binance'
            except Exception as e:
                print(f"Binance API error: {e}")

        if not result_base:
            self.last_source = 'Demo'
            result_base = self._generate_demo_data(cmc_symbols)

        # Remap to requested keys
        remapped: Dict[str, CryptoData] = {}
        for base, requested in normalized_to_requested.items():
            if base in result_base:
                data = result_base[base]
                remapped[requested] = CryptoData(
                    symbol=requested,
                    price=data.price,
                    change_24h=data.change_24h,
                    change_7d=data.change_7d,
                    volume_24h=data.volume_24h,
                    market_cap=data.market_cap,
                    timestamp=data.timestamp,
                )
        return remapped

    def _get_cmc_data(self, symbols: List[str]) -> Dict[str, CryptoData]:
        """Get data from CoinMarketCap"""
        url = "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest"
        params = {
            'symbol': ','.join(symbols),
            'convert': 'USD',
            'aux': 'num_market_pairs,cmc_rank,date_added,tags,platform,max_supply,circulating_supply,total_supply,is_active'
        }

        response = self.session.get(url, headers=self.cmc_headers, params=params, timeout=15)
        response.raise_for_status()

        data = response.json()
        crypto_data = {}

        for symbol in symbols:
            if symbol in data.get('data', {}):
                coin = data['data'][symbol]
                quote = coin['quote']['USD']

                crypto_data[symbol] = CryptoData(
                    symbol=symbol,
                    price=float(quote['price']),
                    change_24h=float(quote.get('percent_change_24h', 0) or 0),
                    change_7d=float(quote.get('percent_change_7d', 0) or 0),
                    volume_24h=float(quote.get('volume_24h', 0) or 0),
                    market_cap=float(quote.get('market_cap', 0) or 0),
                    timestamp=datetime.now()
                )

        return crypto_data

    def _get_coingecko_data(self, symbols: List[str]) -> Dict[str, CryptoData]:
        """Get data from CoinGecko (free)"""
        # Map symbols to CoinGecko IDs
        symbol_map = {
            'BTC': 'bitcoin',
            'ETH': 'ethereum',
            'SOL': 'solana',
            'ADA': 'cardano',
            'DOT': 'polkadot',
            'MATIC': 'polygon-pos',
            'LINK': 'chainlink',
            'AVAX': 'avalanche-2',
            'UNI': 'uniswap',
            'ATOM': 'cosmos',
            'XRP': 'ripple'
        }

        coin_ids = [symbol_map.get(symbol, symbol.lower()) for symbol in symbols]

        url = f"{self.coingecko_base}/simple/price"
        params = {
            'ids': ','.join(coin_ids),
            'vs_currencies': 'usd',
            'include_24hr_change': 'true',
            'include_24hr_vol': 'true',
            'include_market_cap': 'true'
        }

        response = self.session.get(url, params=params, timeout=15)
        response.raise_for_status()

        data = response.json()
        crypto_data = {}

        for i, symbol in enumerate(symbols):
            coin_id = coin_ids[i]
            if coin_id in data:
                coin_data = data[coin_id]
                crypto_data[symbol] = CryptoData(
                    symbol=symbol,
                    price=float(coin_data.get('usd', 0) or 0),
                    change_24h=float(coin_data.get('usd_24h_change', 0) or 0),
                    change_7d=0.0,  # Not available in simple endpoint
                    volume_24h=float(coin_data.get('usd_24h_vol', 0) or 0),
                    market_cap=float(coin_data.get('usd_market_cap', 0) or 0),
                    timestamp=datetime.now()
                )

        return crypto_data

    def _get_binance_data(self, symbols: List[str]) -> Dict[str, CryptoData]:
        """Get data from Binance (free)"""
        # Query all 24hr ticker stats (fast, but large)
        url = f"{self.binance_base}/ticker/24hr"
        response = self.session.get(url, timeout=15)
        response.raise_for_status()

        data = response.json()
        crypto_data = {}

        # Build mapping from base symbol -> requested display symbol
        base_to_requested: Dict[str, str] = {}
        for s in symbols:
            base = s.upper()
            base_to_requested[base] = s
        # Accept both USDT/USD requested names
        # Loop through Binance symbols and fill by base
        for item in data:
            sym = item.get('symbol', '')
            if not sym.endswith('USDT'):
                continue
            base = sym[:-4]
            if base in base_to_requested:
                last_price = float(item.get('lastPrice') or 0.0)
                vol_base = float(item.get('volume') or 0.0)
                vol_usd = vol_base * last_price
                change_pct = float(item.get('priceChangePercent') or 0.0)
                display = base_to_requested[base]
                crypto_data[base] = CryptoData(
                    symbol=display,
                    price=last_price,
                    change_24h=change_pct,
                    change_7d=0.0,  # Not available
                    volume_24h=vol_usd,
                    market_cap=0.0,  # Not available
                    timestamp=datetime.now()
                )

        return crypto_data

    def get_binance_klines(self, symbol: str, interval: str = '1m', limit: int = 500) -> pd.DataFrame:
        """Fetch historical klines for a symbol from Binance and return a DataFrame."""
        pair = f"{symbol}USDT"
        url = f"{self.binance_base}/klines"
        params = { 'symbol': pair, 'interval': interval, 'limit': int(limit) }
        resp = self.session.get(url, params=params, timeout=20)
        resp.raise_for_status()
        data = resp.json()
        if not data:
            return pd.DataFrame()
        # Columns: [openTime, open, high, low, close, volume, closeTime, ... quoteAssetVolume, trades, ...]
        records = []
        for k in data:
            open_time_ms = int(k[0])
            ts = datetime.fromtimestamp(open_time_ms / 1000.0)
            high = float(k[2])
            low = float(k[3])
            close = float(k[4])
            vol = float(k[5])
            records.append({ 'timestamp': ts, 'close': close, 'high': high, 'low': low, 'volume': vol })
        df = pd.DataFrame.from_records(records)
        df = df.set_index('timestamp')
        return df

    def _generate_demo_data(self, symbols: List[str]) -> Dict[str, CryptoData]:
        """Generate realistic demo data"""
        base_prices = {
            'BTC': 26000 + np.random.normal(0, 500),
            'ETH': 1650 + np.random.normal(0, 50),
            'SOL': 22 + np.random.normal(0, 2),
            'ADA': 0.28 + np.random.normal(0, 0.02),
            'DOT': 5.2 + np.random.normal(0, 0.3),
            'MATIC': 0.55 + np.random.normal(0, 0.05),
            'LINK': 7.8 + np.random.normal(0, 0.5),
            'AVAX': 10.5 + np.random.normal(0, 1),
            'UNI': 5.1 + np.random.normal(0, 0.4),
            'ATOM': 8.3 + np.random.normal(0, 0.6),
            'XRP': 0.60 + np.random.normal(0, 0.02)
        }

        crypto_data = {}
        for symbol in symbols:
            if symbol in base_prices:
                price = max(float(base_prices[symbol]), 0.01)
                crypto_data[symbol] = CryptoData(
                    symbol=symbol,
                    price=price,
                    change_24h=float(np.random.normal(0, 3)),
                    change_7d=float(np.random.normal(0, 8)),
                    volume_24h=float(np.random.uniform(1e8, 1e10)),
                    market_cap=price * float(np.random.uniform(1e8, 1e11)),
                    timestamp=datetime.now()
                )

        return crypto_data


class TechnicalAnalysis:
    """Advanced technical analysis indicators"""

    @staticmethod
    def sma(data: pd.Series, period: int) -> pd.Series:
        return data.rolling(window=period, min_periods=1).mean()

    @staticmethod
    def ema(data: pd.Series, period: int) -> pd.Series:
        return data.ewm(span=period, min_periods=1).mean()

    @staticmethod
    def rsi(data: pd.Series, period: int = 14) -> pd.Series:
        delta = data.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period, min_periods=1).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period, min_periods=1).mean()
        rs = gain / loss.replace(0, np.nan)
        rsi = 100 - (100 / (1 + rs))
        return rsi.fillna(50)

    @staticmethod
    def macd(data: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
        ema_fast = TechnicalAnalysis.ema(data, fast)
        ema_slow = TechnicalAnalysis.ema(data, slow)
        macd_line = ema_fast - ema_slow
        signal_line = TechnicalAnalysis.ema(macd_line, signal)
        histogram = macd_line - signal_line
        return macd_line, signal_line, histogram

    @staticmethod
    def bollinger_bands(data: pd.Series, period: int = 20, std_dev: int = 2):
        sma = TechnicalAnalysis.sma(data, period)
        std = data.rolling(window=period, min_periods=1).std()
        upper = sma + (std * std_dev)
        lower = sma - (std * std_dev)
        return upper, sma, lower


class TradingStrategy:
    """Base strategy class"""

    def __init__(self, name: str):
        self.name = name
        self.last_signal = "HOLD"
        self.confidence = 0.0

    def analyze(self, data: pd.DataFrame) -> tuple[str, float]:
        """Return signal and confidence"""
        raise NotImplementedError


class MultiIndicatorStrategy(TradingStrategy):
    """Advanced strategy combining multiple indicators"""

    def __init__(self):
        super().__init__("Multi-Indicator Strategy")
        self.rsi_oversold = 30
        self.rsi_overbought = 70

    def analyze(self, data: pd.DataFrame) -> tuple[str, float]:
        if len(data) < 50:
            return "HOLD", 0.0

        prices = data['close']

        # Calculate indicators
        rsi_val = TechnicalAnalysis.rsi(prices, 14).iloc[-1]
        macd_line, signal_line, _ = TechnicalAnalysis.macd(prices)
        macd_current = macd_line.iloc[-1]
        signal_current = signal_line.iloc[-1]

        ema_12 = TechnicalAnalysis.ema(prices, 12).iloc[-1]
        ema_26 = TechnicalAnalysis.ema(prices, 26).iloc[-1]

        upper_bb, middle_bb, lower_bb = TechnicalAnalysis.bollinger_bands(prices)
        current_price = prices.iloc[-1]

        # Signal scoring
        buy_signals = 0
        sell_signals = 0

        # RSI signals
        if rsi_val < self.rsi_oversold:
            buy_signals += 2
        elif rsi_val > self.rsi_overbought:
            sell_signals += 2

        # MACD signals
        if macd_current > signal_current and len(macd_line) > 1:
            prev_macd = macd_line.iloc[-2]
            prev_signal = signal_line.iloc[-2]
            if prev_macd <= prev_signal:  # Bullish crossover
                buy_signals += 2
        elif macd_current < signal_current and len(macd_line) > 1:
            prev_macd = macd_line.iloc[-2]
            prev_signal = signal_line.iloc[-2]
            if prev_macd >= prev_signal:  # Bearish crossover
                sell_signals += 2

        # EMA trend
        if ema_12 > ema_26:
            buy_signals += 1
        else:
            sell_signals += 1

        # Bollinger Bands
        if current_price <= lower_bb.iloc[-1]:
            buy_signals += 1
        elif current_price >= upper_bb.iloc[-1]:
            sell_signals += 1

        # Determine signal and confidence
        total_signals = buy_signals + sell_signals
        if total_signals == 0:
            return "HOLD", 0.0

        if buy_signals > sell_signals:
            confidence = min((buy_signals / 6.0) * 100, 100)
            self.last_signal = "BUY"
            return "BUY", confidence
        elif sell_signals > buy_signals:
            confidence = min((sell_signals / 6.0) * 100, 100)
            self.last_signal = "SELL"
            return "SELL", confidence
        else:
            self.last_signal = "HOLD"
            return "HOLD", 0.0


class DataManager:
    """Manage historical data with SQLite database"""

    def __init__(self, db_path: str = "crypto_data.db"):
        self.db_path = db_path
        self.init_database()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30, check_same_thread=False)
        cur = conn.cursor()
        # Improve concurrency and durability for UI read + writer thread
        cur.execute('PRAGMA journal_mode=WAL;')
        cur.execute('PRAGMA synchronous=NORMAL;')
        cur.execute('PRAGMA busy_timeout=30000;')
        conn.commit()
        return conn

    def init_database(self):
        """Initialize SQLite database"""
        conn = self._get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS price_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                price REAL NOT NULL,
                high REAL,
                low REAL,
                volume REAL,
                market_cap REAL,
                change_24h REAL,
                timestamp DATETIME NOT NULL
            )
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_symbol_timestamp 
            ON price_data (symbol, timestamp)
        ''')
        cursor.execute('''
            CREATE UNIQUE INDEX IF NOT EXISTS uidx_symbol_timestamp
            ON price_data (symbol, timestamp)
        ''')

        conn.commit()
        conn.close()

    def store_data(self, crypto_data: Dict[str, CryptoData]):
        """Store crypto data in database"""
        if not crypto_data:
            return
        conn = self._get_connection()
        cursor = conn.cursor()

        for symbol, data in crypto_data.items():
            cursor.execute('''
                INSERT INTO price_data 
                (symbol, price, high, low, volume, market_cap, change_24h, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol, timestamp) DO UPDATE SET
                    price=excluded.price,
                    high=excluded.high,
                    low=excluded.low,
                    volume=excluded.volume,
                    market_cap=excluded.market_cap,
                    change_24h=excluded.change_24h
            ''', (
                symbol, data.price, data.price, data.price,
                data.volume_24h, data.market_cap, data.change_24h, data.timestamp
            ))

        conn.commit()
        conn.close()

    def get_historical_data(self, symbol: str, hours: int = 24) -> pd.DataFrame:
        """Get historical data for analysis"""
        conn = self._get_connection()

        end_time = datetime.now()
        start_time = end_time - timedelta(hours=hours)

        query = '''
            SELECT timestamp, price, high, low, volume
            FROM price_data 
            WHERE symbol = ? AND timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp
        '''

        df = pd.read_sql_query(query, conn, params=(symbol, start_time, end_time))
        conn.close()

        if df.empty:
            return pd.DataFrame()

        df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce', format='mixed')
        df = df.dropna(subset=['timestamp'])
        df = df.set_index('timestamp')
        df.columns = ['close', 'high', 'low', 'volume']

        return df

    def store_ohlc_dataframe(self, symbol: str, df: pd.DataFrame):
        """Bulk store OHLC dataframe with columns close, high, low, volume and index as timestamps."""
        if df is None or df.empty:
            return
        conn = self._get_connection()
        cursor = conn.cursor()
        rows = []
        for ts, row in df.iterrows():
            try:
                ts_py = ts.to_pydatetime() if isinstance(ts, pd.Timestamp) else (pd.to_datetime(ts, errors='coerce', format='mixed').to_pydatetime() if not isinstance(ts, datetime) else ts)
            except Exception:
                ts_py = pd.to_datetime(ts, errors='coerce').to_pydatetime()
            rows.append((
                symbol,
                float(row.get('close', row.get('price', 0.0)) or 0.0),
                float(row.get('high', row.get('close', 0.0)) or 0.0),
                float(row.get('low', row.get('close', 0.0)) or 0.0),
                float(row.get('volume', 0.0) or 0.0),
                0.0,
                0.0,
                ts_py
            ))
        cursor.executemany('''
            INSERT INTO price_data (symbol, price, high, low, volume, market_cap, change_24h, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(symbol, timestamp) DO UPDATE SET
                price=excluded.price,
                high=excluded.high,
                low=excluded.low,
                volume=excluded.volume
        ''', rows)
        conn.commit()
        conn.close()


class ModernCryptoTradingBot:
    """Modern crypto trading bot with real-time data"""

    def __init__(self, root, api_key: str | None = None):
        self.root = root
        self.root.title("🚀 Real-Time Crypto Trading Bot 2025")
        self.root.geometry("1600x1000")
        self.root.configure(bg='#0d1117')

        # Set window properties
        self.root.resizable(True, True)
        self.root.minsize(1200, 800)

        # Initialize components
        self.data_provider = CryptoDataProvider(api_key)
        self.data_manager = DataManager()
        self.strategy = MultiIndicatorStrategy()

        # Available cryptocurrencies
        self.symbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD']
        self.selected_symbol = self.symbols[0]

        # Data storage
        self.current_data: Dict[str, CryptoData] = {}

        # Control variables
        self.is_running = False
        self.update_interval = 10  # seconds (faster feedback)
        self.last_update = None
        self.timeframe = '5m'
        self.update_lock = threading.Lock()
        
        # Track last emitted signals per symbol to log only on change
        self._last_emitted_signals: Dict[str, str] = {}
        # Track last candle minute timestamp to avoid duplicate recalcs per symbol
        self._last_candle_min_ts: Dict[str, datetime] = {}
        
        # Default risk parameters for targets (editable later via UI if needed)
        self.tp_pct = 1.5  # take-profit percent
        self.sl_pct = 0.8  # stop-loss percent

        # Initialize GUI
        self.setup_styles()
        self.create_widgets()
        self.setup_layout()
        
        # Create signal alert window (separate) and keep hidden until used
        self.signal_window = SignalAlertWindow(self.root, self)

        # Start initial data fetch
        self.update_data()

        # Setup periodic updates
        self.schedule_updates()

    def setup_styles(self):
        """Setup modern dark theme styles"""
        self.style = ttk.Style()

        # Configure colors
        self.colors = {
            'bg_primary': '#0d1117',
            'bg_secondary': '#161b22',
            'bg_tertiary': '#21262d',
            'accent': '#238636',
            'accent_hover': '#2ea043',
            'danger': '#da3633',
            'warning': '#fb8500',
            'text_primary': '#f0f6fc',
            'text_secondary': '#8b949e',
            'border': '#30363d'
        }

        # ttk styles (used selectively; most widgets are tk for full color control)
        self.style.configure('Modern.TFrame', background=self.colors['bg_secondary'])
        self.style.configure('Card.TFrame', background=self.colors['bg_tertiary'], relief='solid', borderwidth=1)
        self.style.configure('Title.TLabel', background=self.colors['bg_primary'], foreground=self.colors['text_primary'], font=('Segoe UI', 20, 'bold'))
        self.style.configure('Heading.TLabel', background=self.colors['bg_secondary'], foreground=self.colors['text_primary'], font=('Segoe UI', 12, 'bold'))
        self.style.configure('Data.TLabel', background=self.colors['bg_tertiary'], foreground=self.colors['text_primary'], font=('Segoe UI', 10))
        self.style.configure('Success.TLabel', background=self.colors['bg_tertiary'], foreground=self.colors['accent'], font=('Segoe UI', 10, 'bold'))
        self.style.configure('Danger.TLabel', background=self.colors['bg_tertiary'], foreground=self.colors['danger'], font=('Segoe UI', 10, 'bold'))
        self.style.configure('Warning.TLabel', background=self.colors['bg_tertiary'], foreground=self.colors['warning'], font=('Segoe UI', 10, 'bold'))

    def create_widgets(self):
        """Create all GUI widgets"""
        # Main container
        self.main_frame = tk.Frame(self.root, bg=self.colors['bg_primary'])

        # Header
        self.create_header()

        # Main content area
        self.content_frame = tk.Frame(self.main_frame, bg=self.colors['bg_primary'])

        # Left sidebar
        self.create_sidebar()

        # Center area (charts)
        self.create_chart_area()

        # Right panel (signals and analysis)
        self.create_analysis_panel()

        # Status bar
        self.create_status_bar()

    def create_header(self):
        """Create header with controls"""
        self.header_frame = tk.Frame(self.main_frame, bg=self.colors['bg_secondary'], height=80)
        self.header_frame.pack_propagate(False)

        # Title
        title_label = tk.Label(self.header_frame, text="🚀 Crypto Trading Bot 2025",
                               bg=self.colors['bg_secondary'], fg=self.colors['text_primary'],
                               font=('Segoe UI', 20, 'bold'))
        title_label.pack(side=tk.LEFT, padx=20, pady=20)

        # Controls frame
        controls_frame = tk.Frame(self.header_frame, bg=self.colors['bg_secondary'])
        controls_frame.pack(side=tk.RIGHT, padx=20, pady=10)

        # Symbol selection
        tk.Label(controls_frame, text="Asset:", bg=self.colors['bg_secondary'],
                 fg=self.colors['text_primary'], font=('Segoe UI', 10)).grid(row=0, column=0, padx=5)

        self.symbol_var = tk.StringVar(value=self.selected_symbol)
        symbol_combo = ttk.Combobox(controls_frame, textvariable=self.symbol_var,
                                    values=self.symbols, state="readonly", width=8)
        symbol_combo.grid(row=0, column=1, padx=5)
        symbol_combo.bind('<<ComboboxSelected>>', self.on_symbol_change)

        # Control buttons
        self.start_button = tk.Button(controls_frame, text="▶️ Start",
                                      command=self.start_bot, width=8,
                                      bg=self.colors['accent'], fg='white',
                                      font=('Segoe UI', 10, 'bold'))
        self.start_button.grid(row=0, column=2, padx=5)

        self.stop_button = tk.Button(controls_frame, text="⏹️ Stop",
                                     command=self.stop_bot, width=8,
                                     bg=self.colors['danger'], fg='white',
                                     font=('Segoe UI', 10, 'bold'), state='disabled')
        self.stop_button.grid(row=0, column=3, padx=5)

        # Refresh button
        self.refresh_button = tk.Button(controls_frame, text="🔄 Refresh",
                                        command=lambda: self.root.after(0, self.update_data), width=10,
                                        bg=self.colors['bg_tertiary'], fg=self.colors['text_primary'],
                                        font=('Segoe UI', 10, 'bold'))
        self.refresh_button.grid(row=0, column=4, padx=6)

        # Backtest button
        self.backtest_button = tk.Button(controls_frame, text="🧪 Backtest",
                                         command=self.run_backtest, width=10,
                                         bg='#1f6feb', fg='white',
                                         font=('Segoe UI', 10, 'bold'))
        self.backtest_button.grid(row=0, column=5, padx=6)

        # Status indicator
        self.status_var = tk.StringVar(value="🔴 Stopped")
        status_label = tk.Label(controls_frame, textvariable=self.status_var,
                                bg=self.colors['bg_secondary'], fg=self.colors['text_primary'],
                                font=('Segoe UI', 10, 'bold'))
        status_label.grid(row=1, column=0, columnspan=4, pady=5)

    def create_sidebar(self):
        """Create left sidebar with price displays"""
        self.sidebar = tk.Frame(self.content_frame, bg=self.colors['bg_secondary'], width=300)
        self.sidebar.pack_propagate(False)

        # Market overview
        market_frame = tk.LabelFrame(self.sidebar, text="📊 Market Overview",
                                     bg=self.colors['bg_secondary'], fg=self.colors['text_primary'],
                                     font=('Segoe UI', 12, 'bold'), bd=1, relief='solid')
        market_frame.pack(fill=tk.X, padx=10, pady=10)

        # Price widgets for each crypto
        self.price_widgets: Dict[str, dict] = {}
        for i, symbol in enumerate(self.symbols):
            self.create_price_widget(market_frame, symbol)

        # Strategy info
        strategy_frame = tk.LabelFrame(self.sidebar, text="🎯 Strategy Analysis",
                                       bg=self.colors['bg_secondary'], fg=self.colors['text_primary'],
                                       font=('Segoe UI', 12, 'bold'), bd=1, relief='solid')
        strategy_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        self.strategy_text = scrolledtext.ScrolledText(strategy_frame, height=15, width=35,
                                                       bg=self.colors['bg_tertiary'],
                                                       fg=self.colors['text_primary'],
                                                       font=('Courier New', 9),
                                                       insertbackground=self.colors['text_primary'])
        self.strategy_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

    def create_price_widget(self, parent, symbol):
        """Create price display widget for a symbol"""
        frame = tk.Frame(parent, bg=self.colors['bg_tertiary'])
        frame.pack(fill=tk.X, padx=5, pady=2)

        # Symbol
        symbol_label = tk.Label(frame, text=f"{symbol}:", width=6,
                                bg=self.colors['bg_tertiary'], fg=self.colors['text_primary'],
                                font=('Segoe UI', 10, 'bold'))
        symbol_label.pack(side=tk.LEFT, padx=5)

        # Price
        price_label = tk.Label(frame, text="$0.00", width=12,
                               bg=self.colors['bg_tertiary'], fg=self.colors['text_primary'],
                               font=('Segoe UI', 10))
        price_label.pack(side=tk.LEFT, padx=5)

        # Change %
        change_label = tk.Label(frame, text="0.00%", width=8,
                                bg=self.colors['bg_tertiary'], fg=self.colors['text_secondary'],
                                font=('Segoe UI', 10))
        change_label.pack(side=tk.LEFT, padx=5)

        # Signal
        signal_label = tk.Label(frame, text="⚪ HOLD", width=10,
                                bg=self.colors['bg_tertiary'], fg=self.colors['text_secondary'],
                                font=('Segoe UI', 9, 'bold'))
        signal_label.pack(side=tk.LEFT, padx=5)

        self.price_widgets[symbol] = {
            'frame': frame,
            'price': price_label,
            'change': change_label,
            'signal': signal_label
        }

    def create_chart_area(self):
        """Create main chart area"""
        self.chart_frame = tk.Frame(self.content_frame, bg=self.colors['bg_secondary'])

        # Create matplotlib figure with dark theme
        plt.style.use('dark_background')
        self.fig = Figure(figsize=(14, 10), facecolor=self.colors['bg_secondary'])
        self.fig.patch.set_facecolor(self.colors['bg_secondary'])

        # Create subplots
        gs = self.fig.add_gridspec(4, 1, height_ratios=[3, 1, 1, 1], hspace=0.3)

        # Price chart
        self.ax_price = self.fig.add_subplot(gs[0])
        self.ax_price.set_facecolor(self.colors['bg_tertiary'])

        # Volume chart
        self.ax_volume = self.fig.add_subplot(gs[1], sharex=self.ax_price)
        self.ax_volume.set_facecolor(self.colors['bg_tertiary'])

        # RSI chart
        self.ax_rsi = self.fig.add_subplot(gs[2], sharex=self.ax_price)
        self.ax_rsi.set_facecolor(self.colors['bg_tertiary'])

        # MACD chart
        self.ax_macd = self.fig.add_subplot(gs[3], sharex=self.ax_price)
        self.ax_macd.set_facecolor(self.colors['bg_tertiary'])

        # Embed in tkinter
        self.canvas = FigureCanvasTkAgg(self.fig, self.chart_frame)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)

    def create_analysis_panel(self):
        """Create right analysis panel"""
        self.analysis_frame = tk.Frame(self.content_frame, bg=self.colors['bg_secondary'], width=250)
        self.analysis_frame.pack_propagate(False)

        # Current analysis
        current_frame = tk.LabelFrame(self.analysis_frame, text="📈 Current Analysis",
                                      bg=self.colors['bg_secondary'], fg=self.colors['text_primary'],
                                      font=('Segoe UI', 12, 'bold'), bd=1, relief='solid')
        current_frame.pack(fill=tk.X, padx=10, pady=10)

        # Analysis labels
        self.analysis_labels: Dict[str, tk.Label] = {}

        labels = ['Price', 'RSI', 'MACD', 'Signal', 'Confidence', 'Trend']
        for i, label in enumerate(labels):
            tk.Label(current_frame, text=f"{label}:",
                     bg=self.colors['bg_secondary'], fg=self.colors['text_secondary'],
                     font=('Segoe UI', 10)).grid(row=i, column=0, sticky='w', padx=5, pady=2)

            value_label = tk.Label(current_frame, text="-",
                                   bg=self.colors['bg_secondary'], fg=self.colors['text_primary'],
                                   font=('Segoe UI', 10, 'bold'))
            value_label.grid(row=i, column=1, sticky='w', padx=5, pady=2)

            self.analysis_labels[label.lower()] = value_label

        # Trading signals log
        signals_frame = tk.LabelFrame(self.analysis_frame, text="📊 Trading Signals",
                                      bg=self.colors['bg_secondary'], fg=self.colors['text_primary'],
                                      font=('Segoe UI', 12, 'bold'), bd=1, relief='solid')
        signals_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        self.signals_text = scrolledtext.ScrolledText(signals_frame, height=20, width=30,
                                                      bg=self.colors['bg_tertiary'],
                                                      fg=self.colors['text_primary'],
                                                      font=('Courier New', 9),
                                                      insertbackground=self.colors['text_primary'])
        self.signals_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)

    def create_status_bar(self):
        """Create bottom status bar"""
        self.status_bar = tk.Frame(self.main_frame, bg=self.colors['bg_secondary'], height=30)
        self.status_bar.pack_propagate(False)

        # Last update time
        self.last_update_label = tk.Label(self.status_bar, text="Last update: Never",
                                          bg=self.colors['bg_secondary'], fg=self.colors['text_secondary'],
                                          font=('Segoe UI', 9))
        self.last_update_label.pack(side=tk.LEFT, padx=10, pady=5)

        # Data source indicator
        self.data_source_label = tk.Label(self.status_bar, text="Data: Demo Mode",
                                          bg=self.colors['bg_secondary'], fg=self.colors['text_secondary'],
                                          font=('Segoe UI', 9))
        self.data_source_label.pack(side=tk.RIGHT, padx=10, pady=5)

    def setup_layout(self):
        """Setup the main layout"""
        self.main_frame.pack(fill=tk.BOTH, expand=True)

        # Header
        self.header_frame.pack(fill=tk.X)

        # Content area
        self.content_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)

        # Sidebar
        self.sidebar.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 10))

        # Chart area
        self.chart_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 10))

        # Analysis panel
        self.analysis_frame.pack(side=tk.LEFT, fill=tk.Y)

        # Status bar
        self.status_bar.pack(fill=tk.X, side=tk.BOTTOM)

    def on_symbol_change(self, event=None):
        """Handle symbol selection change"""
        self.selected_symbol = self.symbol_var.get()
        self.update_charts()
        self.log_signal(f"📊 Switched to {self.selected_symbol}")

    def start_bot(self):
        """Start the trading bot"""
        self.is_running = True
        self.start_button.config(state='disabled')
        self.stop_button.config(state='normal')
        self.status_var.set("🟢 Running")
        
        # Ensure signal window is visible when running
        self.signal_window.open()

        # Start background thread
        self.bot_thread = threading.Thread(target=self.bot_loop, daemon=True)
        self.bot_thread.start()

        self.log_signal("🚀 Trading bot started!")
        self.log_signal(f"📊 Monitoring {len(self.symbols)} cryptocurrencies")
        self.log_signal(f"⏰ Update interval: {self.update_interval}s")

        # Seed historical data if needed in background to enable immediate signals
        threading.Thread(target=self.seed_history_if_needed, daemon=True).start()

    def stop_bot(self):
        """Stop the trading bot"""
        self.is_running = False
        self.start_button.config(state='normal')
        self.stop_button.config(state='disabled')
        self.status_var.set("🔴 Stopped")

        self.log_signal("⏹️ Trading bot stopped!")

    def bot_loop(self):
        """Main bot loop"""
        while self.is_running:
            try:
                self.update_data()
                time.sleep(self.update_interval)
            except Exception as e:
                self.log_signal(f"❌ Error in bot loop: {str(e)}")
                time.sleep(60)  # Wait longer on error

    def update_data(self):
        """Fetch and update cryptocurrency data"""
        if not self.update_lock.acquire(blocking=False):
            return
        try:
            # Fetch real-time data
            self.current_data = self.data_provider.get_real_time_data(self.symbols)

            # Store in database
            self.data_manager.store_data(self.current_data)

            # Update GUI in main thread
            self.root.after(0, self.update_gui)

            self.last_update = datetime.now()

        except Exception as e:
            self.log_signal(f"❌ Error updating data: {str(e)}")
        finally:
            try:
                self.update_lock.release()
            except Exception:
                pass

    def update_gui(self):
        """Update all GUI elements"""
        self.update_price_displays()
        self.update_analysis()
        self.update_charts()
        self.update_status()

    def update_price_displays(self):
        """Update price display widgets"""
        for symbol, widget in self.price_widgets.items():
            if symbol in self.current_data:
                data = self.current_data[symbol]

                # Update price
                widget['price'].config(text=f"${data.price:,.2f}")

                # Update change with color
                change = data.change_24h
                if change > 0:
                    color = self.colors['accent']
                    prefix = "+"
                elif change < 0:
                    color = self.colors['danger']
                    prefix = ""
                else:
                    color = self.colors['text_secondary']
                    prefix = ""

                widget['change'].config(text=f"{prefix}{change:.2f}%", fg=color)

                # Update trading signal
                historical_data = self.data_manager.get_historical_data(symbol, hours=12)
                if not historical_data.empty and len(historical_data) > 20:
                    # Only compute on new minute to reduce duplicates
                    last_ts = historical_data.index.max()
                    if isinstance(last_ts, pd.Timestamp):
                        last_minute = last_ts.floor('T').to_pydatetime()
                    else:
                        last_minute = (pd.to_datetime(last_ts).floor('T')).to_pydatetime()
                    prev_seen = self._last_candle_min_ts.get(symbol)
                    if prev_seen is None or last_minute != prev_seen:
                        self._last_candle_min_ts[symbol] = last_minute
                        signal, confidence = self.strategy.analyze(historical_data)

                        if signal == "BUY":
                            signal_text = "🟢 BUY"
                            signal_color = self.colors['accent']
                        elif signal == "SELL":
                            signal_text = "🔴 SELL"
                            signal_color = self.colors['danger']
                        else:
                            signal_text = "⚪ HOLD"
                            signal_color = self.colors['text_secondary']

                        widget['signal'].config(text=signal_text, fg=signal_color)

                        # Log on change for BUY/SELL and show in separate signal window
                        prev = self._last_emitted_signals.get(symbol)
                        if signal in ("BUY", "SELL") and signal != prev:
                            self.log_signal(f"⚡ {symbol}: {signal} ({confidence:.1f}% confidence)")
                            self._last_emitted_signals[symbol] = signal
                            entry = float(self.current_data[symbol].price)
                            if signal == "BUY":
                                tp = round(entry * (1 + self.tp_pct / 100.0), 6)
                                sl = round(entry * (1 - self.sl_pct / 100.0), 6)
                                self.signal_window.add_signal(symbol, "BUY", entry, tp, sl, datetime.now())
                            else:
                                tp = round(entry * (1 - self.tp_pct / 100.0), 6)
                                sl = round(entry * (1 + self.sl_pct / 100.0), 6)
                                self.signal_window.add_signal(symbol, "SELL", entry, tp, sl, datetime.now())
                    else:
                        # Keep last displayed signal text
                        signal = self._last_emitted_signals.get(symbol, "HOLD")
                        if signal == "BUY":
                            widget['signal'].config(text="🟢 BUY", fg=self.colors['accent'])
                        elif signal == "SELL":
                            widget['signal'].config(text="🔴 SELL", fg=self.colors['danger'])
                        else:
                            widget['signal'].config(text="⚪ HOLD", fg=self.colors['text_secondary'])

    def update_analysis(self):
        """Update current analysis panel"""
        symbol = self.selected_symbol
        if symbol not in self.current_data:
            return

        data = self.current_data[symbol]
        historical_data = self.data_manager.get_historical_data(symbol, hours=12)

        # Update basic info
        self.analysis_labels['price'].config(text=f"${data.price:,.2f}")

        if not historical_data.empty and len(historical_data) > 20:
            # Calculate indicators
            prices = historical_data['close']
            rsi_series = TechnicalAnalysis.rsi(prices, 14)
            rsi_val = float(rsi_series.iloc[-1])
            macd_line, signal_line, _ = TechnicalAnalysis.macd(prices)

            # Get trading signal
            signal, confidence = self.strategy.analyze(historical_data)

            # Update labels
            self.analysis_labels['rsi'].config(text=f"{rsi_val:.1f}")

            if len(macd_line) > 0:
                macd_val = float(macd_line.iloc[-1])
                self.analysis_labels['macd'].config(text=f"{macd_val:.4f}")

            # Signal and confidence
            if signal == "BUY":
                self.analysis_labels['signal'].config(text="🟢 BUY", fg=self.colors['accent'])
            elif signal == "SELL":
                self.analysis_labels['signal'].config(text="🔴 SELL", fg=self.colors['danger'])
            else:
                self.analysis_labels['signal'].config(text="⚪ HOLD", fg=self.colors['text_secondary'])

            self.analysis_labels['confidence'].config(text=f"{confidence:.1f}%")

            # Trend analysis
            if len(prices) >= 2:
                if prices.iloc[-1] > prices.iloc[-2]:
                    trend = "📈 Up"
                    trend_color = self.colors['accent']
                elif prices.iloc[-1] < prices.iloc[-2]:
                    trend = "📉 Down"
                    trend_color = self.colors['danger']
                else:
                    trend = "➡️ Flat"
                    trend_color = self.colors['text_secondary']

                self.analysis_labels['trend'].config(text=trend, fg=trend_color)

            # Log significant signals
            if confidence > 70:
                self.log_signal(f"🎯 Strong {signal} signal for {symbol} ({confidence:.1f}% confidence)")

    def update_charts(self):
        """Update all charts"""
        symbol = self.selected_symbol
        historical_data = self.data_manager.get_historical_data(symbol, hours=12)

        if historical_data.empty or len(historical_data) < 10:
            return

        # Clear all axes
        self.ax_price.clear()
        self.ax_volume.clear()
        self.ax_rsi.clear()
        self.ax_macd.clear()

        # Price chart
        prices = historical_data['close']
        times = historical_data.index

        self.ax_price.plot(times, prices, color='#00d4aa', linewidth=2, label=f'{symbol} Price')

        # Add moving averages
        if len(prices) >= 12:
            ema12 = TechnicalAnalysis.ema(prices, 12)
            self.ax_price.plot(times, ema12, color='#ffa500', alpha=0.8, linewidth=1.5, label='EMA(12)')
        if len(prices) >= 26:
            ema26 = TechnicalAnalysis.ema(prices, 26)
            self.ax_price.plot(times, ema26, color='#ff6b6b', alpha=0.8, linewidth=1.5, label='EMA(26)')

        # Bollinger Bands
        if len(prices) >= 20:
            upper, middle, lower = TechnicalAnalysis.bollinger_bands(prices, 20, 2)
            self.ax_price.fill_between(times, upper, lower, alpha=0.1, color='gray')
            self.ax_price.plot(times, upper, color='gray', alpha=0.5, linestyle='--', linewidth=1)
            self.ax_price.plot(times, lower, color='gray', alpha=0.5, linestyle='--', linewidth=1)

        self.ax_price.set_title(f'{symbol} Price Chart', color='white', fontsize=14, fontweight='bold')
        self.ax_price.legend(loc='upper left')
        self.ax_price.grid(True, alpha=0.3)

        # Volume chart
        if 'volume' in historical_data.columns:
            volumes = historical_data['volume']
            self.ax_volume.bar(times, volumes, color='#4a90e2', alpha=0.7)
            self.ax_volume.set_title('Volume', color='white', fontsize=12)
            self.ax_volume.grid(True, alpha=0.3)

        # RSI chart
        if len(prices) >= 14:
            rsi = TechnicalAnalysis.rsi(prices, 14)
            self.ax_rsi.plot(times, rsi, color='#ffeb3b', linewidth=2)
            self.ax_rsi.axhline(y=70, color='#f44336', linestyle='--', alpha=0.8, linewidth=1)
            self.ax_rsi.axhline(y=30, color='#4caf50', linestyle='--', alpha=0.8, linewidth=1)
            self.ax_rsi.fill_between(times, 30, 70, alpha=0.1, color='gray')
            self.ax_rsi.set_ylim(0, 100)
            self.ax_rsi.set_title('RSI (14)', color='white', fontsize=12)
            self.ax_rsi.grid(True, alpha=0.3)

        # MACD chart
        if len(prices) >= 26:
            macd_line, signal_line, histogram = TechnicalAnalysis.macd(prices)

            self.ax_macd.plot(times, macd_line, color='#2196f3', linewidth=2, label='MACD')
            self.ax_macd.plot(times, signal_line, color='#ff9800', linewidth=2, label='Signal')

            # Histogram
            colors = ['#4caf50' if x >= 0 else '#f44336' for x in histogram]
            self.ax_macd.bar(times, histogram, color=colors, alpha=0.6, label='Histogram')

            self.ax_macd.axhline(y=0, color='white', linestyle='-', alpha=0.5, linewidth=1)
            self.ax_macd.set_title('MACD', color='white', fontsize=12)
            self.ax_macd.legend(loc='upper left')
            self.ax_macd.grid(True, alpha=0.3)

        # Format x-axis
        for ax in [self.ax_price, self.ax_volume, self.ax_rsi, self.ax_macd]:
            ax.tick_params(colors='white')
        try:
            if len(times) >= 2 and (times[-1] - times[0]).total_seconds() <= 7200:
                fmt = mdates.DateFormatter('%H:%M:%S')
            else:
                fmt = mdates.DateFormatter('%H:%M')
            for ax in [self.ax_price, self.ax_volume, self.ax_rsi, self.ax_macd]:
                ax.xaxis.set_major_formatter(fmt)
        except Exception:
            for ax in [self.ax_price, self.ax_volume, self.ax_rsi, self.ax_macd]:
                ax.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))

        # Tight layout and refresh
        self.fig.tight_layout()
        self.canvas.draw()

    def update_status(self):
        """Update status bar"""
        if self.last_update:
            time_str = self.last_update.strftime('%Y-%m-%d %H:%M:%S')
            self.last_update_label.config(text=f"Last update: {time_str}")
        
        # Update data source
        source = getattr(self.data_provider, 'last_source', 'Unknown')
        if source == 'CoinMarketCap':
            self.data_source_label.config(text="Data: CoinMarketCap API")
        elif source == 'CoinGecko':
            self.data_source_label.config(text="Data: CoinGecko API")
        elif source == 'Binance':
            self.data_source_label.config(text="Data: Binance API")
        elif source == 'Demo':
            self.data_source_label.config(text="Data: Demo Mode")
        else:
            self.data_source_label.config(text="Data: Unknown")

    def log_signal(self, message: str):
        """Add message to signals log"""
        timestamp = datetime.now().strftime('%H:%M:%S')
        full_message = f"[{timestamp}] {message}\n"

        # Add to strategy text
        self.strategy_text.insert(tk.END, full_message)
        self.strategy_text.see(tk.END)

        # Also add to signals text
        self.signals_text.insert(tk.END, full_message)
        self.signals_text.see(tk.END)

        # Keep only last 500 lines in each
        for text_widget in [self.strategy_text, self.signals_text]:
            lines = text_widget.get("1.0", tk.END).split('\n')
            if len(lines) > 500:
                text_widget.delete("1.0", f"{len(lines)-500}.0")

    def schedule_updates(self):
        """Schedule periodic GUI updates"""
        if self.is_running:
            self.root.after(1000, self.schedule_updates)  # Update every second
        else:
            self.root.after(5000, self.schedule_updates)  # Check every 5 seconds when stopped

    def seed_history_if_needed(self):
        """Fetch and store recent OHLC history to enable immediate charts/signals."""
        try:
            # Seed selected symbol first for faster UI feedback
            symbols_to_seed = [self.selected_symbol] + [s for s in self.symbols if s != self.selected_symbol]
            for symbol in symbols_to_seed:
                existing = self.data_manager.get_historical_data(symbol, hours=6)
                if existing is not None and len(existing) >= 60:
                    continue
                try:
                    # Map requested to base for Binance
                    base = symbol.replace('/', '').upper()
                    if base.endswith('USDT'):
                        base = base[:-4]
                    elif base.endswith('USD'):
                        base = base[:-3]
                    df = self.data_provider.get_binance_klines(base, interval=self.timeframe, limit=500)
                    if not df.empty:
                        self.data_manager.store_ohlc_dataframe(symbol, df)
                        # Update UI after seeding first symbol
                        if symbol == self.selected_symbol:
                            self.root.after(0, self.update_gui)
                except Exception as e:
                    self.log_signal(f"⚠️ Failed to seed history for {symbol}: {e}")
        except Exception as e:
            self.log_signal(f"⚠️ Seed history error: {e}")

    def run_backtest(self):
        """Simple backtest on stored data for the selected symbol; logs summary."""
        symbol = self.symbol_var.get()
        df = self.data_manager.get_historical_data(symbol, hours=48)
        if df.empty or len(df) < 60:
            # Try to seed from Binance if not enough data
            try:
                seed = self.data_provider.get_binance_klines(symbol, interval='1m', limit=500)
                if not seed.empty:
                    self.data_manager.store_ohlc_dataframe(symbol, seed)
                    df = self.data_manager.get_historical_data(symbol, hours=48)
            except Exception as e:
                self.log_signal(f"⚠️ Backtest seed failed: {e}")
        if df.empty or len(df) < 50:
            self.log_signal(f"🧪 Backtest: not enough data for {symbol}")
            return
        # Walk forward and compute signals over time
        prices = df['close'].copy()
        wins = 0
        losses = 0
        holds = 0
        entries = 0
        tp_hits = 0
        sl_hits = 0
        equity = 0.0
        risk = 1.0  # 1 unit per trade
        window = 200
        for i in range(50, len(prices)):
            sub = df.iloc[:i]
            signal, conf = self.strategy.analyze(sub)
            if signal in ("BUY", "SELL"):
                entries += 1
                entry = float(prices.iloc[i-1])
                if signal == "BUY":
                    tp = entry * (1 + self.tp_pct/100.0)
                    sl = entry * (1 - self.sl_pct/100.0)
                    # Scan forward until TP or SL or next 60 bars
                    hit = None
                    for j in range(i, min(i+60, len(prices))):
                        p = float(prices.iloc[j])
                        if p >= tp:
                            hit = 'TP'; break
                        if p <= sl:
                            hit = 'SL'; break
                else:
                    tp = entry * (1 - self.tp_pct/100.0)
                    sl = entry * (1 + self.sl_pct/100.0)
                    hit = None
                    for j in range(i, min(i+60, len(prices))):
                        p = float(prices.iloc[j])
                        if p <= tp:
                            hit = 'TP'; break
                        if p >= sl:
                            hit = 'SL'; break
                if hit == 'TP':
                    tp_hits += 1
                    wins += 1
                    equity += risk * (self.tp_pct/100.0)
                elif hit == 'SL':
                    sl_hits += 1
                    losses += 1
                    equity -= risk * (self.sl_pct/100.0)
                else:
                    holds += 1
        self.log_signal(
            f"🧪 Backtest {symbol}: entries={entries}, TP={tp_hits}, SL={sl_hits}, holds={holds}, equity≈{equity:.4f}R")


class APISetupDialog:
    """Modern API setup dialog"""

    def __init__(self, parent, preset_api_key: str | None = None):
        self.result = None
        self._auto_after_id = None

        # Create dialog
        self.dialog = tk.Toplevel(parent)
        self.dialog.title("🔑 API Configuration")
        self.dialog.geometry("600x420")
        self.dialog.configure(bg='#0d1117')
        self.dialog.resizable(False, False)
        # Bring to front to avoid being hidden behind other windows
        try:
            self.dialog.attributes('-topmost', True)
        except Exception:
            pass

        # Make modal
        self.dialog.transient(parent)
        self.dialog.grab_set()

        # Center dialog
        self.center_dialog()
        self.create_widgets(preset_api_key)
        try:
            self.dialog.deiconify(); self.dialog.lift(); self.dialog.focus_force()
        except Exception:
            pass

        # Auto-fallback to Free APIs after 8 seconds if no choice is made
        self._auto_after_id = self.dialog.after(8000, self._auto_choose_free_if_idle)

        # Drop topmost after a short delay so user can move other windows
        try:
            self.dialog.after(1200, lambda: self.dialog.attributes('-topmost', False))
        except Exception:
            pass

    def center_dialog(self):
        """Center dialog on screen"""
        self.dialog.update_idletasks()
        x = (self.dialog.winfo_screenwidth() // 2) - 300
        y = (self.dialog.winfo_screenheight() // 2) - 210
        self.dialog.geometry(f"600x420+{x}+{y}")

    def create_widgets(self, preset_api_key: str | None = None):
        """Create dialog widgets"""
        # Colors
        bg_primary = '#0d1117'
        bg_secondary = '#161b22'
        text_primary = '#f0f6fc'
        text_secondary = '#8b949e'
        accent = '#238636'

        # Title
        title_label = tk.Label(self.dialog, text="🚀 Crypto Trading Bot Setup",
                               font=('Segoe UI', 20, 'bold'), bg=bg_primary, fg=text_primary)
        title_label.pack(pady=(18, 10))

        # Main content frame
        content_frame = tk.Frame(self.dialog, bg=bg_secondary, relief='solid', bd=1)
        content_frame.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)

        # Buttons frame (top, always visible)
        buttons_frame = tk.Frame(content_frame, bg=bg_secondary)
        buttons_frame.pack(pady=12)

        api_btn = tk.Button(buttons_frame, text="🔑 Use API Key",
                            command=self.use_api, width=16, height=2,
                            bg='#1f6feb', fg='white', font=('Segoe UI', 11, 'bold'),
                            relief='flat', cursor='hand2')
        api_btn.pack(side=tk.LEFT, padx=8)

        skip_btn = tk.Button(buttons_frame, text="⚡ Free APIs",
                             command=self.use_free, width=14, height=2,
                             bg='#6f42c1', fg='white', font=('Segoe UI', 11, 'bold'),
                             relief='flat', cursor='hand2')
        skip_btn.pack(side=tk.LEFT, padx=8)

        demo_btn = tk.Button(buttons_frame, text="🎮 Start Demo",
                             command=self.start_demo, width=14, height=2,
                             bg=accent, fg='white', font=('Segoe UI', 11, 'bold'),
                             relief='flat', cursor='hand2')
        demo_btn.pack(side=tk.LEFT, padx=8)

        # Cancel auto-fallback when any button is clicked
        for btn in (api_btn, skip_btn, demo_btn):
            btn.bind('<Button-1>', lambda e: self._cancel_auto())

        # API key input frame (immediately below buttons)
        input_frame = tk.Frame(content_frame, bg=bg_secondary)
        input_frame.pack(pady=8)

        tk.Label(input_frame, text="CoinMarketCap API Key:",
                 font=('Segoe UI', 12, 'bold'), bg=bg_secondary, fg=text_primary).pack()

        self.api_entry = tk.Entry(input_frame, width=50, font=('Segoe UI', 11),
                                  show="*", bg='#21262d', fg=text_primary,
                                  insertbackground=text_primary, relief='solid', bd=1)
        self.api_entry.pack(pady=8)
        if preset_api_key:
            self.api_entry.insert(0, preset_api_key)
        try:
            self.api_entry.focus_set()
        except Exception:
            pass
        # Cancel auto-fallback if the user starts typing
        self.api_entry.bind('<Key>', lambda e: self._cancel_auto())

        # Short instructions (compact)
        instructions = (
            "🔑 Use API Key for best real-time data (CoinMarketCap).\n"
            "⚡ Or choose Free APIs (CoinGecko/Binance).\n"
            "🎮 Demo works offline for testing."
        )
        instruction_label = tk.Label(content_frame, text=instructions,
                                     font=('Segoe UI', 11), bg=bg_secondary, fg=text_primary,
                                     justify=tk.LEFT, wraplength=520)
        instruction_label.pack(padx=16, pady=(6, 16))

    def start_demo(self):
        """Start in demo mode"""
        self.result = "DEMO"
        self.dialog.destroy()

    def use_api(self):
        """Use provided API key"""
        api_key = self.api_entry.get().strip()
        if api_key and len(api_key) > 10:
            self.result = api_key
            self.dialog.destroy()
        else:
            # Do not proceed; focus entry without warning until something typed
            try:
                self.api_entry.focus_set()
            except Exception:
                pass
            return

    def use_free(self):
        """Use free APIs"""
        self.result = "FREE"
        self.dialog.destroy()

    def _auto_choose_free_if_idle(self):
        # If user didn't choose within timeout, proceed with Free APIs
        if self.result is None and self.dialog.winfo_exists():
            self.result = "FREE"
            try:
                self.dialog.destroy()
            except Exception:
                pass

    def _cancel_auto(self):
        try:
            if self._auto_after_id is not None:
                self.dialog.after_cancel(self._auto_after_id)
                self._auto_after_id = None
        except Exception:
            pass


def main():
    """Main application entry point"""
    # If API key is provided via environment variable, skip the dialog
    preset_api = os.getenv('CMC_API_KEY')

    root = tk.Tk()
    try:
        root.attributes('-topmost', True)
    except Exception:
        pass

    api_key = None
    if not preset_api:
        # Show API setup dialog immediately (do not withdraw root)
        setup_dialog = APISetupDialog(root)
        root.wait_window(setup_dialog.dialog)

        # Determine API configuration
        if setup_dialog.result == "DEMO":
            api_key = None
        elif setup_dialog.result == "FREE":
            api_key = None
        elif setup_dialog.result and setup_dialog.result not in ["DEMO", "FREE"]:
            api_key = setup_dialog.result
        else:
            try:
                root.destroy()
            except Exception:
                pass
            return
    else:
        api_key = preset_api

    # Show main window
    try:
        root.deiconify()
        root.lift()
        root.focus_force()
        root.attributes('-topmost', False)
    except Exception:
        pass

    # Create application
    try:
        app = ModernCryptoTradingBot(root, api_key)

        # Handle window closing
        def on_closing():
            if messagebox.askokcancel("Quit", "Exit Crypto Trading Bot?"):
                app.stop_bot()
                root.quit()
                root.destroy()

        root.protocol("WM_DELETE_WINDOW", on_closing)

        # Start main loop
        root.mainloop()

    except KeyboardInterrupt:
        print("\n👋 Application stopped by user")
    except Exception as e:
        try:
            messagebox.showerror("Error", f"Failed to start application:\n{str(e)}")
        except Exception:
            print(f"Error: {e}")
        try:
            logging.exception("Startup error")
        except Exception:
            pass


class SignalAlertWindow:
    """Separate window to display actionable BUY signals with a mini chart."""

    def __init__(self, parent: tk.Tk, app: ModernCryptoTradingBot):
        self.parent = parent
        self.app = app

        # Create toplevel but keep hidden until opened explicitly
        self.top = tk.Toplevel(parent)
        self.top.title("🎯 Trade Signals")
        self.top.geometry("800x600")
        self.top.configure(bg=app.colors['bg_primary'])
        self.top.withdraw()
        self.top.protocol("WM_DELETE_WINDOW", self.hide)

        # Layout frames
        list_frame = tk.Frame(self.top, bg=app.colors['bg_secondary'])
        chart_frame = tk.Frame(self.top, bg=app.colors['bg_secondary'])
        list_frame.pack(side=tk.LEFT, fill=tk.Y, padx=10, pady=10)
        chart_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=10, pady=10)

        # Controls on list side
        header = tk.Label(list_frame, text=f"TP: +{app.tp_pct:.1f}%  SL: -{app.sl_pct:.1f}%",
                          bg=app.colors['bg_secondary'], fg=app.colors['text_primary'],
                          font=('Segoe UI', 10, 'bold'))
        header.pack(anchor='w', pady=(0, 6))

        columns = ("time", "symbol", "signal", "entry", "tp", "sl")
        self.tree = ttk.Treeview(list_frame, columns=columns, show='headings', height=20)
        for col, w in zip(columns, [110, 70, 70, 100, 100, 100]):
            self.tree.heading(col, text=col.upper())
            self.tree.column(col, width=w, anchor='center')
        self.tree.pack(fill=tk.Y, expand=False)
        self.tree.bind('<<TreeviewSelect>>', self.on_select)

        # Mini chart using matplotlib
        self.fig_sig = Figure(figsize=(5, 4), facecolor=app.colors['bg_secondary'])
        self.ax_sig = self.fig_sig.add_subplot(111)
        self.ax_sig.set_facecolor(app.colors['bg_tertiary'])
        self.canvas_sig = FigureCanvasTkAgg(self.fig_sig, master=chart_frame)
        self.canvas_sig.get_tk_widget().pack(fill=tk.BOTH, expand=True)

        # Storage for signals
        self._rows: list[dict] = []
        self._last_rendered: Optional[dict] = None

    def open(self):
        try:
            self.top.deiconify()
            self.top.lift()
        except Exception:
            pass

    def hide(self):
        try:
            self.top.withdraw()
        except Exception:
            pass

    def add_signal(self, symbol: str, signal: str, entry: float, tp: float, sl: float, ts: datetime):
        time_str = ts.strftime('%H:%M:%S')
        row = {
            'time': time_str,
            'symbol': symbol,
            'signal': signal,
            'entry': entry,
            'tp': tp,
            'sl': sl,
        }
        self._rows.append(row)
        self.tree.insert('', 'end', values=(time_str, symbol, signal, f"{entry:.6f}", f"{tp:.6f}", f"{sl:.6f}"))
        # Auto show and render chart for this signal
        self.open()
        self.render_chart(row)

    def on_select(self, event=None):
        sel = self.tree.selection()
        if not sel:
            return
        vals = self.tree.item(sel[0], 'values')
        if not vals or len(vals) < 6:
            return
        _, symbol, sig, entry, tp, sl = vals
        try:
            row = {
                'symbol': symbol,
                'signal': sig,
                'entry': float(entry),
                'tp': float(tp),
                'sl': float(sl),
            }
            self.render_chart(row)
        except Exception:
            pass

    def render_chart(self, row: dict):
        try:
            symbol = row['symbol']
            entry = float(row['entry'])
            tp = float(row['tp'])
            sl = float(row['sl'])
            side = row.get('signal', 'BUY').upper()
            df = self.app.data_manager.get_historical_data(symbol, hours=12)
            self.ax_sig.clear()
            if not df.empty:
                times = df.index
                prices = df['close']
                self.ax_sig.plot(times, prices, color='#00d4aa', linewidth=1.8, label=f'{symbol} Price')
                # Horizontal levels
                if side == 'BUY':
                    self.ax_sig.axhline(y=entry, color='#1f6feb', linestyle='--', linewidth=1.2, label=f'Entry {entry:.4f}')
                    self.ax_sig.axhline(y=tp, color='#238636', linestyle='--', linewidth=1.2, label=f'TP {tp:.4f}')
                    self.ax_sig.axhline(y=sl, color='#da3633', linestyle='--', linewidth=1.2, label=f'SL {sl:.4f}')
                else:
                    self.ax_sig.axhline(y=entry, color='#f59e0b', linestyle='--', linewidth=1.2, label=f'Entry {entry:.4f}')
                    self.ax_sig.axhline(y=tp, color='#238636', linestyle='--', linewidth=1.2, label=f'TP {tp:.4f}')
                    self.ax_sig.axhline(y=sl, color='#da3633', linestyle='--', linewidth=1.2, label=f'SL {sl:.4f}')
                self.ax_sig.set_title(f'{symbol} {side} Plan', color='white', fontsize=12, fontweight='bold')
                self.ax_sig.legend(loc='upper left')
                self.ax_sig.grid(True, alpha=0.25)
                self.ax_sig.tick_params(colors='white')
                self.ax_sig.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
            else:
                self.ax_sig.set_title(f'{symbol} {side} Plan (no data yet)', color='white')
            self.fig_sig.tight_layout()
            self.canvas_sig.draw()
        except Exception as e:
            # Non-fatal rendering error
            print(f"Signal window chart error: {e}")


if __name__ == "__main__":
    main()