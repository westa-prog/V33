import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !serviceRoleKey) {
        return res.status(500).json({ error: 'Server configuration error: missing Supabase credentials.' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { username, password, admin_id, assigned_boards, assigned_companies } = req.body;

    if (!username || !password || !admin_id) {
        return res.status(400).json({ error: 'Missing required fields: username, password, admin_id' });
    }

    const pseudoEmail = `${username.toLowerCase().replace(/\s+/g, '')}@v33.local`;

    // 1. Create the user in Supabase Auth (bypassing email confirmation)
    const { data, error } = await supabase.auth.admin.createUser({
        email: pseudoEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: username }
    });

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    const newUserId = data.user.id;

    // 2. Update the auto-created profile with admin binding and assignments
    const { error: updateError } = await supabase.from('profiles').update({
        admin_id,
        role: 'employee',
        assigned_boards: assigned_boards || [],
        assigned_companies: assigned_companies || []
    }).eq('id', newUserId);

    if (updateError) {
        console.error('Profile update failed:', updateError);
    }

    return res.status(200).json({
        success: true,
        loginEmail: pseudoEmail,
        user: { id: newUserId, email: pseudoEmail }
    });
}
