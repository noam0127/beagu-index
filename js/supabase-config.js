const SUPABASE_URL = "https://snvzwrexuqavnfvzgxqj.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_WbByHRhd0RmNiRrYHaINXQ_u5dfegL2";

// Browser sessions persist across refreshes and automatically rotate tokens.
// Permission checks must still use Auth getUser() and the Level API; persistence
// does not imply Lv2/Lv3 authorization.
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  { auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  } }
);
