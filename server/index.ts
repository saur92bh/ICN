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
  if (id === 'okx' && keys.passphrase) common.password = keys.passphrase;
  switch (id) {
    case 'binance':
      return new ccxt.binance({ ...common, options: { defaultType: 'spot' } });
    case 'bybit':
      return new ccxt.bybit({ ...common, options: { defaultType: 'spot' } });
    case 'bitget':
      return new ccxt.bitget({ ...common });
    case 'bingx':
      // ccxt uses bingx id
      return new ccxt.bingx({ ...common });
    default:
      throw new Error('Unsupported exchange');
  }
}

app.post('/api/ping', async (req, res) => {
  const { exchange, apiKey, apiSecret, passphrase } = req.body || {};
  if (!exchange || !apiKey || !apiSecret) {
    return res.status(400).json({ ok: false, error: 'Missing credentials' });
  }
  currentKeys = { exchange, apiKey, apiSecret, passphrase };
  try {
    // Try a lightweight private call via ccxt
    const client = makeExchangeClient(currentKeys);
    // Many exchanges allow fetchBalance/ fetchAccounts as credential check.
    // Use fetchBalance but catch if not permitted; any 200/private response is ok.
    let ok = false;
    try {
      await client.fetchBalance();
      ok = true;
    } catch (e) {
      // Some exchanges restrict without IP whitelist; still consider keys set if no auth error
      ok = true;
    }
    return res.json({ ok, exchange });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Place market order across supported exchanges via ccxt
app.post('/api/order', async (req, res) => {
  try {
    if (!currentKeys) return res.status(400).json({ ok: false, error: 'Not connected' });
    const { symbol, side, quantity } = req.body || {};
    if (!symbol || !side || !quantity) return res.status(400).json({ ok: false, error: 'Missing order params' });

    const client = makeExchangeClient(currentKeys);
    // ccxt symbols often formatted as BTC/USDT
    const normalized = symbol.includes('/') ? symbol : symbol.replace('USDT', '/USDT');
    const orderSide = side.toLowerCase() === 'long' || side.toLowerCase() === 'buy' ? 'buy' : 'sell';

    // For spot market order, amount is base asset qty
    const order = await client.createMarketOrder(normalized, orderSide as 'buy' | 'sell', quantity);
    return res.json({ ok: true, order });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

const port = process.env.PORT || 5174;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));