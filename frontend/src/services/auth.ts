import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigMissing = !supabaseUrl || !supabaseAnonKey;

const missingConfigError = (): never => {
  throw new Error(
    'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.'
  );
};

// Lazily error on first use rather than at module load, so the app can
// still render a configuration-error screen (see AuthProvider) instead of
// a blank page on missing env vars.
const unconfiguredClient = new Proxy({} as SupabaseClient, {
  get: () => missingConfigError(),
});

export const supabase: SupabaseClient = supabaseConfigMissing
  ? unconfiguredClient
  : createClient(supabaseUrl as string, supabaseAnonKey as string);
