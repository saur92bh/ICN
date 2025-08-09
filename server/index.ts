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
      return new ccxt.bitget({ ...common, options: { defaultType: 'swap', defaultSubType: 'linear' } });
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
    const fut = makeFuturesClient(currentKeys);
    try {
      await fut.fetchBalance();
      return res.json({ ok: true, exchange, mode: 'futures' });
    } catch (e1: any) {
      const spot = makeExchangeClient(currentKeys);
      try {
        await spot.fetchBalance();
        return res.json({ ok: true, exchange, mode: 'spot' });
      } catch (e2: any) {
        return res.status(401).json({
          ok: false,
          error: 'Auth failed',
          exchange,
          futError: e1?.message || String(e1),
          spotError: e2?.message || String(e2),
        });
      }
    }
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
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

// --- News / Macro Risk Guard -------------------------------------------------

type NewsSignal = {
  ok: true;
  minutes: number;
  riskScore: number; // 0-100
  highRisk: boolean;
  reasons: string[];
  headlines: Array<{ title: string; url: string; source?: string; seendate?: string }>;
} | { ok: false; error: string };

let lastNewsCache: { ts: number; minutes: number; data: NewsSignal } | null = null;

async function fetchGdeltNews(minutes: number): Promise<NewsSignal> {
  try {
    // Use GDELT docs API (no key). Filter crypto keywords; last N minutes; top ~50-75 records.
    const query = encodeURIComponent('(bitcoin OR ethereum OR crypto OR "btc" OR "eth")');
    const timespan = `${Math.max(5, Math.min(240, minutes))}m`;
    const maxrecords = 75;
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&format=json&maxrecords=${maxrecords}&timespan=${timespan}`;
    const f: any = (globalThis as any).fetch;
    const resp = await f(url);
    if (!resp?.ok) return { ok: false, error: `gdelt_http_${resp?.status || 'err'}` };
    const json: any = await resp.json();
    const arts: any[] = json?.articles || [];

    const negativeKeywords = [
      'hack', 'exploit', 'breach', 'leak', 'rug pull', 'attack', 'phishing', 'exploit',
      'lawsuit', 'sue', 'investigation', 'probe', 'indictment',
      'bankruptcy', 'insolvency', 'chapter 11', 'chapter 15',
      'outage', 'downtime', 'halt', 'halted', 'halt trading', 'trading halt',
      'depeg', 'de-pegg', 'de peg', 'unpeg', 'un-pegg',
      'liquidation', 'cascade', 'margin call',
      'sanction', 'ban', 'freeze', 'blacklist',
      'scam', 'fraud', 'ponzi', 'crime', 'theft', 'stolen',
      'sell-off', 'dump', 'plunge', 'crash', 'collapse', 'panic'
    ];
    const regulatorKeywords = ['sec', 'cftc', 'doj', 'treasury', 'fca', 'esma', 'mas'];
    const positiveKeywords = ['approval', 'approve', 'etf approval', 'upgrade', 'partnership', 'launch', 'adoption'];

    let negHits = 0;
    let regulatorHits = 0;
    let posHits = 0;
    const reasons: string[] = [];

    const headlines = arts.slice(0, 50).map(a => ({
      title: a?.title || '',
      url: a?.url || '',
      source: a?.sourceCommonName || a?.domain || '',
      seendate: a?.seendate || ''
    }));

    for (const a of arts) {
      const text = `${a?.title || ''} ${a?.seendate || ''} ${a?.sourceCommonName || ''}`.toLowerCase();
      for (const k of negativeKeywords) { if (text.includes(k)) { negHits += 1; reasons.push(`neg:${k}`); } }
      for (const k of regulatorKeywords) { if (text.includes(k)) { regulatorHits += 1; reasons.push(`reg:${k}`); } }
      for (const k of positiveKeywords) { if (text.includes(k)) { posHits += 1; } }
    }

    // Heuristic scoring. Negative dominates, regulator adds extra weight. Cap 100.
    let riskScore = Math.min(100, negHits * 8 + regulatorHits * 10 - Math.min(20, posHits * 2));
    const highRisk = riskScore >= 30 || (negHits >= 4) || (regulatorHits >= 2);

    return { ok: true, minutes, riskScore, highRisk, reasons: Array.from(new Set(reasons)).slice(0, 10), headlines };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

app.get('/api/news-signal', async (req, res) => {
  try {
    const minutes = Number(req.query.minutes || 60) || 60;
    const now = Date.now();
    if (lastNewsCache && now - lastNewsCache.ts < 90_000 && lastNewsCache.minutes === minutes) {
      return res.json(lastNewsCache.data);
    }
    const data = await fetchGdeltNews(minutes);
    lastNewsCache = { ts: now, minutes, data };
    return res.json(data);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ----------------------------------------------------------------------------

const port = process.env.PORT || 5174;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));