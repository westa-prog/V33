import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const isUsingAnonFallback = !hasServiceRoleKey && Boolean(process.env.SUPABASE_ANON_KEY);

if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('[SUPABASE] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
    console.warn('[SUPABASE] Running in degraded mode. Admin queries may fail if RLS is active.');
} else if (isUsingAnonFallback) {
    console.warn('[SUPABASE] Falling back to SUPABASE_ANON_KEY on the backend. This is not publish-ready.');
}

export const getDb = () => {
    return createClient(supabaseUrl, supabaseServiceKey);
};

export const getSupabaseAdminConfigSummary = () => ({
    supabaseUrlConfigured: Boolean(supabaseUrl),
    serviceRoleConfigured: hasServiceRoleKey,
    usingAnonFallback: isUsingAnonFallback,
    publishReady: Boolean(supabaseUrl && hasServiceRoleKey)
});
