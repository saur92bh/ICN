import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());

// In-memory storage for demo only (replace with secure vault in prod)
let currentKeys: any = null;

app.post('/api/ping', async (req, res) => {
  const { exchange, apiKey, apiSecret, passphrase } = req.body || {};
  if (!exchange || !apiKey || !apiSecret) {
    return res.status(400).json({ ok: false, error: 'Missing credentials' });
  }
  currentKeys = { exchange, apiKey, apiSecret, passphrase };
  try {
    if (exchange === 'binance') {
      const timestamp = Date.now();
      const query = `timestamp=${timestamp}`;
      const signature = crypto.createHmac('sha256', apiSecret).update(query).digest('hex');
      const resp = await fetch(`https://api.binance.com/api/v3/account?${query}&signature=${signature}`, { headers: { 'X-MBX-APIKEY': apiKey } });
      if (resp.status === 200) return res.json({ ok: true, exchange });
      return res.status(400).json({ ok: false, exchange, status: resp.status });
    }
    return res.json({ ok: true, exchange });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Place market order (Binance only in this demo)
app.post('/api/order', async (req, res) => {
  try {
    const { exchange, apiKey, apiSecret } = currentKeys || {};
    if (!exchange || !apiKey || !apiSecret) return res.status(400).json({ ok: false, error: 'Not connected' });

    const { symbol, side, quantity } = req.body || {};
    if (!symbol || !side || !quantity) return res.status(400).json({ ok: false, error: 'Missing order params' });

    if (exchange === 'binance') {
      const timestamp = Date.now();
      const params = new URLSearchParams({
        symbol,
        side: side.toUpperCase(),
        type: 'MARKET',
        quantity: String(quantity),
        timestamp: String(timestamp),
      });
      const signature = crypto.createHmac('sha256', apiSecret).update(params.toString()).digest('hex');
      params.append('signature', signature);
      const resp = await fetch(`https://api.binance.com/api/v3/order`, {
        method: 'POST',
        headers: { 'X-MBX-APIKEY': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) return res.status(resp.status).json({ ok: false, ...json });
      return res.json({ ok: true, order: json });
    }

    return res.status(400).json({ ok: false, error: 'Exchange not implemented' });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

const port = process.env.PORT || 5174;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));