// api/prices.js — Binance price proxy (avoids browser CORS + IP bans)
// GET /api/prices -> { prices: { SYMBOL: number }, updated }
const sb = require('./_sb');
const ASSETS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT","TRXUSDT","DOTUSDT","LINKUSDT","LTCUSDT","BCHUSDT","ATOMUSDT","XLMUSDT","UNIUSDT","NEARUSDT","APTUSDT","SUIUSDT","FETUSDT","INJUSDT","OPUSDT","ARBUSDT"];

module.exports = async function(req, res){
  try {
    const url = `https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(ASSETS))}`;
    const r = await fetch(url, { headers: { 'User-Agent':'CP/1' }});
    if(!r.ok) throw new Error('binance '+r.status);
    const data = await r.json();
    const prices = {};
    data.forEach(i => { prices[i.symbol] = parseFloat(i.price); });
    // cache into Supabase prices table (optional, for offline consumers)
    const rows = Object.entries(prices).map(([symbol,price])=>({symbol,price}));
    await sb.from('prices').upsert(rows, { onConflict:'symbol' });
    res.setHeader('Cache-Control','s-maxage=10');
    res.json({ prices, updated: Date.now() });
  } catch(e){
    res.status(502).json({ error: String(e.message||e) });
  }
};
