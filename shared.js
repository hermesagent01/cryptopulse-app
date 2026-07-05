// CryptoPulse — Static Site Engine
(function(){
  var PAGE=document.body.getAttribute('data-page')||'signals';
  
  // Particles
  var pp=document.createElement('div');pp.className='pp';
  for(var i=0;i<25;i++){var p=document.createElement('div');p.className='pt';
    p.style.left=Math.random()*100+'%';p.style.animationDelay=Math.random()*7+'s';
    p.style.animationDuration=(5+Math.random()*7)+'s';
    p.style.width=p.style.height=(1+Math.random()*2)+'px';pp.appendChild(p)}
  document.body.prepend(pp);
  
  // Orbs
  ['#c0c0c0','#808080'].forEach(function(c,i){
    var o=document.createElement('div');o.className='bo';
    o.style.background='radial-gradient(circle,'+c+',transparent)';
    if(i===1)o.style.animationDelay='-6s';document.body.prepend(o)});
  
  // Mesh
  var m=document.createElement('div');m.className='mesh';document.body.prepend(m);
  
  // Header
  var hdr=document.createElement('header');hdr.className='hdr';
  hdr.innerHTML='<div class="hdr-inner"><a href="signals.html" class="logo">CRYPTO<span>PULSE</span></a><div class="hdr-right"><span class="clk" id="app-clock">—</span></div></div>';
  document.body.prepend(hdr);
  
  // Bottom nav
  var nav=document.createElement('nav');nav.className='bn';
  [{id:'signals',label:'Signals',ico:'⚡',href:'signals.html'},{id:'ta',label:'TA',ico:'📊',href:'ta.html'}].forEach(function(t){
    var a=document.createElement('a');a.href=t.href;a.className='bni'+(t.id===PAGE?' act':'');
    a.innerHTML='<span class="ico">'+t.ico+'</span>'+t.label;nav.appendChild(a)});
  document.body.appendChild(nav);
  
  // PWA install
  var ib=document.createElement('div');ib.id='ib';
  ib.innerHTML='<span><b>Add to Home Screen</b></span><button id="ibtn">Install</button><button onclick="document.getElementById(\'ib\').classList.remove(\'show\')" style="background:none;border:none;color:rgba(255,255,255,0.3);font-size:1rem;cursor:pointer;padding:4px">×</button>';
  document.body.prepend(ib);
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');
  var dp;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();dp=e;document.getElementById('ib').classList.add('show')});
  document.getElementById('ibtn').addEventListener('click',function(){if(dp){dp.prompt();dp.userChoice.then(function(){dp=null;document.getElementById('ib').classList.remove('show')})}});
  
  // Clock
  function tick(){var el=document.getElementById('app-clock');if(el)el.textContent=new Date().toUTCString().slice(17,25)+' UTC'}
  tick();setInterval(tick,5000);
  
  // ═══ DATA LOADER ═══
  var DATA={};
  
  function loadJSON(url){
    return fetch(url).then(function(r){if(!r.ok)throw Error(r.status);return r.json()}).catch(function(e){console.warn('Load fail:',url,e);return null});
  }
  
  function loadData(){
    var isLocal=window.location.hostname==='localhost';
    var base=isLocal?'http://localhost:8000':'';
    
    // Try API first (local dev), fallback to JSON files (static deploy)
    return fetch(base+'/api/all').then(function(r){
      if(!r.ok)throw Error('API not available');
      return r.json();
    }).then(function(r){
      DATA=r;
      document.dispatchEvent(new CustomEvent('app:ready',{detail:DATA}));
      return DATA;
    }).catch(function(){
      // Fallback: load JSON files directly
      return Promise.all([
        loadJSON('data/signals.json').then(function(d){DATA.signals=d||[]}),
        loadJSON('data/tas.json').then(function(d){DATA.tas=d||[]}),
        loadJSON('data/portfolio.json').then(function(d){DATA.portfolio=d||{}}),
        loadJSON('data/trade_log.json').then(function(d){DATA.trade_log=d||{}}),
        loadJSON('data/news.json').then(function(d){DATA.news=d||[]}),
        loadJSON('data/briefs.json').then(function(d){DATA.briefs=d||{}}),
        loadJSON('data/stocks_forex.json').then(function(d){DATA.stocks_forex=d||[]})
      ]).then(function(){
        window.APP={DATA:DATA,PAGE:PAGE};
        document.dispatchEvent(new CustomEvent('app:ready',{detail:DATA}));
      });
    });
  }
  
  // ═══ PRICES (from Binance public API) ═══
  var ASSETS=['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','DOGEUSDT','AVAXUSDT','TRXUSDT','DOTUSDT','LINKUSDT','LTCUSDT','BCHUSDT','ATOMUSDT','XLMUSDT','UNIUSDT','NEARUSDT','APTUSDT','SUIUSDT','FETUSDT','INJUSDT','OPUSDT','ARBUSDT'];
  var prices={};
  
  function fetchPrices(){
    fetch('https://api.binance.com/api/v3/ticker/price?symbols=['+ASSETS.map(function(a){return '"'+a+'"'}).join(',')+']')
    .then(function(r){return r.json()})
    .then(function(data){
      if(data&&data.length){prices={};data.forEach(function(i){prices[i.symbol]=parseFloat(i.price)});
        document.dispatchEvent(new CustomEvent('app:prices',{detail:prices}));}
    }).catch(function(){});
  }
  fetchPrices();setInterval(fetchPrices,10000);
  
  // Expose
  window.CP={DATA:DATA};
  window.fmt=function(n){
    if(n==null||isNaN(n))return'—';
    if(n>=1000)return n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    if(n>=1)return n.toFixed(2);if(n>=0.01)return n.toFixed(4);return n.toFixed(6)
  };
  
  // Start
  loadData();
})();
