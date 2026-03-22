import { createClient } from '@supabase/supabase-js';

const envUrl = ((import.meta as any).env?.VITE_SUPABASE_URL || '').trim();
const envAnonKey = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '').trim();

// Production-safe fallback so stale browser cache or missing VITE env does not white-screen the app.
const fallbackUrl = 'https://ixeagwfaswzalsowaiwo.supabase.co';
const fallbackAnonKey = 'sb_publishable_ZGiakPpAF8lKF9QH9QHSGQ_XNhETQuc';

const supabaseUrl = envUrl || fallbackUrl;
const supabaseAnonKey = envAnonKey || fallbackAnonKey;
const isBrowser = typeof window !== 'undefined';
const isLocalHost = isBrowser && ['localhost', '127.0.0.1'].includes(window.location.hostname);

export const supabaseConfigDiagnostics = {
    envUrlConfigured: Boolean(envUrl),
    envAnonKeyConfigured: Boolean(envAnonKey),
    usingFallbackUrl: !envUrl && Boolean(fallbackUrl),
    usingFallbackAnonKey: !envAnonKey && Boolean(fallbackAnonKey),
    publishReady: Boolean(envUrl && envAnonKey)
};

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[SUPABASE] Missing client config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

if ((supabaseConfigDiagnostics.usingFallbackUrl || supabaseConfigDiagnostics.usingFallbackAnonKey) && !isLocalHost) {
    console.warn(
        '[SUPABASE] Frontend is using fallback Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the deployed environment before publishing.'
    );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
