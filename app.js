// CryptoPulse — frontend logic (reads Supabase via anon key)
const CP = (function(){
  const C = window.CP_CONFIG;
  let sb = null;
  let state = { signals:[], ta:[], trades:[], acct:null, prices:{} };

  function init(){
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
    clock(); setInterval(clock, 5000);
    loadAll();
    setInterval(loadAll, 30000);      // refresh every 30s
    setInterval(loadPricesTicker, 15000);
  }

  async function loadAll(){
    try {
      const [sig, ta, tr, ac] = await Promise.all([
        sb.from('signals').select('*').order('created_at',{ascending:false}).limit(50),
        sb.from('pair_stats').select('*').order('symbol'),
        sb.from('paper_trades').select('*').order('opened_at',{ascending:false}).limit(100),
        sb.from('virtual_account').select('*').eq('id',1).single(),
      ]);
      if(sig.data) state.signals = sig.data;
      if(ta.data) state.ta = ta.data;
      if(tr.data) state.trades = tr.data;
      if(ac.data) state.acct = ac.data;
      renderSignals(); renderTA(); renderTrades();
      loadPricesTicker();
    } catch(e){ console.warn('loadAll', e); }
  }

  async function loadPricesTicker(){
    try {
      const r = await fetch(C.API_PRICES);
      if(!r.ok) return;
      const j = await r.json();
      state.prices = j.prices || {};
      renderTicker();
      // refresh any open-trade mark prices shown
    } catch(e){}
  }

  // ── SIGNALS ──
  function renderSignals(filter){
    const f = filter || (state._filt || 'ALL');
    state._filt = f;
    const list = state.signals.filter(s => f==='ALL' || s.direction===f);
    const g = document.getElementById('sigGrid');
    if(!list.length){ g.innerHTML = '<div class="dim" style="grid-column:1/-1;padding:1.5rem;text-align:center">no signals yet</div>'; return; }
    g.innerHTML = list.map(sigCard).join('');
  }
  function sigCard(s){
    const cls = s.direction==='BUY'?'buy':s.direction==='SELL'?'sell':'neutral';
    const bar = s.direction==='BUY'?'green':s.direction==='SELL'?'red':'';
    return `<div class="card"><div class="acc-bar ${bar}"></div><div style="padding:1rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
        <span class="font-mono" style="font-weight:700">${s.symbol}</span>
        <span class="pill ${cls}">${s.direction}</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem;font-size:.78rem;font-family:'JetBrains Mono',monospace;margin-bottom:.7rem">
        <div>Entry <span class="accent">${fmt(s.entry_price)}</span></div>
        <div>SL <span class="sell">${fmt(s.stop_loss)}</span></div>
        <div>TP <span class="buy">${fmt(s.take_profit)}</span></div>
        <div>R:R <b>${s.risk_reward ?? '—'}</b></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.7rem;font-size:.72rem">
        <span class="pill ${s.status==='OPEN'?'open':s.status==='TP HIT'?'buy':'sell'}">${s.status}</span>
        <span class="muted">${s.timeframe}</span></div>
      <button class="btn ghost" style="width:100%;font-size:.78rem" onclick="CP.openSig('${s.symbol}')">View trade →</button>
    </div></div>`;
  }
  function filt(el,f){ document.querySelectorAll('#sec-signals .chip').forEach(c=>c.classList.remove('act')); el.classList.add('act'); renderSignals(f); }
  function openSig(sym){
    const s = state.signals.find(x=>x.symbol===sym); if(!s) return;
    document.getElementById('mTitle').textContent = sym+' · '+s.direction;
    document.getElementById('mBody').innerHTML =
      `<div class="font-mono" style="font-size:.82rem;display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:.8rem">
        <div>Entry <span class="accent">${fmt(s.entry_price)}</span></div>
        <div>SL <span class="sell">${fmt(s.stop_loss)}</span></div>
        <div>TP <span class="buy">${fmt(s.take_profit)}</span></div>
        <div>TF <b>${s.timeframe}</b></div></div>
       <div style="background:var(--card-alt);border:1px solid var(--border);border-radius:.6rem;padding:.7rem;font-size:.82rem;color:var(--dim);margin-bottom:.8rem">${s.reason||'—'}</div>
       <iframe src="https://s3.tradingview.com/widgetembed/?symbol=BYBIT:${sym}&interval=240&theme=dark" style="width:100%;height:200px;border:0;border-radius:.6rem"></iframe>
       <div style="font-size:.7rem;color:var(--muted);margin-top:.4rem">TradingView embed</div>`;
    document.getElementById('mRate').textContent = '—';
    document.getElementById('modalBg').classList.add('act');
  }

  // ── TA ──
  function renderTA(){
    const g = document.getElementById('taGrid');
    if(!state.ta.length){ g.innerHTML='<div class="dim" style="grid-column:1/-1;padding:1.5rem;text-align:center">no TA data yet</div>'; return; }
    g.innerHTML = state.ta.map(t=>{
      const cls = t.direction==='BUY'?'buy':t.direction==='SELL'?'sell':'neutral';
      return `<div class="card"><div style="padding:.9rem">
        <div style="display:flex;justify-content:space-between;margin-bottom:.5rem"><span class="font-mono" style="font-weight:700">${t.symbol}</span>
        <span class="pill ${cls}">${t.direction}</span></div>
        <div style="font-size:.8rem;margin-bottom:.5rem">${t.verdict}</div>
        <div style="font-size:.72rem;color:var(--dim);font-family:'JetBrains Mono',monospace">RSI 1H ${t.rsi_1h ?? '—'} · 4H ${t.rsi_4h ?? '—'} · 1D ${t.rsi_1d ?? '—'}</div>
      </div></div>`;
    }).join('');
  }

  // ── TRADE (blotter) ──
  function renderTrades(){
    const tb = document.getElementById('tradeRows');
    if(!state.trades.length){ tb.innerHTML='<tr><td colspan="9" class="dim" style="text-align:center;padding:1.5rem;font-family:inherit">no trades yet</td></tr>'; }
    else {
      tb.innerHTML = state.trades.map(t=>{
        const pnlCls = t.pnl_usd>0?'buy':t.pnl_usd<0?'sell':'dim';
        const pnlTxt = t.status==='OPEN' ? markUnreal(t) : (t.pnl_usd>=0?'+$'+(t.pnl_usd).toFixed(2):'-$'+(Math.abs(t.pnl_usd)).toFixed(2));
        return `<tr>
          <td class="dim">${fmtDate(t.opened_at)}</td>
          <td class="pair">${t.symbol}</td>
          <td><span class="${t.direction==='BUY'?'buy':'sell'}" style="font-weight:700">${t.direction}</span></td>
          <td class="dim">Market</td>
          <td>${fmt(t.entry_price)}</td>
          <td>${amt(t)}</td>
          <td class="dim">$${t.size_usd.toFixed(2)}</td>
          <td><span class="pill ${t.status==='OPEN'?'open':'filled'}">${t.status}</span></td>
          <td class="${pnlCls}">${pnlTxt}</td></tr>`;
      }).join('');
    }
    // account strip
    const a = state.acct;
    if(a){
      document.getElementById('vaBalance').textContent = '$'+a.balance_usd.toFixed(2);
      document.getElementById('vaReal').textContent = (a.realized_pnl>=0?'+$':'-$')+Math.abs(a.realized_pnl).toFixed(2);
      const wr = a.total_trades? Math.round(a.wins/a.total_trades*100):0;
      document.getElementById('vaWR').textContent = wr+'%';
      document.getElementById('vaTrades').textContent = a.total_trades;
      // unrealized = open trades marked at live price
      let un=0; state.trades.filter(t=>t.status==='OPEN').forEach(t=>{ un += unreal(t); });
      document.getElementById('vaUnreal').textContent = (un>=0?'+$':'-$')+Math.abs(un).toFixed(2);
    }
  }
  function amt(t){ const p=t.entry_price||1; return (t.size_usd/p).toFixed(p<1?2:4); }
  // PnL if closed: stored. If open: mark at live price.
  function unreal(t){
    const px = state.prices[t.symbol]; if(!px) return 0;
    const units = t.size_usd / t.entry_price;
    const val = units * px;
    const cost = t.size_usd;
    return t.direction==='BUY' ? (val-cost) : (cost-val);
  }
  function markUnreal(t){ const u=unreal(t); return (u>=0?'+$':'-$')+Math.abs(u).toFixed(2); }

  // ── ticker ──
  function renderTicker(){
    const syms = Object.keys(state.prices);
    if(!syms.length){ return; }
    const html = syms.map(s=>{
      const p = state.prices[s];
      const ch = ((Math.random()*4)-2).toFixed(2); // demo change; real change needs 24h prev — shown as live price only
      const c = ch>=0?'buy':'sell';
      return `<span style="font-size:.8rem"><b class="font-mono">${s}</b> <span class="font-mono ${c}">${fmt(p)}</span></span>`;
    }).join('');
    document.getElementById('tk').innerHTML = html+html;
  }

  // ── nav ──
  function go(s,el){
    document.querySelectorAll('.sec').forEach(x=>x.classList.remove('act'));
    document.getElementById('sec-'+s).classList.add('act');
    document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('act')); el.classList.add('act');
    window.scrollTo(0,0);
  }

  // ── utils ──
  function fmt(n){ if(n==null||isNaN(n)) return '—'; const x=+n; if(x>=1000) return x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); if(x>=1) return x.toFixed(2); if(x>=0.01) return x.toFixed(4); return x.toFixed(6); }
  function fmtDate(iso){ try{ const d=new Date(iso); const p=n=>String(n).padStart(2,'0'); return `${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }catch(e){ return '—'; } }
  function clock(){ const e=document.getElementById('clk'); if(e) e.textContent=new Date().toUTCString().slice(17,25)+' UTC'; }

  return { init, filt, openSig, go, _state:()=>state };
})();
document.addEventListener('DOMContentLoaded', CP.init);
