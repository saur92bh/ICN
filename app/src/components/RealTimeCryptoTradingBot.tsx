import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, DollarSign, Activity, Settings, Play, Pause, BarChart3, Wifi, WifiOff, Zap, Edit3 } from 'lucide-react';

// Types
type SymbolKey = 'BTCUSDT' | 'ETHUSDT';

type Ticker = {
  symbol: SymbolKey;
  price: number;
  change24h: number;
  volume: number;
  lastUpdate: Date | null;
  istTime?: string | null;
  bid: number;
  ask: number;
};

type LiveData = Record<SymbolKey, Ticker>;

type Position = {
  id: number;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent?: number;
  timestamp: string;
  symbol: SymbolKey;
  stopLoss: number;
  takeProfit: number;
  reason: string;
  confidence: 'low' | 'medium' | 'high';
  rsi: string;
  entryTime: Date;
};

type Trade = {
  id: number;
  type: 'OPEN' | 'CLOSE';
  side: 'long' | 'short';
  size: number;
  price: number;
  timestamp: string;
  symbol: SymbolKey;
  pnl: number;
  pnlPercent?: string;
  reason: string;
  confidence?: 'low' | 'medium' | 'high';
  spread?: string;
  holdTime?: string;
};

type Stats = {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  largestWin: number;
  largestLoss: number;
};

type SettingsState = {
  maxRiskPerTrade: number;
  maxPositions: number;
  profitTarget: number;
  stopLoss: number;
  selectedPair: SymbolKey;
  tradingInterval: number; // seconds
};

type ApiConfig = {
  exchange: 'binance' | 'bybit' | 'okx';
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
};

