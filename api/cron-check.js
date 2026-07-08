// api/cron-check.js — called periodically to close OPEN paper trades on TP/SL
// and update the virtual_account running balance. Uses live Binance price.
const sb = require('./_sb');
const ASSETS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT","TRXUSDT","DOTUSDT","LINKUSDT","LTCUSDT","BCHUSDT","ATOMUSDT","XLMUSDT","UNIUSDT","NEARUSDT","APTUSDT","SUIUSDT","FETUSDT","INJUSDT","OPUSDT","ARBUSDT"];

module.exports = async function(req, res){
  try {
    // current prices
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(ASSETS))}`, { headers:{'User-Agent':'CP/1'}});
    const data = await r.json();
    const px = {}; data.forEach(i=> px[i.symbol]=parseFloat(i.price));

    // open trades
    const { data: open, error } = await sb.from('paper_trades').select('*').eq('status','OPEN');
    if(error) return res.status(500).json({error:error.message});

    let closed=0, realizedDelta=0, wins=0, losses=0;
    for(const t of open){
      const price = px[t.symbol]; if(price==null) continue;
      let hit=null;
      if(t.direction==='BUY'){
        if(price >= t.take_profit) hit='TP HIT';
        else if(price <= t.stop_loss) hit='SL HIT';
      } else if(t.direction==='SELL'){
        if(price <= t.take_profit) hit='TP HIT';
        else if(price >= t.stop_loss) hit='SL HIT';
      } else continue;
      if(!hit) continue;

      const units = t.size_usd / t.entry_price;
      const exitVal = units * price;
      let pnl = t.direction==='BUY' ? (exitVal - t.size_usd) : (t.size_usd - exitVal);
      const pnlPct = (pnl / t.size_usd) * 100;

      await sb.from('paper_trades').update({
        status: hit, exit_price: price, pnl_usd: pnl, pnl_pct: pnlPct,
        closed_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq('id', t.id);

      closed++; realizedDelta += pnl;
      if(pnl>=0) wins++; else losses++;
      // mark signal status too
      if(t.signal_id) await sb.from('signals').update({status:hit, updated_at:new Date().toISOString()}).eq('id', t.signal_id);
    }

    // update account
    if(closed>0){
      const { data: ac } = await sb.from('virtual_account').select('*').eq('id',1).single();
      if(ac){
        const bal = ac.balance_usd + realizedDelta;
        await sb.from('virtual_account').update({
          balance_usd: bal, realized_pnl: ac.realized_pnl + realizedDelta,
          total_trades: ac.total_trades + closed, wins: ac.wins + wins,
          losses: ac.losses + losses, updated_at: new Date().toISOString()
        }).eq('id',1);
      }
    }
    res.json({ ok:true, checked: open.length, closed, realizedDelta:+realizedDelta.toFixed(2) });
  } catch(e){
    res.status(500).json({error: String(e.message||e)});
  }
};
