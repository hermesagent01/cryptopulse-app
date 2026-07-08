// api/_sb.js — server-only Supabase client (service_role). NEVER import in frontend.
const { createClient } = require('@supabase/supabase-js');
const URL = process.env.SUPABASE_URL || "https://pufvldoxyxfxdyjsbgpr.supabase.co";
// service_role MUST be set as a Vercel env var (SUPABASE_SERVICE_ROLE). Never hardcode.
const KEY = process.env.SUPABASE_SERVICE_ROLE;
if(!KEY){ throw new Error("SUPABASE_SERVICE_ROLE env var not set"); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });
module.exports = sb;
