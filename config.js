// Public runtime config. Leave both values empty to run with browser-only storage.
// The Supabase anon key is designed to be public; Row Level Security (supabase/schema.sql)
// is what protects data. Never put a service_role key here.
window.POINT_SCRAMBLE_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: ''
};
