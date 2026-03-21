import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('[SUPABASE] ⚠️ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    console.warn('[SUPABASE]   Running in SIMULATION mode — DB writes may fail if RLS is active.');
}

export const getDb = () => {
    return createClient(supabaseUrl, supabaseServiceKey);
};
