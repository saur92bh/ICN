import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import ccxt from 'ccxt';

const app = express();
app.use(cors());
app.use(express.json());

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
  const base = sym.replace('/', '').replace(':', '');
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
    return res.status(500).json({ ok: false, error: e.message, details: (e as any)?.toString?.() });
  }
});

async function prepareBitget(client: ccxt.Exchange, symbol: string, leverage: number, orderSide: 'buy' | 'sell') {
  const holdSide = orderSide === 'buy' ? 'long' : 'short';
  try { await (client as any).setPositionMode(false, symbol, { productType: 'USDT-FUTURES' }); } catch {}
  try { await (client as any).setMarginMode('cross', symbol, { productType: 'USDT-FUTURES', marginCoin: 'USDT' }); } catch {}
  try { await (client as any).setLeverage(leverage, symbol, { productType: 'USDT-FUTURES', marginCoin: 'USDT', holdSide }); } catch {}
}

app.post('/api/futures/order', async (req, res) => {
  try {
    if (!currentKeys) return res.status(400).json({ ok: false, error: 'Not connected' });
    const { symbol, side, investUSD, leverage, price } = req.body || {};
    if (!symbol || !side || !investUSD || !leverage || !price) return res.status(400).json({ ok: false, error: 'Missing order params' });

    const client = makeFuturesClient(currentKeys);
    await client.loadMarkets();
    const normalized = toFuturesSymbol(symbol, currentKeys.exchange);
    const market = client.market(normalized);
    const orderSide: 'buy' | 'sell' = side.toLowerCase() === 'long' || side.toLowerCase() === 'buy' ? 'buy' : 'sell';

    // Bitget prep (position/margin/leverage)
    if (currentKeys.exchange.toLowerCase() === 'bitget') {
      await prepareBitget(client, normalized, leverage, orderSide);
    }

    // Amount with precision & min checks
    const rawQty = (Number(investUSD) * Number(leverage)) / Number(price);
    let amount = client.amountToPrecision(normalized, rawQty);
    const min = market?.limits?.amount?.min ?? 0;
    if (min && Number(amount) < min) {
      const suggestedUSD = (min * Number(price)) / Number(leverage) * 1.05; // +5%
      return res.status(400).json({ ok: false, error: 'amount_below_min', minAmount: min, suggestedInvestUSD: Math.ceil(suggestedUSD * 100) / 100 });
    }

    const isBitget = currentKeys.exchange.toLowerCase() === 'bitget';
    const orderParams: any = isBitget ? { marginCoin: 'USDT', productType: 'USDT-FUTURES', reduceOnly: false, force: 'gtc' } : {};

    console.log('[ORDER]', currentKeys.exchange, normalized, orderSide, 'qty=', amount, 'lev=', leverage, orderParams);
    const order = await client.createMarketOrder(normalized, orderSide, parseFloat(String(amount)), undefined, orderParams);
    console.log('[ORDER-OK]', order?.id || 'no-id');
    return res.json({ ok: true, order, normalized });
  } catch (e: any) {
    console.error('[ORDER-ERR]', e?.message || e);
    return res.status(500).json({ ok: false, error: e?.message || String(e), stack: e?.stack, raw: e });
  }
});

const port = process.env.PORT || 5174;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));