// CryptoPulse — Shared Layout Engine (API-powered)
(function(){
  var PAGE=document.body.getAttribute('data-page')||'signals';
  var API=window.location.hostname==='localhost'?'http://localhost:8000':'';
  function getToken(){return localStorage.getItem('cp_token')}
  function setToken(t){localStorage.setItem('cp_token',t)}
  function clearToken(){localStorage.removeItem('cp_token')}
  function isLoggedIn(){return!!getToken()}
  function apiFetch(url,opts){opts=opts||{};var h=opts.headers||{};var t=getToken();if(t)h['Authorization']='Bearer '+t;opts.headers=h;return fetch(API+url,opts).then(function(r){if(r.status===401){clearToken();window.location.href='login.html';return null}return r.json()}).catch(function(e){console.warn('API fail:',e);return null})}
  // Particles
  var pp=document.createElement('div');pp.className='pp';for(var i=0;i<25;i++){var p=document.createElement('div');p.className='pt';p.style.left=Math.random()*100+'%';p.style.animationDelay=Math.random()*7+'s';p.style.animationDuration=(5+Math.random()*7)+'s';p.style.width=p.style.height=(1+Math.random()*2)+'px';pp.appendChild(p)}document.body.prepend(pp);
  // Orbs
  ['#c0c0c0','#808080'].forEach(function(c,i){var o=document.createElement('div');o.className='bo';o.style.background='radial-gradient(circle,'+c+',transparent)';if(i===1)o.style.animationDelay='-6s';document.body.prepend(o)});
  // Mesh
  var m=document.createElement('div');m.className='mesh';document.body.prepend(m);
  // Header
  var hdr=document.createElement('header');hdr.className='hdr';
  hdr.innerHTML='<div class="hdr-inner"><a href="signals.html" class="logo">CRYPTO<span>PULSE</span></a><div class="hdr-right"><span class="pd"></span><span class="clk" id="app-clock">—</span>'+(isLoggedIn()?'<button onclick="window.CP.logout()" style="background:none;border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.2);padding:3px 8px;border-radius:100px;font-size:0.48rem;cursor:pointer;font-family:inherit">Logout</button>':'')+'</div></div>';
  document.body.prepend(hdr);
  // Bottom nav
  var nav=document.createElement('nav');nav.className='bn';
  [{id:'signals',label:'Signals',ico:'⚡',href:'signals.html'},{id:'ta',label:'TA',ico:'📊',href:'ta.html'}].forEach(function(t){
    var a=document.createElement('a');a.href=t.href;a.className='bni'+(t.id===PAGE?' act':'');a.innerHTML='<span class="ico">'+t.ico+'</span>'+t.label;nav.appendChild(a);
  });document.body.appendChild(nav);
  // Install
  var ib=document.createElement('div');ib.id='ib';ib.innerHTML='<span><b>Add to Home Screen</b></span><button id="ibtn">Install</button><button onclick="document.getElementById(\'ib\').classList.remove(\'show\')" style="background:none;border:none;color:rgba(255,255,255,0.3);font-size:1rem;cursor:pointer;padding:4px">×</button>';document.body.prepend(ib);
  // Clock
  function tick(){var el=document.getElementById('app-clock');if(el)el.textContent=new Date().toUTCString().slice(17,25)+' UTC'}tick();setInterval(tick,5000);
  // PWA
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');
  var dp;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();dp=e;document.getElementById('ib').classList.add('show')});
  document.getElementById('ibtn').addEventListener('click',function(){if(dp){dp.prompt();dp.userChoice.then(function(){dp=null;document.getElementById('ib').classList.remove('show')})}});
  // Data
  var DATA={};
  function loadData(){
    return apiFetch('/api/all').then(function(r){
      if(!r)return;
      DATA=r;window.APP={DATA:DATA,PAGE:PAGE};
      document.dispatchEvent(new CustomEvent('app:ready',{detail:DATA}));
    });
  }
  // WebSocket
  function connectWS(){try{var u=(location.protocol==='https:'?'wss:':'ws:')+'//'+(location.hostname==='localhost'?'localhost:8000':location.host)+'/ws/prices';var w=new WebSocket(u);w.onmessage=function(e){try{var m=JSON.parse(e.data);if(m.type==='prices')document.dispatchEvent(new CustomEvent('app:prices',{detail:m.data}))}catch(x){}};w.onclose=function(){setTimeout(connectWS,5000)};w.onerror=function(){}}catch(e){}}
  // Logout
  window.CP={logout:function(){clearToken();window.location.href='login.html'},DATA:DATA,apiFetch:apiFetch,isLoggedIn:isLoggedIn};
  loadData().then(connectWS);
  // Utils
  window.fmt=function(n){if(n==null||isNaN(n))return'—';if(n>=1000)return n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});if(n>=1)return n.toFixed(2);if(n>=0.01)return n.toFixed(4);return n.toFixed(6)};
})();
