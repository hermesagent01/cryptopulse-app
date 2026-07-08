// CryptoPulse — frontend config (Supabase + static)
// anon key only — safe to ship to the browser. service_role lives ONLY in Vercel env vars / serverless functions.
window.CP_CONFIG = {
  SUPABASE_URL: "https://pufvldoxyxfxdyjsbgpr.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_c-GOFO8B8nxaONdlJGG4Pw_Br4Ax8m_",
  // serverless proxies (same origin on Vercel; relative paths)
  API_PRICES: "/api/prices",
  TRADE_SIZE_USD: 1000.00, // flat virtual size per signal
};
