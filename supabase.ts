import { createClient } from '@supabase/supabase-js';

const envUrl = ((import.meta as any).env?.VITE_SUPABASE_URL || '').trim();
const envAnonKey = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '').trim();

// Production-safe fallback so stale browser cache or missing VITE env does not white-screen the app.
const fallbackUrl = 'https://ixeagwfaswzalsowaiwo.supabase.co';
const fallbackAnonKey = 'sb_publishable_ZGiakPpAF8lKF9QH9QHSGQ_XNhETQuc';

const supabaseUrl = envUrl || fallbackUrl;
const supabaseAnonKey = envAnonKey || fallbackAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[SUPABASE] Missing client config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