const RealTimeCryptoTradingBot: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [balance, setBalance] = useState(1000);
  const [initialBalance, setInitialBalance] = useState(1000);
  const [showBalanceEdit, setShowBalanceEdit] = useState(false);
  const [tempBalance, setTempBalance] = useState('1000');
  const [dailyProfit, setDailyProfit] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [apiStatus, setApiStatus] = useState('Connecting...');
  const [connectionStatus, setConnectionStatus] = useState('Connecting to live markets...');
  const [lastDataUpdate, setLastDataUpdate] = useState<Date | null>(null);
  const [marketAnalysis, setMarketAnalysis] = useState('');
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [apiConfig, setApiConfig] = useState<ApiConfig>({ exchange: 'binance', apiKey: '', apiSecret: '', passphrase: '' });
  const [realTrading, setRealTrading] = useState(false);
  const [futuresEnabled, setFuturesEnabled] = useState(false);
  const [investPerTradeUSD, setInvestPerTradeUSD] = useState(10);
  const [profitGoalUSD, setProfitGoalUSD] = useState(20);
  const [leverage, setLeverage] = useState(10);
  const [autoStopOnGoal, setAutoStopOnGoal] = useState(true);

  const [liveData, setLiveData] = useState<LiveData>({
    BTCUSDT: { symbol: 'BTCUSDT', price: 0, change24h: 0, volume: 0, lastUpdate: null, bid: 0, ask: 0, istTime: null },
    ETHUSDT: { symbol: 'ETHUSDT', price: 0, change24h: 0, volume: 0, lastUpdate: null, bid: 0, ask: 0, istTime: null }
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [settings, setSettings] = useState<SettingsState>({
    maxRiskPerTrade: 2,
    maxPositions: 3,
    profitTarget: 1.5,
    stopLoss: 1.0,
    selectedPair: 'BTCUSDT',
    tradingInterval: 15,
  });

  const [realTimeStats, setRealTimeStats] = useState<Stats>({
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    avgWin: 0,
    avgLoss: 0,
    largestWin: 0,
    largestLoss: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<number | null>(null);
  const analysisRef = useRef<number | null>(null);
  const priceHistoryRef = useRef<Record<SymbolKey, number[]>>({ BTCUSDT: [], ETHUSDT: [] });
  const apiIntervalRef = useRef<number | null>(null);

  // Get current time in IST
  const getCurrentIST = () => new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });

  // Balance management
  const handleBalanceEdit = () => { setTempBalance(balance.toString()); setShowBalanceEdit(true); };
  const saveBalance = () => {
    const newBalance = parseFloat(tempBalance);
    if (newBalance > 0 && newBalance <= 1000000) {
      setBalance(newBalance); setInitialBalance(newBalance); setDailyProfit(0); setTotalProfit(0); setShowBalanceEdit(false);
      setTrades([]); setPositions([]); setRealTimeStats({ totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0, avgWin: 0, avgLoss: 0, largestWin: 0, largestLoss: 0 });
    } else { alert('Please enter a valid balance between $1 and $1,000,000'); }
  };
  const cancelBalanceEdit = () => { setShowBalanceEdit(false); setTempBalance(balance.toString()); };

  // API key connect (to backend proxy)
  const connectExchange = async () => {
    try {
      setApiStatus('Connecting to exchange...');
      const res = await fetch('/api/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(apiConfig) });
      if (!res.ok) throw new Error('Auth failed');
      const json = await res.json();
      setApiStatus(`✅ ${json.exchange.toUpperCase()} Connected`);
    } catch (e: any) {
      setApiStatus(`❌ Connection failed: ${e.message}`);
    }
  };

  // Real-time API data fetcher (public)
  const fetchRealTimeData = async () => {
    try {
      setApiStatus(prev => prev.startsWith('✅') ? prev : 'Fetching live data...');
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_last_updated_at=true');
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      const data = await response.json();
      const now = new Date();
      const istTime = getCurrentIST();
      const newData: LiveData = {
        BTCUSDT: { symbol: 'BTCUSDT', price: data.bitcoin?.usd || 0, change24h: data.bitcoin?.usd_24h_change || 0, volume: data.bitcoin?.usd_24h_vol || 0, lastUpdate: now, istTime, bid: (data.bitcoin?.usd || 0) * 0.9995, ask: (data.bitcoin?.usd || 0) * 1.0005 },
        ETHUSDT: { symbol: 'ETHUSDT', price: data.ethereum?.usd || 0, change24h: data.ethereum?.usd_24h_change || 0, volume: data.ethereum?.usd_24h_vol || 0, lastUpdate: now, istTime, bid: (data.ethereum?.usd || 0) * 0.9995, ask: (data.ethereum?.usd || 0) * 1.0005 },
      };
      setLiveData(newData);
      if (newData.BTCUSDT.price > 0) {
        priceHistoryRef.current.BTCUSDT.push(newData.BTCUSDT.price);
        if (priceHistoryRef.current.BTCUSDT.length > 200) priceHistoryRef.current.BTCUSDT = priceHistoryRef.current.BTCUSDT.slice(-200);
      }
      if (newData.ETHUSDT.price > 0) {
        priceHistoryRef.current.ETHUSDT.push(newData.ETHUSDT.price);
        if (priceHistoryRef.current.ETHUSDT.length > 200) priceHistoryRef.current.ETHUSDT = priceHistoryRef.current.ETHUSDT.slice(-200);
      }
      setLastDataUpdate(now); setIsConnected(true); setConnectionStatus(`LIVE - ${istTime}`);
    } catch (error: any) {
      console.error('Live data fetch error:', error);
      setApiStatus(`❌ Error: ${error.message}`);
      setIsConnected(false);
    }
  };

  // WebSocket connection (public)
  const connectWebSocket = () => {
    try {
      if (wsRef.current) wsRef.current.close();
      const wsUrl = 'wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker';
      wsRef.current = new WebSocket(wsUrl);
      wsRef.current.onopen = () => { setConnectionStatus('LIVE WebSocket Connected'); };
      wsRef.current.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          const data = packet?.data || packet; // handle multiplexed format
          const symbol = (data.s as SymbolKey) || undefined;
          const price = parseFloat(data.c);
          const change24h = parseFloat(data.P);
          const volume = parseFloat(data.v);
          if (symbol && price) {
            const now = new Date();
            const istTime = getCurrentIST();
            setLiveData(prev => ({ ...prev, [symbol]: { symbol, price, change24h, volume, lastUpdate: now, istTime, bid: price * 0.9995, ask: price * 1.0005 } }));
            priceHistoryRef.current[symbol].push(price);
            if (priceHistoryRef.current[symbol].length > 300) priceHistoryRef.current[symbol] = priceHistoryRef.current[symbol].slice(-300);
            setLastDataUpdate(now); setIsConnected(true);
          }
        } catch (err) { console.error('WebSocket parse error', err); }
      };
      wsRef.current.onclose = () => { setConnectionStatus('Reconnecting...'); setTimeout(connectWebSocket, 5000); };
      wsRef.current.onerror = () => { setConnectionStatus('WebSocket Error'); };
    } catch (e) { setConnectionStatus('Connection Failed'); }
  };

  // Indicators
  const calculateTechnicalIndicators = (prices: number[]) => {
    if (prices.length < 26) return { sma20: 0, rsi: 50, macd: 0, signal: 'neutral' as const };
    const sma20 = prices.slice(-20).reduce((s, p) => s + p, 0) / 20;
    let gains = 0, losses = 0;
    for (let i = prices.length - 14; i < prices.length; i++) { const ch = prices[i] - prices[i - 1]; if (ch > 0) gains += ch; else losses -= ch; }
    const avgGain = gains / 14; const avgLoss = Math.max(1e-9, losses / 14);
    const rsi = 100 - 100 / (1 + (avgGain / avgLoss));
    const ema = (arr: number[], len: number) => {
      const k = 2 / (len + 1); let emaVal = arr[arr.length - len];
      for (let i = arr.length - len + 1; i < arr.length; i++) emaVal = arr[i] * k + emaVal * (1 - k);
      return emaVal;
    };
    const macd = ema(prices, 12) - ema(prices, 26);
    let signal: 'neutral' | 'strong_buy' | 'strong_sell' | 'buy' | 'sell' = 'neutral';
    if (rsi < 30 && macd > 0) signal = 'strong_buy';
    else if (rsi > 70 && macd < 0) signal = 'strong_sell';
    else if (rsi < 40) signal = 'buy';
    else if (rsi > 60) signal = 'sell';
    return { sma20, rsi, macd, signal };
  };

  const analyzeMarket = () => {
    const btcPrices = priceHistoryRef.current.BTCUSDT;
    const ethPrices = priceHistoryRef.current.ETHUSDT;
    if (btcPrices.length < 20) { setMarketAnalysis('Gathering live market data for analysis...'); return; }
    const btcInd = calculateTechnicalIndicators(btcPrices);
    const ethInd = calculateTechnicalIndicators(ethPrices);
    const btcData = liveData.BTCUSDT; const ethData = liveData.ETHUSDT;
    const btcVolatility = Math.abs(btcData.change24h);
    const risk: 'low' | 'medium' | 'high' = btcVolatility > 8 ? 'high' : btcVolatility < 3 ? 'low' : 'medium';
    setRiskLevel(risk);
    const currentTime = getCurrentIST();
    const analysis = `LIVE MARKET ANALYSIS - ${currentTime}\n\nBTC/USDT: $${btcData.price.toLocaleString()} (${btcData.change24h >= 0 ? '+' : ''}${btcData.change24h.toFixed(2)}%)\nETH/USDT: $${ethData.price.toLocaleString()} (${ethData.change24h >= 0 ? '+' : ''}${ethData.change24h.toFixed(2)}%)\n\nBTC RSI: ${btcInd.rsi.toFixed(1)} | Signal: ${btcInd.signal.toUpperCase()}\nETH RSI: ${ethInd.rsi.toFixed(1)} | Signal: ${ethInd.signal.toUpperCase()}\nBTC SMA20: $${btcInd.sma20.toFixed(2)}\nRisk: ${risk.toUpperCase()}\n\nPair: ${settings.selectedPair} | Spread: $${(liveData[settings.selectedPair].ask - liveData[settings.selectedPair].bid).toFixed(2)} | Volume (24h): $${(btcData.volume / 1_000_000).toFixed(0)}M\n`;
    setMarketAnalysis(analysis);
  };

  const executeTrade = async () => {
    if (!isActive || !isConnected || positions.length >= settings.maxPositions || balance < 10) return;
    // Stop automatically if goal reached
    if (futuresEnabled && autoStopOnGoal && totalProfit >= profitGoalUSD) { setIsActive(false); return; }
    const currentData = liveData[settings.selectedPair];
    const prices = priceHistoryRef.current[settings.selectedPair];
    if (!currentData?.price || prices.length < 30) return;
    const indicators = calculateTechnicalIndicators(prices);
    const currentPrice = currentData.price; const spread = currentData.ask - currentData.bid;
    const rsiOversold = indicators.rsi < 30; const rsiOverbought = indicators.rsi > 70;
    const priceAboveSMA = currentPrice > indicators.sma20; const priceBelowSMA = currentPrice < indicators.sma20;
    const strongVolume = Math.abs(currentData.change24h) > 3;
    let shouldTrade = false; let side: 'long' | 'short' = 'long'; let confidence: 'low' | 'medium' | 'high' = 'medium'; let reason = 'Technical Signal';
    if (indicators.signal === 'strong_buy' && priceAboveSMA) { shouldTrade = true; side = 'long'; confidence = 'high'; reason = 'Strong Bull Signal + SMA Break'; }
    else if (indicators.signal === 'strong_sell' && priceBelowSMA) { shouldTrade = true; side = 'short'; confidence = 'high'; reason = 'Strong Bear Signal + SMA Break'; }
    else if (rsiOversold && strongVolume) { shouldTrade = true; side = 'long'; confidence = 'medium'; reason = 'RSI Oversold + Volume'; }
    else if (rsiOverbought && strongVolume) { shouldTrade = true; side = 'short'; confidence = 'medium'; reason = 'RSI Overbought + Volume'; }
    else if (Math.random() > 0.85 && strongVolume) { shouldTrade = true; side = currentData.change24h > 0 ? 'long' : 'short'; confidence = 'low'; reason = 'Volatility Play'; }
    if (!shouldTrade) return;
    const riskAmount = balance * (settings.maxRiskPerTrade / 100);
    const confMultiplier = confidence === 'high' ? 1.5 : confidence === 'medium' ? 1.0 : 0.6;
    const riskMultiplier = riskLevel === 'low' ? 1.3 : riskLevel === 'high' ? 0.7 : 1.0;
    const adjustedRisk = riskAmount * confMultiplier * riskMultiplier;
    // Position sizing
    const simSize = adjustedRisk / currentPrice;
    const size = futuresEnabled ? (investPerTradeUSD * leverage) / currentPrice : simSize;
    const entryPrice = side === 'long' ? currentData.ask : currentData.bid;
    const atr = priceHistoryRef.current[settings.selectedPair].slice(-10).reduce((sum, price, i, arr) => i === 0 ? sum : sum + Math.abs(price - arr[i-1]), 0) / 9;
    // Futures TP/SL derived from dollar targets if futures mode
    const dynamicSL = futuresEnabled ? 0 : Math.max(settings.stopLoss / 100, (atr / currentPrice) * 2);
    const dynamicTP = futuresEnabled ? 0 : Math.max(settings.profitTarget / 100, (atr / currentPrice) * 3);
    // Compute TP/SL prices for futures using dollar targets
    let takeProfit = 0; let stopLoss = 0;
    if (futuresEnabled) {
      const remainingGoal = Math.max(0, profitGoalUSD - totalProfit);
      const perTradeTargetUSD = Math.max(1, Math.min(remainingGoal, profitGoalUSD));
      const tpDiff = perTradeTargetUSD / size; // price delta to realize target USD
      const riskUSD = investPerTradeUSD * 0.5; // 50% margin at risk by default
      const slDiff = riskUSD / size;
      takeProfit = side === 'long' ? entryPrice + tpDiff : entryPrice - tpDiff;
      stopLoss = side === 'long' ? entryPrice - slDiff : entryPrice + slDiff;
    } else {
      takeProfit = side === 'long' ? entryPrice * (1 + dynamicTP) : entryPrice * (1 - dynamicTP);
      stopLoss = side === 'long' ? entryPrice * (1 - dynamicSL) : entryPrice * (1 + dynamicSL);
    }
    const newPosition: Position = { id: Date.now() + Math.random(), side, size, entryPrice, currentPrice, pnl: 0, timestamp: getCurrentIST(), symbol: settings.selectedPair, stopLoss, takeProfit, reason, confidence, rsi: indicators.rsi.toFixed(1), entryTime: new Date() } as Position;

    if (realTrading && futuresEnabled) {
      try {
        const resp = await fetch('/api/futures/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: settings.selectedPair, side, investUSD: investPerTradeUSD, leverage, price: entryPrice }) });
        const j = await resp.json();
        if (!resp.ok || !j.ok) { console.warn('Futures order failed', j); }
      } catch (err) { console.warn('Futures order error', err); }
    } else if (realTrading) {
      try {
        const resp = await fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: settings.selectedPair, side, quantity: size }) });
        const j = await resp.json();
        if (!resp.ok || !j.ok) {
          console.warn('Order failed', j);
        }
      } catch (err) {
        console.warn('Order error', err);
      }
    }

    setPositions(prev => [...prev, newPosition]);
    const trade: Trade = { id: Date.now() + Math.random(), type: 'OPEN', side, size, price: entryPrice, timestamp: getCurrentIST(), symbol: settings.selectedPair, pnl: 0, reason, confidence, spread: spread.toFixed(2) };
    setTrades(prev => [trade, ...prev.slice(0, 99)]);
  };

  // Update positions on price
  useEffect(() => {
    if (positions.length === 0) return;
    setPositions(prev => prev.map(pos => {
      const currentData = liveData[pos.symbol]; if (!currentData?.price) return pos;
      const currentPrice = pos.side === 'long' ? currentData.bid : currentData.ask;
      const priceDiff = currentPrice - pos.entryPrice;
      const pnl = pos.side === 'long' ? (priceDiff / pos.entryPrice) * pos.size * pos.entryPrice : -(priceDiff / pos.entryPrice) * pos.size * pos.entryPrice;
      const pnlPercent = (pnl / (pos.size * pos.entryPrice)) * 100;
      const hitSL = (pos.side === 'long' && currentPrice <= pos.stopLoss) || (pos.side === 'short' && currentPrice >= pos.stopLoss);
      const hitTP = (pos.side === 'long' && currentPrice >= pos.takeProfit) || (pos.side === 'short' && currentPrice <= pos.takeProfit);
      if (hitSL || hitTP) {
        setBalance(prev => prev + pnl); setDailyProfit(prev => prev + pnl); setTotalProfit(prev => prev + pnl);
        setRealTimeStats(prev => { const total = prev.totalTrades + 1; const wins = pnl > 0 ? prev.winningTrades + 1 : prev.winningTrades; const losses = pnl < 0 ? prev.losingTrades + 1 : prev.losingTrades; const winRate = total > 0 ? (wins / total) * 100 : 0; return { totalTrades: total, winningTrades: wins, losingTrades: losses, winRate, avgWin: wins > 0 ? (prev.avgWin * (wins - 1) + (pnl > 0 ? pnl : 0)) / wins : 0, avgLoss: losses > 0 ? (prev.avgLoss * (losses - 1) + (pnl < 0 ? Math.abs(pnl) : 0)) / losses : 0, largestWin: Math.max(prev.largestWin, pnl > 0 ? pnl : 0), largestLoss: Math.max(prev.largestLoss, pnl < 0 ? Math.abs(pnl) : 0) }; });
        const holdTime = ((Date.now() - pos.entryTime.getTime()) / 60000).toFixed(1);
        const exitReason = hitTP ? 'Take Profit' : 'Stop Loss';
        const closeTrade: Trade = { id: Date.now() + Math.random(), type: 'CLOSE', side: pos.side, size: pos.size, price: currentPrice, timestamp: getCurrentIST(), symbol: pos.symbol, pnl, pnlPercent: pnlPercent.toFixed(2), reason: exitReason, holdTime: `${holdTime}min` };
        setTrades(prev => [closeTrade, ...prev.slice(0, 99)]);
        return null as unknown as Position; // filtered out
      }
      return { ...pos, currentPrice, pnl, pnlPercent };
    }).filter(Boolean) as Position[]);
  }, [liveData]);

  // Initialize
  useEffect(() => {
    fetchRealTimeData();
    apiIntervalRef.current = window.setInterval(fetchRealTimeData, 30000) as unknown as number;
    setTimeout(connectWebSocket, 1000);
    return () => { if (apiIntervalRef.current) clearInterval(apiIntervalRef.current); if (wsRef.current) wsRef.current.close(); };
  }, []);

  useEffect(() => {
    if (isActive && isConnected && liveData.BTCUSDT.price > 0) {
      intervalRef.current = window.setInterval(executeTrade, settings.tradingInterval * 1000) as unknown as number;
      analysisRef.current = window.setInterval(analyzeMarket, 60000) as unknown as number;
      setTimeout(analyzeMarket, 2000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (analysisRef.current) clearInterval(analysisRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); if (analysisRef.current) clearInterval(analysisRef.current); };
  }, [isActive, isConnected, liveData.BTCUSDT.price, settings.tradingInterval]);

  const toggleBot = () => {
    if (!isActive && (!isConnected || liveData.BTCUSDT.price === 0)) { alert('Waiting for live market data connection.'); return; }
    setIsActive(v => !v);
  };

  const totalPnL = positions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);
  const roi = initialBalance > 0 ? (((balance - initialBalance) / initialBalance) * 100).toFixed(2) : '0.00';

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-400" />
            Live Crypto Trading Bot
            <span className="text-sm bg-red-600 px-2 py-1 rounded animate-pulse">LIVE</span>
            <span className="text-xs bg-green-600 px-2 py-1 rounded">IST {getCurrentIST().split(' ')[1]}</span>
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-gray-800 px-3 py-2 rounded-lg">
              {isConnected ? <Wifi className="w-5 h-5 text-green-400" /> : <WifiOff className="w-5 h-5 text-red-400" />}
              <div className="text-sm">
                <div className="text-white">{connectionStatus}</div>
                <div className="text-gray-400">{apiStatus}</div>
              </div>
            </div>
            <button onClick={toggleBot} disabled={!isConnected || liveData.BTCUSDT.price === 0} className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all ${(!isConnected || liveData.BTCUSDT.price === 0) ? 'bg-gray-600 cursor-not-allowed' : isActive ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
              {isActive ? (<><Pause className="w-5 h-5" />Stop</>) : (<><Play className="w-5 h-5" />Start</>)}
              {isActive && <Zap className="w-4 h-4 animate-pulse" />}
            </button>
          </div>
        </div>

        {/* API Connection Panel */}
        <div className="bg-gray-800 p-4 rounded-xl mb-6">
          <h2 className="text-lg font-semibold mb-3">Exchange Connection</h2>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-1">
              <label className="text-xs text-gray-400">Exchange</label>
              <select value={apiConfig.exchange} onChange={e => setApiConfig(prev => ({ ...prev, exchange: e.target.value as ApiConfig['exchange'] }))} className="w-full mt-1 bg-gray-700 text-white p-2 rounded">
                <option value="binance">Binance</option>
                <option value="bybit">Bybit</option>
                <option value="bitget">Bitget</option>
                <option value="bingx">BingX</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400">API Key</label>
              <input value={apiConfig.apiKey} onChange={e => setApiConfig(p => ({ ...p, apiKey: e.target.value }))} placeholder="Enter API Key" className="w-full mt-1 bg-gray-700 text-white p-2 rounded" />
            </div>
            <div>
              <label className="text-xs text-gray-400">API Secret</label>
              <input value={apiConfig.apiSecret} onChange={e => setApiConfig(p => ({ ...p, apiSecret: e.target.value }))} placeholder="Enter API Secret" className="w-full mt-1 bg-gray-700 text-white p-2 rounded" />
            </div>
            <div>
              <label className="text-xs text-gray-400">Passphrase (if required)</label>
              <input value={apiConfig.passphrase} onChange={e => setApiConfig(p => ({ ...p, passphrase: e.target.value }))} placeholder="Bitget passphrase (if set)" className="w-full mt-1 bg-gray-700 text-white p-2 rounded" />
            </div>
            <div className="flex items-end"><button onClick={connectExchange} className="w-full bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded">Connect</button></div>
            <div className="flex items-center mt-6 gap-2"><input id="realTrade" type="checkbox" checked={realTrading} onChange={() => setRealTrading(v => !v)} className="accent-red-500" /><label htmlFor="realTrade" className="text-xs">Enable Real Trading (Market Orders)</label></div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Supported: Binance, Bybit, Bitget, BingX. Keys are used only via your local backend with ccxt. Use at your own risk.</p>
        </div>

        {/* The rest is your original UI, trimmed to fit brevity where possible */}
        {/* Live Market Data */}
        <div className="bg-gray-800 p-6 rounded-xl mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">Live Market Data - {getCurrentIST()}<span className="text-xs bg-red-600 px-2 py-1 rounded animate-pulse">REAL-TIME</span></h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(['BTCUSDT','ETHUSDT'] as SymbolKey[]).map(sym => (
              <div key={sym} className={`bg-gray-700 p-5 rounded-lg border-l-4 ${sym === 'BTCUSDT' ? 'border-orange-500' : 'border-blue-500'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`font-bold ${sym === 'BTCUSDT' ? 'text-orange-400' : 'text-blue-400'}`}>{sym === 'BTCUSDT' ? 'Bitcoin (BTC/USDT)' : 'Ethereum (ETH/USDT)'}</h3>
                  <div className="text-sm text-gray-400">{liveData[sym].lastUpdate && <div>Last: {liveData[sym].istTime}</div>}</div>
                </div>
                <p className="text-3xl font-bold">${liveData[sym].price.toLocaleString()}</p>
                <div className="flex items-center gap-4 mt-2">
                  <p className={`text-lg font-medium ${liveData[sym].change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>24h: {liveData[sym].change24h >= 0 ? '+' : ''}{liveData[sym].change24h.toFixed(2)}%</p>
                  <p className="text-sm text-gray-400">Vol: ${(liveData[sym].volume / 1_000_000_000).toFixed(2)}B</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-gray-800 p-2 rounded"><span className="text-gray-400">Bid:</span><span className="text-green-400 ml-1">${liveData[sym].bid.toFixed(2)}</span></div>
                  <div className="bg-gray-800 p-2 rounded"><span className="text-gray-400">Ask:</span><span className="text-red-400 ml-1">${liveData[sym].ask.toFixed(2)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-gray-800 p-4 rounded-xl"><div className="flex items-center justify-between"><div className="flex-1"><p className="text-gray-400 text-sm">Trading Balance</p>{showBalanceEdit ? (<div className="flex items-center gap-2 mt-1"><input type="number" value={tempBalance} onChange={(e) => setTempBalance(e.target.value)} className="w-24 bg-gray-700 text-white px-2 py-1 rounded text-sm" min={1} max={1000000} /><button onClick={saveBalance} className="bg-green-600 px-2 py-1 rounded text-xs">✓</button><button onClick={cancelBalanceEdit} className="bg-red-600 px-2 py-1 rounded text-xs">✗</button></div>) : (<div className="flex items-center gap-2"><p className="text-xl font-bold text-green-400">${balance.toFixed(2)}</p><button onClick={handleBalanceEdit} className="text-gray-400 hover:text-white" title="Edit Balance"><Edit3 className="w-4 h-4" /></button></div>)}</div><DollarSign className="w-6 h-6 text-green-400" /></div></div>
          <div className="bg-gray-800 p-4 rounded-xl"><div className="flex items-center justify-between"><div><p className="text-gray-400 text-sm">Daily P&L</p><p className={`text-xl font-bold ${dailyProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>${dailyProfit.toFixed(2)}</p></div><TrendingUp className="w-6 h-6 text-blue-400" /></div></div>
          <div className="bg-gray-800 p-4 rounded-xl"><div className="flex items-center justify-between"><div><p className="text-gray-400 text-sm">Total P&L</p><p className={`text-xl font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>${totalProfit.toFixed(2)}</p></div><BarChart3 className="w-6 h-6 text-purple-400" /></div></div>
          <div className="bg-gray-800 p-4 rounded-xl"><div className="flex items-center justify-between"><div><p className="text-gray-400 text-sm">ROI</p><p className={`text-xl font-bold ${parseFloat(roi) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{roi}%</p></div><Activity className="w-6 h-6 text-yellow-400" /></div></div>
          <div className="bg-gray-800 p-4 rounded-xl"><div className="flex items-center justify-between"><div><p className="text-gray-400 text-sm">Win Rate</p><p className="text-xl font-bold text-cyan-400">{realTimeStats.winRate.toFixed(1)}%</p></div><Activity className="w-6 h-6 text-cyan-400" /></div></div>
          <div className="bg-gray-800 p-4 rounded-xl"><div className="flex items-center justify-between"><div><p className="text-gray-400 text-sm">Active Positions</p><p className="text-xl font-bold text-orange-400">{positions.length}/{settings.maxPositions}</p></div><Activity className="w-6 h-6 text-orange-400" /></div></div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-gray-800 p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-400" />Live Market Analysis<span className={`${riskLevel === 'low' ? 'bg-green-600' : riskLevel === 'medium' ? 'bg-yellow-600' : 'bg-red-600'} px-2 py-1 rounded text-xs font-medium`}>{riskLevel.toUpperCase()} RISK</span><span className="text-xs bg-purple-600 px-2 py-1 rounded animate-pulse">REAL-TIME IST</span></h2>
            <div className="bg-gray-900 p-4 rounded-lg border border-gray-700">
              <pre className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-mono">{marketAnalysis || `Connecting to live market data...\n\nAPI Status: ${apiStatus}\nTime: ${getCurrentIST()}\nWebSocket: ${isConnected ? 'Connected' : 'Connecting...'}\n\nWaiting for real-time price data...`}</pre>
              {lastDataUpdate && (<div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-700 text-xs text-gray-500"><span>Last update: {lastDataUpdate.toLocaleTimeString()} IST</span><span>Pair: {settings.selectedPair}</span></div>)}
            </div>
          </div>
          <div className="bg-gray-800 p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><Settings className="w-5 h-5 text-gray-400" />Live Trading Settings</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Enable Futures (USD-M)</span>
                <label className="inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={futuresEnabled} onChange={() => setFuturesEnabled(v => !v)} />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:w-5 after:h-5 after:bg-white after:rounded-full after:transition-all peer-checked:bg-green-600"></div>
                </label>
              </div>
              {futuresEnabled && (
                <div className="grid grid-cols-1 gap-3 bg-gray-900 p-3 rounded border border-gray-700">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-400">Invest per trade ($)</label>
                    <input type="number" min={5} max={100000} value={investPerTradeUSD} onChange={e => setInvestPerTradeUSD(parseFloat(e.target.value || '0'))} className="w-28 bg-gray-700 text-white p-2 rounded text-right" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-400">Profit goal ($)</label>
                    <input type="number" min={1} max={100000} value={profitGoalUSD} onChange={e => setProfitGoalUSD(parseFloat(e.target.value || '0'))} className="w-28 bg-gray-700 text-white p-2 rounded text-right" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-400">Leverage</label>
                    <input type="number" min={1} max={125} value={leverage} onChange={e => setLeverage(parseInt(e.target.value || '1'))} className="w-28 bg-gray-700 text-white p-2 rounded text-right" />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-gray-400">Auto-stop on goal</label>
                    <input type="checkbox" checked={autoStopOnGoal} onChange={() => setAutoStopOnGoal(v => !v)} />
                  </div>
                  <div className="text-xs text-gray-400">
                    Est. size: {(investPerTradeUSD * leverage / Math.max(1, liveData[settings.selectedPair].price)).toFixed(6)} {settings.selectedPair.replace('USDT','')}
                  </div>
                  <div className="w-full bg-gray-800 rounded h-2 overflow-hidden">
                    <div className="bg-green-500 h-2" style={{ width: `${Math.min(100, (totalProfit / Math.max(1, profitGoalUSD)) * 100)}%` }} />
                  </div>
                  <div className="text-xs text-gray-400">Goal progress: ${totalProfit.toFixed(2)} / ${profitGoalUSD.toFixed(2)}</div>
                </div>
              )}
              <div>
                <label className="text-sm text-gray-400">Trading Pair</label>
                <select value={settings.selectedPair} onChange={(e) => setSettings(prev => ({...prev, selectedPair: e.target.value as SymbolKey}))} className="w-full mt-1 bg-gray-700 text-white p-2 rounded">
                  <option value="BTCUSDT">BTC/USDT - ${liveData.BTCUSDT.price.toFixed(0)}</option>
                  <option value="ETHUSDT">ETH/USDT - ${liveData.ETHUSDT.price.toFixed(0)}</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 flex justify-between"><span>Risk Per Trade</span><span className="text-blue-400">{settings.maxRiskPerTrade}%</span></label>
                <input type="range" min={0.1} max={10} step={0.1} value={settings.maxRiskPerTrade} onChange={(e) => setSettings(prev => ({...prev, maxRiskPerTrade: parseFloat(e.target.value)}))} className="w-full mt-1" />
                <div className="text-xs text-gray-500 mt-1">Risk Amount: ${(balance * settings.maxRiskPerTrade / 100).toFixed(2)}</div>
              </div>
              <div>
                <label className="text-sm text-gray-400 flex justify-between"><span>Take Profit</span><span className="text-green-400">{settings.profitTarget}%</span></label>
                <input type="range" min={0.1} max={10} step={0.1} value={settings.profitTarget} onChange={(e) => setSettings(prev => ({...prev, profitTarget: parseFloat(e.target.value)}))} className="w-full mt-1" />
              </div>
              <div>
                <label className="text-sm text-gray-400 flex justify-between"><span>Stop Loss</span><span className="text-red-400">{settings.stopLoss}%</span></label>
                <input type="range" min={0.1} max={5} step={0.1} value={settings.stopLoss} onChange={(e) => setSettings(prev => ({...prev, stopLoss: parseFloat(e.target.value)}))} className="w-full mt-1" />
              </div>
              <div>
                <label className="text-sm text-gray-400 flex justify-between"><span>Trade Interval</span><span className="text-purple-400">{settings.tradingInterval}s</span></label>
                <input type="range" min={5} max={60} step={5} value={settings.tradingInterval} onChange={(e) => setSettings(prev => ({...prev, tradingInterval: parseInt(e.target.value)}))} className="w-full mt-1" />
              </div>
              <div>
                <label className="text-sm text-gray-400 flex justify-between"><span>Max Positions</span><span className="text-cyan-400">{settings.maxPositions}</span></label>
                <input type="range" min={1} max={10} step={1} value={settings.maxPositions} onChange={(e) => setSettings(prev => ({...prev, maxPositions: parseInt(e.target.value)}))} className="w-full mt-1" />
              </div>
              <div className="mt-4 p-3 bg-gray-900 rounded">
                <h4 className="text-sm font-semibold mb-2">Live Status</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span>Connection:</span><span className={isConnected ? 'text-green-400' : 'text-red-400'}>{isConnected ? 'LIVE' : 'CONNECTING'}</span></div>
                  <div className="flex justify-between"><span>Trading:</span><span className={isActive ? 'text-green-400' : 'text-yellow-400'}>{isActive ? 'ACTIVE' : 'PAUSED'}</span></div>
                  <div className="flex justify-between"><span>Data Source:</span><span className="text-blue-400">Real APIs</span></div>
                  <div className="flex justify-between"><span>Time Zone:</span><span className="text-purple-400">IST</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Positions and Trades */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div className="bg-gray-800 p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4 flex items-center justify-between"><span>Live Positions ({positions.length})</span>{totalPnL !== 0 && (<span className={`text-sm px-2 py-1 rounded ${totalPnL >= 0 ? 'bg-green-600' : 'bg-red-600'}`}>Unrealized: ${totalPnL.toFixed(2)}</span>)}</h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {positions.length === 0 ? (
                <div className="text-gray-500 text-center py-12"><Activity className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">No Active Positions</p><p className="text-xs mt-1">Start live trading to see positions here</p><p className="text-xs text-blue-400 mt-2">Balance Available: ${balance.toFixed(2)}</p></div>
              ) : (
                positions.map(pos => (
                  <div key={pos.id} className="bg-gray-700 p-4 rounded-lg border-l-4 border-blue-500">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <p className="font-medium flex items-center gap-2">{pos.side === 'long' ? <TrendingUp className="w-4 h-4 text-green-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}<span className={pos.side === 'long' ? 'text-green-400' : 'text-red-400'}>{pos.side.toUpperCase()}</span>{pos.symbol}<span className={`text-xs px-1 py-0.5 rounded ${pos.confidence === 'high' ? 'bg-green-600' : pos.confidence === 'medium' ? 'bg-yellow-600' : 'bg-gray-600'}`}>{pos.confidence}</span></p>
                        <div className="text-xs text-gray-400 mt-1 grid grid-cols-2 gap-2"><div>Entry: ${pos.entryPrice.toFixed(2)}</div><div>Current: ${pos.currentPrice.toFixed(2)}</div><div>Size: {pos.size.toFixed(4)}</div><div>RSI: {pos.rsi}</div></div>
                      </div>
                      <div className="text-right ml-4"><p className={`font-bold text-lg ${(pos.pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>${(pos.pnl || 0).toFixed(2)}</p><p className={`text-sm ${(pos.pnlPercent || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{(pos.pnlPercent || 0).toFixed(2)}%</p><p className="text-xs text-gray-400">{pos.timestamp}</p></div>
                    </div>
                    <div className="text-xs text-gray-500 border-t border-gray-600 pt-2"><div className="flex justify-between"><span>{pos.reason}</span><span>TP: ${pos.takeProfit.toFixed(2)} | SL: ${pos.stopLoss.toFixed(2)}</span></div></div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="bg-gray-800 p-6 rounded-xl">
            <h2 className="text-xl font-semibold mb-4 flex items-center justify-between"><span>Live Trade History</span><div className="text-sm text-gray-400"><div>Total: {realTimeStats.totalTrades}</div><div className="text-green-400">Win: {realTimeStats.winRate.toFixed(1)}%</div></div></h2>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {trades.length === 0 ? (
                <div className="text-gray-500 text-center py-12"><BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">No Trades Yet</p><p className="text-xs mt-1">Live trading history will appear here</p><p className="text-xs text-green-400 mt-2">Ready to trade {settings.selectedPair}</p></div>
              ) : (
                trades.map(trade => (
                  <div key={trade.id} className={`bg-gray-700 p-3 rounded-lg border-l-4 ${trade.type === 'OPEN' ? 'border-blue-500' : trade.pnl > 0 ? 'border-green-500' : 'border-red-500'}`}>
                    <div className="flex justify-between items-center">
                      <div className="flex-1">
                        <p className="font-medium flex items-center gap-2"><span className={`px-2 py-1 rounded text-xs font-medium ${trade.type === 'OPEN' ? 'bg-blue-600' : trade.pnl > 0 ? 'bg-green-600' : 'bg-red-600'}`}>{trade.type}</span><span className={trade.side === 'long' ? 'text-green-400' : 'text-red-400'}>{trade.side.toUpperCase()}</span>{trade.symbol}{trade.confidence && (<span className="text-xs text-gray-400">({trade.confidence})</span>)}</p>
                        <div className="text-xs text-gray-400 mt-1"><div className="flex justify-between"><span>${trade.price.toFixed(2)} | Size: {trade.size.toFixed(4)}</span>{trade.spread && <span>Spread: ${trade.spread}</span>}</div><div className="text-gray-500">{trade.reason}</div>{trade.holdTime && (<div className="text-gray-500">Hold: {trade.holdTime}</div>)}</div>
                      </div>
                      <div className="text-right ml-4">{trade.pnl !== 0 && (<><p className={`font-bold ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>${trade.pnl.toFixed(2)}</p>{trade.pnlPercent && (<p className={`text-sm ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{trade.pnlPercent}%</p>)}</>)}<p className="text-xs text-gray-400">{trade.timestamp}</p></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 bg-gray-800 p-6 rounded-xl border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2"><div className={`w-4 h-4 rounded-full ${isActive ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`}></div><span className="font-medium text-lg">Bot: {isActive ? 'LIVE TRADING' : 'PAUSED'}</span></div>
              <div className="flex items-center gap-2"><div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div><span className="text-sm text-gray-400">Market Data: {isConnected ? 'LIVE' : 'OFFLINE'}</span></div>
              <div className="text-sm text-gray-400">Time Zone: <span className="text-blue-400">IST (GMT +5:30)</span></div>
            </div>
            <div className="text-sm text-gray-500">{getCurrentIST()} | Real-Time Crypto Trading Bot</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-8 gap-3 text-center">
            <div className="bg-gray-900 p-3 rounded"><div className="text-lg font-bold text-blue-400">{trades.filter(t => t.type === 'OPEN').length}</div><div className="text-xs text-gray-400">Opened</div></div>
            <div className="bg-gray-900 p-3 rounded"><div className="text-lg font-bold text-green-400">{realTimeStats.winningTrades}</div><div className="text-xs text-gray-400">Winners</div></div>
            <div className="bg-gray-900 p-3 rounded"><div className="text-lg font-bold text-red-400">{realTimeStats.losingTrades}</div><div className="text-xs text-gray-400">Losers</div></div>
            <div className="bg-gray-900 p-3 rounded"><div className="text-lg font-bold text-purple-400">{settings.maxPositions - positions.length}</div><div className="text-xs text-gray-400">Available</div></div>
            <div className="bg-gray-900 p-3 rounded"><div className="text-lg font-bold text-cyan-400">${Math.abs(totalProfit).toFixed(0)}</div><div className="text-xs text-gray-400">Total P&L</div></div>
            <div className="bg-gray-900 p-3 rounded"><div className={`text-lg font-bold ${parseFloat(roi) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{roi}%</div><div className="text-xs text-gray-400">ROI</div></div>
            <div className="bg-gray-900 p-3 rounded"><div className="text-lg font-bold text-yellow-400">{realTimeStats.largestWin > 0 ? `${realTimeStats.largestWin.toFixed(0)}` : '$0'}</div><div className="text-xs text-gray-400">Best Win</div></div>
            <div className="bg-gray-900 p-3 rounded"><div className="text-lg font-bold text-orange-400">{(balance * settings.maxRiskPerTrade / 100).toFixed(0)}</div><div className="text-xs text-gray-400">Risk/Trade</div></div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-700 text-xs text-gray-500 flex justify-between items-center">
            <div>LIVE: CoinGecko & Binance WebSocket | Next trade check in {isActive ? `${settings.tradingInterval}s` : 'PAUSED'} | Pair: {settings.selectedPair}</div>
            <div className="flex items-center gap-4"><span>API: {isConnected ? 'Connected' : 'Connecting'}</span><span>Last update: {lastDataUpdate ? lastDataUpdate.toLocaleTimeString() : 'Pending'}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealTimeCryptoTradingBot;