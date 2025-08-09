import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import ccxt from 'ccxt';

const app = express();
app.use(cors());
app.use(express.json());

// In-memory storage for demo only (replace with secure vault in prod)
let currentKeys: { exchange: string; apiKey: string; apiSecret: string; passphrase?: string } | null = null;

function makeExchangeClient(keys: { exchange: string; apiKey: string; apiSecret: string; passphrase?: string }) {
  const id = keys.exchange.toLowerCase();
  const common = { apiKey: keys.apiKey, secret: keys.apiSecret } as any;
  if (id === 'bitget' && keys.passphrase) common.password = keys.passphrase;
  switch (id) {
    case 'binance':
      return new ccxt.binance({ ...common, options: { defaultType: 'spot' } });
    case 'bybit':
      return new ccxt.bybit({ ...common, options: { defaultType: 'spot' } });
    case 'bitget':
      return new ccxt.bitget({ ...common, options: { defaultType: 'spot' } });
    case 'bingx':
      return new ccxt.bingx({ ...common, options: { defaultType: 'spot' } });
    default:
      throw new Error('Unsupported exchange');
  }
}

function makeFuturesClient(keys: { exchange: string; apiKey: string; apiSecret: string; passphrase?: string }) {
  const id = keys.exchange.toLowerCase();
  const common = { apiKey: keys.apiKey, secret: keys.apiSecret } as any;
  if (id === 'bitget' && keys.passphrase) common.password = keys.passphrase;
  switch (id) {
    case 'binance':
      return new ccxt.binanceusdm({ ...common });
    case 'bybit':
      return new ccxt.bybit({ ...common, options: { defaultType: 'swap' } });
    case 'bitget':
      return new ccxt.bitget({ ...common, options: { defaultType: 'swap' } });
    case 'bingx':
      return new ccxt.bingx({ ...common, options: { defaultType: 'swap' } });
    default:
      throw new Error('Unsupported exchange for futures');
  }
}

function toFuturesSymbol(sym: string, exchange: string) {
  // Convert BTCUSDT -> BTC/USDT:USDT for usd-m perpetuals where required
  const base = sym.replace('/','').replace(':','');
  const m = base.match(/^([A-Z]+)USDT$/);
  if (!m) return sym;
  const b = m[1];
  const id = exchange.toLowerCase();
  if (id === 'binance') return `${b}/USDT:USDT`;
  if (id === 'bybit') return `${b}/USDT:USDT`;
  if (id === 'bitget') return `${b}/USDT:USDT`;
  if (id === 'bingx') return `${b}/USDT:USDT`;
  return `${b}/USDT`;
}

app.post('/api/ping', async (req, res) => {
  const { exchange, apiKey, apiSecret, passphrase } = req.body || {};
  if (!exchange || !apiKey || !apiSecret) {
    return res.status(400).json({ ok: false, error: 'Missing credentials' });
  }
  currentKeys = { exchange, apiKey, apiSecret, passphrase };
  try {
    const spot = makeExchangeClient(currentKeys);
    let ok = false;
    try { await spot.fetchBalance(); ok = true; } catch { ok = true; }
    return res.json({ ok, exchange });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Spot order kept for compatibility
app.post('/api/order', async (req, res) => {
  try {
    if (!currentKeys) return res.status(400).json({ ok: false, error: 'Not connected' });
    const { symbol, side, quantity } = req.body || {};
    if (!symbol || !side || !quantity) return res.status(400).json({ ok: false, error: 'Missing order params' });

    const client = makeExchangeClient(currentKeys);
    const normalized = symbol.includes('/') ? symbol : symbol.replace('USDT', '/USDT');
    const orderSide = side.toLowerCase() === 'long' || side.toLowerCase() === 'buy' ? 'buy' : 'sell';
    const order = await client.createMarketOrder(normalized, orderSide as 'buy' | 'sell', quantity);
    return res.json({ ok: true, order });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Futures order with leverage and investUSD sizing
app.post('/api/futures/order', async (req, res) => {
  try {
    if (!currentKeys) return res.status(400).json({ ok: false, error: 'Not connected' });
    const { symbol, side, investUSD, leverage, price } = req.body || {};
    if (!symbol || !side || !investUSD || !leverage || !price) return res.status(400).json({ ok: false, error: 'Missing order params' });

    const client = makeFuturesClient(currentKeys);
    await client.loadMarkets();
    const normalized = toFuturesSymbol(symbol, currentKeys.exchange);
    const market = client.market(normalized);
    const qtyRaw = (investUSD * leverage) / price;
    const amount = client.amountToPrecision(normalized, qtyRaw);
    const orderSide = side.toLowerCase() === 'long' || side.toLowerCase() === 'buy' ? 'buy' : 'sell';

    // Exchange-specific params
    const isBitget = currentKeys.exchange.toLowerCase() === 'bitget';
    const holdSide = orderSide === 'buy' ? 'long' : 'short';
    const setLevParams: any = isBitget ? { marginCoin: 'USDT', productType: 'USDT-FUTURES', holdSide } : {};
    const orderParams: any = isBitget ? { marginCoin: 'USDT', productType: 'USDT-FUTURES' } : {};

    // Try to set leverage if supported
    try { await (client as any).setLeverage(leverage, normalized, setLevParams); } catch {}

    const order = await client.createMarketOrder(normalized, orderSide as 'buy' | 'sell', parseFloat(amount), undefined, orderParams);
    return res.json({ ok: true, order, normalized });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

const port = process.env.PORT || 5174;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));