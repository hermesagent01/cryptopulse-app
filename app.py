#!/usr/bin/env python3
"""CryptoPulse — Full Application Server"""
import json, os, time, asyncio, hashlib, secrets, subprocess, threading, sqlite3, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
import jwt
from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

BASE = Path(__file__).parent
DB = BASE / "cryptopulse.db"
SECRET = os.environ.get("CP_SECRET", secrets.token_hex(32))
EXPIRY = 24  # hours
PORT = int(os.environ.get("PORT", "8000"))

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ═══ DB ═══
def db():
    c = sqlite3.connect(str(DB)); c.row_factory = sqlite3.Row; c.execute("PRAGMA journal_mode=WAL"); return c

def init():
    c = db()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, pw TEXT, created TEXT DEFAULT (datetime('now')), last_login TEXT);
    CREATE TABLE IF NOT EXISTS signals (id INTEGER PRIMARY KEY, pair TEXT UNIQUE, direction TEXT, timeframes TEXT, entry REAL, stop REAL, target REAL, rr REAL, reason TEXT, current_price REAL, active INTEGER DEFAULT 1, created TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS ta (id INTEGER PRIMARY KEY, symbol TEXT, tf TEXT DEFAULT '1H', verdict TEXT, direction TEXT, current_price REAL, entry REAL, stop REAL, target REAL, rr REAL, rsi_1h REAL, rsi_4h REAL, rsi_1d REAL, va_1h TEXT, va_4h TEXT, vol_1h TEXT, vol_4h TEXT, analysis TEXT, date TEXT, updated TEXT DEFAULT (datetime('now')), UNIQUE(symbol, tf));
    CREATE TABLE IF NOT EXISTS portfolio (id INTEGER PRIMARY KEY CHECK(id=1), start_balance REAL DEFAULT 1000, current_balance REAL DEFAULT 1000, total_pnl REAL DEFAULT 0, win_rate REAL DEFAULT 0, total_trades INTEGER DEFAULT 0, wins INTEGER DEFAULT 0, losses INTEGER DEFAULT 0, tp_hit INTEGER DEFAULT 0, sl_hit INTEGER DEFAULT 0, best_trade REAL DEFAULT 0, worst_trade REAL DEFAULT 0, open_positions TEXT DEFAULT '[]', trade_history TEXT DEFAULT '[]', equity_curve TEXT DEFAULT '[{"day":1,"value":1000}]');
    CREATE TABLE IF NOT EXISTS trade_log (id INTEGER PRIMARY KEY CHECK(id=1), total_trades INTEGER DEFAULT 0, tp_hit INTEGER DEFAULT 0, sl_hit INTEGER DEFAULT 0, win_rate REAL DEFAULT 0, total_pnl REAL DEFAULT 0, best_trade REAL DEFAULT 0, open_positions INTEGER DEFAULT 0, last_trades TEXT DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS news (id INTEGER PRIMARY KEY, source TEXT, source_icon TEXT, icon_color TEXT, title TEXT, summary TEXT, date TEXT, category TEXT);
    CREATE TABLE IF NOT EXISTS briefs (id INTEGER PRIMARY KEY, type TEXT, date TEXT, title TEXT, sections TEXT);
    CREATE TABLE IF NOT EXISTS sf (id INTEGER PRIMARY KEY, symbol TEXT UNIQUE, sector TEXT, verdict TEXT, direction TEXT, current_price REAL, entry REAL, stop REAL, target REAL, rr REAL, rsi_1d REAL, ma20 REAL, high14 REAL, low14 REAL, analysis TEXT, updated TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS prices (symbol TEXT PRIMARY KEY, price REAL, updated TEXT DEFAULT (datetime('now')));
    """)
    c.execute("INSERT OR IGNORE INTO portfolio (id) VALUES (1)")
    c.execute("INSERT OR IGNORE INTO trade_log (id) VALUES (1)")
    c.commit(); c.close()

def migrate():
    c = db()
    for name, table, parser in [
        ("signals.json", "signals", lambda d: (d.get("pair"), d.get("direction"), json.dumps(d.get("timeframes",[])), d.get("entry"), d.get("stop"), d.get("target"), d.get("rr"), d.get("reason"), d.get("current_price"), 1 if d.get("active",True) else 0)),
        ("tas.json", "ta", lambda d: (d.get("symbol"), d.get("tf","1H"), d.get("verdict"), d.get("direction"), d.get("current_price"), d.get("entry"), d.get("stop"), d.get("target"), d.get("rr"), d.get("rsi_1h"), d.get("rsi_4h"), d.get("rsi_1d"), d.get("va_1h"), d.get("va_4h"), d.get("vol_1h"), d.get("vol_4h"), d.get("analysis"), d.get("date"))),
        ("news.json", "news", lambda d: (d.get("source"), d.get("source_icon"), d.get("icon_color"), d.get("title"), d.get("summary"), d.get("date"), d.get("category"))),
        ("stocks_forex.json", "sf", lambda d: (d.get("symbol"), d.get("sector"), d.get("verdict"), d.get("direction"), d.get("current_price"), d.get("entry"), d.get("stop"), d.get("target"), d.get("rr"), d.get("rsi_1d"), d.get("ma20"), d.get("high14"), d.get("low14"), d.get("analysis"))),
    ]:
        p = BASE / "data" / name
        if not p.exists(): continue
        rows = json.loads(p.read_text())
        if not isinstance(rows, list): continue
        for r in rows:
            vals = parser(r)
            cols = {"signals":"pair,direction,timeframes,entry,stop,target,rr,reason,current_price,active","ta":"symbol,tf,verdict,direction,current_price,entry,stop,target,rr,rsi_1h,rsi_4h,rsi_1d,va_1h,va_4h,vol_1h,vol_4h,analysis,date","news":"source,source_icon,icon_color,title,summary,date,category","sf":"symbol,sector,verdict,direction,current_price,entry,stop,target,rr,rsi_1d,ma20,high14,low14,analysis"}[table]
            ph = ",".join(["?"]*len(vals))
            try: c.execute(f"INSERT OR IGNORE INTO {table} ({cols}) VALUES ({ph})", vals)
            except: pass
    # Portfolio + trade_log
    for name, table in [("portfolio.json","portfolio"),("trade_log.json","trade_log")]:
        p = BASE / "data" / name
        if not p.exists(): continue
        d = json.loads(p.read_text())
        if table == "portfolio":
            c.execute("UPDATE portfolio SET start_balance=?,current_balance=?,total_pnl=?,win_rate=?,total_trades=?,wins=?,losses=?,tp_hit=?,sl_hit=?,best_trade=?,worst_trade=?,open_positions=?,trade_history=?,equity_curve=? WHERE id=1",
                (d.get("start_balance",1000),d.get("current_balance",1000),d.get("total_pnl",0),d.get("win_rate",0),d.get("total_trades",0),d.get("wins",0),d.get("losses",0),d.get("tp_hit",0),d.get("sl_hit",0),d.get("best_trade",0),d.get("worst_trade",0),json.dumps(d.get("open_positions",[])),json.dumps(d.get("trade_history",[])),json.dumps(d.get("equity_curve",[]))))
        else:
            c.execute("UPDATE trade_log SET total_trades=?,tp_hit=?,sl_hit=?,win_rate=?,total_pnl=?,best_trade=?,open_positions=?,last_trades=? WHERE id=1",
                (d.get("total_trades",0),d.get("tp_hit",0),d.get("sl_hit",0),d.get("win_rate",0),d.get("total_pnl",0),d.get("best_trade",0),d.get("open_positions",0),json.dumps(d.get("last_trades",[]))))
    # Briefs
    p = BASE / "data" / "briefs.json"
    if p.exists():
        b = json.loads(p.read_text())
        for t in ["daily","weekly"]:
            for item in b.get(t,[]):
                try: c.execute("INSERT OR IGNORE INTO briefs (type,date,title,sections) VALUES (?,?,?,?)", (t, item.get("date"), item.get("title"), json.dumps(item.get("sections",[]))))
                except: pass
    c.commit(); c.close()

init(); migrate()

# ═══ AUTH ═══
sec = HTTPBearer(auto_error=False)
def hash_pw(p): return hashlib.sha256(p.encode()).hexdigest()
def mk_token(uid): return jwt.encode({"user_id":uid,"exp":datetime.now(timezone.utc)+timedelta(hours=EXPIRY)}, SECRET, algorithm="HS256")
def verify(t):
    try: return jwt.decode(t, SECRET, algorithms=["HS256"]).get("user_id")
    except: return None
def get_user(creds=Depends(sec)):
    if not creds: return None
    uid = verify(creds.credentials)
    if not uid: return None
    c = db(); u = c.execute("SELECT * FROM users WHERE id=?",(uid,)).fetchone(); c.close()
    return dict(u) if u else None
def require(u=Depends(get_user)):
    if not u: raise HTTPException(401,"Not authenticated")
    return u

# ═══ PRICES ═══
ASSETS = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT","TRXUSDT","DOTUSDT","LINKUSDT","LTCUSDT","BCHUSDT","ATOMUSDT","XLMUSDT","UNIUSDT","NEARUSDT","APTUSDT","SUIUSDT","FETUSDT","INJUSDT","OPUSDT","ARBUSDT"]
prices = {}; last_price = 0
def fetch_prices():
    global prices, last_price
    try:
        p = "%2C".join([f"%22{a}%22" for a in ASSETS])
        req = urllib.request.Request(f"https://api.binance.com/api/v3/ticker/price?symbols=[{p}]", headers={"User-Agent":"CP/1"})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
            if isinstance(data, list):
                prices = {i["symbol"]: float(i["price"]) for i in data}
                last_price = time.time()
                c = db()
                for s, pr in prices.items(): c.execute("INSERT OR REPLACE INTO prices VALUES (?,?,datetime('now'))", (s,pr))
                c.commit(); c.close()
    except Exception as e: print(f"Price error: {e}")
threading.Thread(target=lambda: (fetch_prices(), time.sleep(5)) or None, daemon=True).start()
# Loop
def price_loop():
    while True: fetch_prices(); time.sleep(5)
threading.Thread(target=price_loop, daemon=True).start()

# ═══ ROUTES ═══
@app.post("/api/auth/register")
async def reg(req: Request):
    b = await req.json(); u, p = b.get("username","").strip(), b.get("password","")
    if not u or not p: raise HTTPException(400,"Username and password required")
    if len(p) < 6: raise HTTPException(400,"Password must be 6+ chars")
    c = db()
    if c.execute("SELECT id FROM users WHERE username=?",(u,)).fetchone(): c.close(); raise HTTPException(409,"Username taken")
    c.execute("INSERT INTO users (username,pw) VALUES (?,?)",(u,hash_pw(p))); c.commit()
    user = c.execute("SELECT * FROM users WHERE username=?",(u,)).fetchone(); c.close()
    return {"token": mk_token(user["id"]), "username": u, "expires_in": EXPIRY*3600}

@app.post("/api/auth/login")
async def login(req: Request):
    b = await req.json(); u, p = b.get("username","").strip(), b.get("password","")
    c = db(); user = c.execute("SELECT * FROM users WHERE username=?",(u,)).fetchone()
    if not user: c.close(); raise HTTPException(401,"Invalid credentials")
    if user["pw"] != hash_pw(p): c.close(); raise HTTPException(401,"Invalid credentials")
    c.execute("UPDATE users SET last_login=datetime('now') WHERE id=?",(user["id"],)); c.commit(); c.close()
    return {"token": mk_token(user["id"]), "username": u, "expires_in": EXPIRY*3600}

@app.get("/api/auth/me")
async def me(u=Depends(require)):
    return {"id":u["id"],"username":u["username"],"last_login":u["last_login"]}

@app.get("/api/signals")
async def get_signals():
    c = db(); rows = c.execute("SELECT * FROM signals WHERE active=1 ORDER BY rr DESC").fetchall(); c.close()
    return [{**dict(r), "timeframes": json.loads(r["timeframes"] or "[]"), "active": bool(r["active"])} for r in rows]

@app.get("/api/ta")
async def get_ta():
    c = db(); rows = c.execute("SELECT * FROM ta ORDER BY symbol").fetchall(); c.close()
    return [dict(r) for r in rows]

@app.get("/api/portfolio")
async def get_pf():
    c = db(); r = c.execute("SELECT * FROM portfolio WHERE id=1").fetchone(); c.close()
    if not r: return {"start_balance":1000,"current_balance":1000}
    d = dict(r); d["open_positions"]=json.loads(d.get("open_positions") or "[]"); d["equity_curve"]=json.loads(d.get("equity_curve") or "[]"); d["trade_history"]=json.loads(d.get("trade_history") or "[]"); return d

@app.get("/api/trade-log")
async def get_tl():
    c = db(); r = c.execute("SELECT * FROM trade_log WHERE id=1").fetchone(); c.close()
    if not r: return {"total_trades":0}
    d = dict(r); d["last_trades"]=json.loads(d.get("last_trades") or "[]"); return d

@app.get("/api/stocks-forex")
async def get_sf():
    c = db(); rows = c.execute("SELECT * FROM sf ORDER BY symbol").fetchall(); c.close()
    return [dict(r) for r in rows]

@app.get("/api/news")
async def get_news():
    c = db(); rows = c.execute("SELECT * FROM news ORDER BY id DESC LIMIT 10").fetchall(); c.close()
    return [dict(r) for r in rows]

@app.get("/api/briefs")
async def get_briefs():
    c = db(); rows = c.execute("SELECT * FROM briefs ORDER BY date DESC").fetchall(); c.close()
    r = {"daily":[],"weekly":[]}
    for row in rows:
        b = dict(row); b["sections"]=json.loads(b.get("sections") or "[]"); t=b.pop("type"); r[t].append(b)
    return r

@app.get("/api/prices")
async def get_prices():
    return {"prices": prices, "updated": last_price}

@app.get("/api/all")
async def get_all():
    c = db()
    sigs = [{**dict(r),"timeframes":json.loads(r["timeframes"] or "[]"),"active":bool(r["active"])} for r in c.execute("SELECT * FROM signals WHERE active=1 ORDER BY rr DESC").fetchall()]
    tas = [dict(r) for r in c.execute("SELECT * FROM ta ORDER BY symbol").fetchall()]
    pf = c.execute("SELECT * FROM portfolio WHERE id=1").fetchone()
    pf_d = dict(pf) if pf else {}
    pf_d["open_positions"]=json.loads(pf_d.get("open_positions") or "[]"); pf_d["equity_curve"]=json.loads(pf_d.get("equity_curve") or "[]")
    tl = c.execute("SELECT * FROM trade_log WHERE id=1").fetchone()
    tl_d = dict(tl) if tl else {}; tl_d["last_trades"]=json.loads(tl_d.get("last_trades") or "[]")
    sf = [dict(r) for r in c.execute("SELECT * FROM sf ORDER BY symbol").fetchall()]
    news = [dict(r) for r in c.execute("SELECT * FROM news ORDER BY id DESC LIMIT 10").fetchall()]
    br = c.execute("SELECT * FROM briefs ORDER BY date DESC").fetchall()
    briefs = {"daily":[],"weekly":[]}
    for r in br: b=dict(r); b["sections"]=json.loads(b.get("sections") or "[]"); briefs[b.pop("type")].append(b)
    c.close()
    return {"signals":sigs,"tas":tas,"portfolio":pf_d,"trade_log":tl_d,"stocks_forex":sf,"news":news,"briefs":briefs,"prices":prices}

@app.websocket("/ws/prices")
async def ws_prices(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            await asyncio.sleep(3)
            if prices: await ws.send_json({"type":"prices","data":prices})
    except WebSocketDisconnect: pass

# Static files
@app.get("/") 
async def root(): return FileResponse(str(BASE / "signals.html"))
@app.get("/signals.html")
async def s1(): return FileResponse(str(BASE / "signals.html"))
@app.get("/ta.html")
async def s2(): return FileResponse(str(BASE / "ta.html"))
@app.get("/login.html")
async def s3(): return FileResponse(str(BASE / "login.html"))
for ext, mt in [("shared.css","text/css"),("shared.js","application/javascript"),("manifest.json","application/json"),("sw.js","application/javascript")]:
    def make_handler(f=ext, m=mt):
        async def h(): return FileResponse(str(BASE / f), media_type=m)
        return h
    app.get(f"/{ext}")(make_handler())
for icon in ["pwa-icon-192.png","pwa-icon-512.png"]:
    def make_icon(f=icon):
        async def h(): return FileResponse(str(BASE / f), media_type="image/png")
        return h
    app.get(f"/{icon}")(make_icon())

@app.on_event("startup")
async def startup():
    fetch_prices()
    print(f"🚀 CryptoPulse running on port {PORT} | {len(prices)} prices loaded")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
