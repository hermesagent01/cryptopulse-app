// api/cron-generate.js — called by Hermes cron / external scheduler.
// Body (or query) carries a precomputed signal from the TA pipeline:
//   { symbol, direction, timeframe, entry_price, stop_loss, take_profit, risk_reward, reason }
// On success it INSERTs the signal AND auto-opens a $1,000 paper trade.
const sb = require('./_sb');
const SIZE = 1000.00;

module.exports = async function(req, res){
  if(req.method !== 'POST') return res.status(405).json({error:'POST only'});
  let body;
  try { body = typeof req.body==='string'? JSON.parse(req.body) : (req.body||{}); }
  catch(e){ return res.status(400).json({error:'bad json'}); }

  const { symbol, direction, timeframe='4H', entry_price, stop_loss, take_profit, risk_reward, reason } = body;
  if(!symbol || !direction || !entry_price || !stop_loss || !take_profit)
    return res.status(400).json({error:'missing fields'});

  try {
    const { data: sig, error: se } = await sb.from('signals').insert({
      symbol, direction, timeframe,
      entry_price, stop_loss, take_profit, risk_reward, reason, status:'OPEN'
    }).select().single();
    if(se) return res.status(500).json({error: se.message});

    // auto paper trade
    const { data: tr, error: te } = await sb.from('paper_trades').insert({
      signal_id: sig.id, symbol, direction, size_usd: SIZE,
      entry_price, stop_loss, take_profit, status:'OPEN'
    }).select().single();
    if(te) return res.status(500).json({error: te.message});

    res.json({ ok:true, signal: sig.id, trade: tr.id, size: SIZE });
  } catch(e){
    res.status(500).json({error: String(e.message||e)});
  }
};
