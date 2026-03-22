import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDb } from './services/supabaseAdmin';
import { sendCustomBroadcastEmail } from './services/emailSender';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
    dest: uploadDir,
    limits: {
        files: 10,
        fileSize: 15 * 1024 * 1024
    }
});
const PORT = process.env.PORT || 5000;
const frontendDistPath = path.resolve(__dirname, '../../dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');

const normalizeList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => typeof item === 'string' ? item.trim() : '')
        .filter(Boolean);
};
const normalizeBoardName = (value: unknown): string => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return '';
    const upper = raw.toUpperCase();
    if (upper === 'A' || upper === 'BOARD A') return 'Board A';
    if (upper === 'B' || upper === 'BOARD B') return 'Board B';
    if (upper === 'C' || upper === 'BOARD C') return 'Board C';
    return raw;
};
const boardNameToId = (value: unknown): string | null => {
    const normalized = normalizeBoardName(value);
    if (!normalized) return null;
    const upper = normalized.toUpperCase();
    if (upper === 'BOARD A' || upper === 'A') return 'A';
    if (upper === 'BOARD B' || upper === 'B') return 'B';
    if (upper === 'BOARD C' || upper === 'C') return 'C';
    return null;
};
const pickAssignedBoards = (profile: any): string[] => {
    if (Array.isArray(profile?.assigned_boards)) {
        return normalizeList(profile.assigned_boards).map(normalizeBoardName).filter(Boolean);
    }
    if (typeof profile?.assigned_board === 'string' && profile.assigned_board.trim()) {
        return [normalizeBoardName(profile.assigned_board)];
    }
    if (typeof profile?.board_id === 'string' && profile.board_id.trim()) {
        return [normalizeBoardName(profile.board_id)];
    }
    if (typeof profile?.board === 'string' && profile.board.trim()) {
        return [normalizeBoardName(profile.board)];
    }
    return [];
};
const pickAssignedCompanies = (profile: any): string[] => {
    if (Array.isArray(profile?.assigned_companies)) {
        return normalizeList(profile.assigned_companies);
    }
    if (typeof profile?.assigned_company === 'string' && profile.assigned_company.trim()) {
        return [profile.assigned_company.trim()];
    }
    return [];
};
const pickMetadataList = (value: unknown): string[] => {
    if (Array.isArray(value)) return normalizeList(value);
    if (typeof value === 'string' && value.trim()) return [value.trim()];
    return [];
};
const readUserMetadata = (user: any) => {
    const meta = user?.user_metadata || {};
    return {
        role: typeof meta.role === 'string' ? meta.role : undefined,
        admin_id: typeof meta.admin_id === 'string' ? meta.admin_id : undefined,
        assigned_boards: pickMetadataList(meta.assigned_boards || meta.assigned_board).map(normalizeBoardName).filter(Boolean),
        assigned_companies: pickMetadataList(meta.assigned_companies || meta.assigned_company)
    };
};
const isProfileSchemaMismatch = (message: string) => {
    return /assigned_boards|assigned_board|assigned_companies|admin_id|board_id|company_id/i.test(message || '');
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const ALLOWED_BOARDS = new Set(['Board A', 'Board B', 'Board C']);
const ADMIN_EMAIL = 'westa@algogroup.us';
const LEGACY_PSEUDO_EMAIL_DOMAIN = 'v33.local';
const PSEUDO_EMAIL_DOMAIN = String(process.env.PSEUDO_EMAIL_DOMAIN || 'dilshod.algo')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '') || 'dilshod.algo';
const isPseudoEmployeeEmail = (email: unknown) => {
    const value = String(email || '').trim().toLowerCase();
    return value.endsWith(`@${PSEUDO_EMAIL_DOMAIN}`) || value.endsWith(`@${LEGACY_PSEUDO_EMAIL_DOMAIN}`);
};

const cleanupUploads = (files: Express.Multer.File[] = []) => {
    for (const file of files) {
        try {
            fs.unlinkSync(file.path);
        } catch (err) {
            console.error(`[UPLOAD] Failed to delete temp file ${file.path}:`, err);
        }
    }
};

app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        emailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
        uploadsEnabled: true,
        uptimeSeconds: Math.round(process.uptime())
    });
});

app.post('/api/admin/create-user', async (req, res) => {
    try {
        const { username, password, admin_id, admin_email, assigned_boards, assigned_companies } = req.body;

        if (!username || !password || !admin_id || !admin_email) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const normalizedUsername = String(username).trim();
        const normalizedPassword = String(password);
        const normalizedAdminEmail = String(admin_email).trim().toLowerCase();
        const normalizedBoards = normalizeList(assigned_boards).map(normalizeBoardName).filter(Boolean);
        const normalizedCompanies = normalizeList(assigned_companies);
        const primaryBoardId = boardNameToId(normalizedBoards[0] || null);

        if (normalizedUsername.length < 3) {
            res.status(400).json({ error: 'Username must be at least 3 characters.' });
            return;
        }

        if (normalizedPassword.length < 8) {
            res.status(400).json({ error: 'Password must be at least 8 characters.' });
            return;
        }

        if (!isValidEmail(normalizedAdminEmail)) {
            res.status(400).json({ error: 'A valid admin email is required.' });
            return;
        }

        if (!isUuid(String(admin_id))) {
            res.status(400).json({ error: 'A valid admin_id is required.' });
            return;
        }

        if (normalizedBoards.some((board) => !ALLOWED_BOARDS.has(board))) {
            res.status(400).json({ error: 'Only Board A, Board B, or Board C are allowed.' });
            return;
        }

        const supabase = getDb();
        const usernameSlug = normalizedUsername.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
        const pseudoEmail = `${usernameSlug || 'employee'}@${PSEUDO_EMAIL_DOMAIN}`;

        const { data, error } = await supabase.auth.admin.createUser({
            email: pseudoEmail,
            password: normalizedPassword,
            email_confirm: true,
            user_metadata: {
                full_name: normalizedUsername,
                role: 'employee',
                admin_id,
                assigned_boards: normalizedBoards,
                assigned_companies: normalizedCompanies
            }
        });

        if (error) throw error;

        const newUserId = data.user.id;
        let { error: profileUpsertError } = await supabase.from('profiles').upsert({
            id: newUserId,
            email: pseudoEmail,
            name: normalizedUsername,
            admin_id,
            role: 'employee',
            assigned_boards: normalizedBoards,
            assigned_companies: normalizedCompanies,
            board_id: primaryBoardId
        }, { onConflict: 'id' });

        if (profileUpsertError && isProfileSchemaMismatch(String(profileUpsertError.message || ''))) {
            const legacyPayload: any = {
                id: newUserId,
                email: pseudoEmail,
                name: normalizedUsername,
                admin_id,
                role: 'employee',
                assigned_board: normalizedBoards[0] || null
            };
            if (normalizedCompanies.length > 0) {
                legacyPayload.assigned_company = normalizedCompanies[0];
            }
            const legacyRes = await supabase.from('profiles').upsert(legacyPayload, { onConflict: 'id' });
            profileUpsertError = legacyRes.error || null;
        }

        if (profileUpsertError) {
            const missingAdminColumn = /admin_id/i.test(String(profileUpsertError.message || ''));
            if (!missingAdminColumn) {
                console.error('[API] Failed to upsert profile assignments:', profileUpsertError);
                res.status(500).json({ error: `User created, but profile mapping failed: ${profileUpsertError.message}` });
                return;
            }
            console.warn('[API] Legacy profiles schema detected (missing admin_id). Using auth metadata mapping.');
        }

        const subject = `New Employee Account: ${normalizedUsername}`;
        const message = `
            <div style="font-family: sans-serif; padding: 20px;">
                <h2>New Employee Credentials Generated</h2>
                <p>You have successfully created an account for <strong>${normalizedUsername}</strong>.</p>
                <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Login Email:</strong> ${pseudoEmail}</p>
                    <p><strong>Password:</strong> ${normalizedPassword}</p>
                </div>
                <p>They can use this email and password to log in. They will only see drivers for their assigned boards/companies.</p>
            </div>
        `;

        const credentialEmailSent = await sendCustomBroadcastEmail([normalizedAdminEmail], subject, message, []);
        if (!credentialEmailSent) {
            res.status(502).json({
                error: 'User created, but failed to send credential email to admin.',
                userCreated: true,
                loginEmail: pseudoEmail
            });
            return;
        }

        res.json({ success: true, user: data.user, loginEmail: pseudoEmail, credentialEmailSent: true });
    } catch (e: any) {
        console.error('[API] Admin create-user failed:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const adminId = String(req.query.admin_id || '').trim();
        if (!isUuid(adminId)) {
            res.status(400).json({ error: 'A valid admin_id is required.' });
            return;
        }

        const supabase = getDb();
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('admin_id', adminId)
            .order('created_at', { ascending: false });

        if (!error) {
            const mapped: any[] = [];
            for (const row of (data || [])) {
                const { data: userData } = await supabase.auth.admin.getUserById(row.id);
                const meta = readUserMetadata(userData?.user);
                mapped.push({
                    id: row.id,
                    email: row.email,
                    name: row.name,
                    role: row.role,
                    created_at: row.created_at,
                    // Metadata is the source of truth in mixed legacy schemas.
                    assigned_boards: meta.assigned_boards.length > 0 ? meta.assigned_boards : pickAssignedBoards(row),
                    assigned_companies: meta.assigned_companies.length > 0 ? meta.assigned_companies : pickAssignedCompanies(row),
                    landing_html: userData?.user?.user_metadata?.landing_html || '',
                    email_template: userData?.user?.user_metadata?.email_template || '',
                    email_templates: userData?.user?.user_metadata?.email_templates || {}
                });
            }
            res.json({ success: true, users: mapped });
            return;
        }

        if (!/admin_id/i.test(String(error.message || ''))) {
            res.status(500).json({ error: error.message });
            return;
        }

        const fallbackUsers: any[] = [];
        let page = 1;
        while (page <= 20) {
            const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
            if (listError) {
                res.status(500).json({ error: listError.message });
                return;
            }
            const users = listData?.users || [];
            for (const u of users) {
                const meta = readUserMetadata(u);
                if (meta.admin_id === adminId) {
                    fallbackUsers.push({
                        id: u.id,
                        email: u.email,
                        name: u.user_metadata?.full_name || u.email,
                        role: meta.role || 'employee',
                        created_at: u.created_at,
                        assigned_boards: meta.assigned_boards,
                        assigned_companies: meta.assigned_companies,
                        landing_html: u.user_metadata?.landing_html || '',
                        email_template: u.user_metadata?.email_template || '',
                        email_templates: u.user_metadata?.email_templates || {}
                    });
                }
            }
            if (users.length < 200) break;
            page += 1;
        }
        res.json({ success: true, users: fallbackUsers });
    } catch (e: any) {
        console.error('[API] Admin list-users failed:', e);
        res.status(500).json({ error: e.message || 'Failed to load users.' });
    }
});

app.patch('/api/admin/users/:userId', async (req, res) => {
    try {
        const userId = String(req.params.userId || '').trim();
        const { admin_id, assigned_boards, assigned_companies, password, landing_html, email_template, email_templates } = req.body || {};
        const normalizedAdminId = String(admin_id || '').trim();

        if (!isUuid(userId) || !isUuid(normalizedAdminId)) {
            res.status(400).json({ error: 'Valid userId and admin_id are required.' });
            return;
        }

        const normalizedBoards = normalizeList(assigned_boards).map(normalizeBoardName).filter(Boolean);
        const normalizedCompanies = normalizeList(assigned_companies);
        const primaryBoardId = boardNameToId(normalizedBoards[0] || null);
        if (normalizedBoards.some((board) => !ALLOWED_BOARDS.has(board))) {
            res.status(400).json({ error: 'Only Board A, Board B, or Board C are allowed.' });
            return;
        }
        if (password && String(password).length < 8) {
            res.status(400).json({ error: 'Password must be at least 8 characters.' });
            return;
        }

        const supabase = getDb();
        const { data: targetProfile, error: targetError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        let targetIsOwnedByAdmin = false;
        if (!targetError && targetProfile) {
            targetIsOwnedByAdmin = targetProfile.admin_id === normalizedAdminId;
            if (!targetIsOwnedByAdmin) {
                const { data: userData } = await supabase.auth.admin.getUserById(userId);
                const meta = readUserMetadata(userData?.user);
                targetIsOwnedByAdmin = meta.admin_id === normalizedAdminId;
            }
        } else if (/admin_id/i.test(String(targetError?.message || ''))) {
            const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId);
            if (userErr || !userData?.user) {
                res.status(404).json({ error: 'User not found.' });
                return;
            }
            const meta = readUserMetadata(userData.user);
            targetIsOwnedByAdmin = meta.admin_id === normalizedAdminId;
        } else {
            res.status(404).json({ error: 'User profile not found.' });
            return;
        }
        if (!targetIsOwnedByAdmin) {
            res.status(403).json({ error: 'This user is not assigned to the provided admin.' });
            return;
        }

        let { error: profileUpdateError } = await supabase
            .from('profiles')
            .update({
                assigned_boards: normalizedBoards,
                assigned_companies: normalizedCompanies,
                board_id: primaryBoardId
            })
            .eq('id', userId);

        if (profileUpdateError && isProfileSchemaMismatch(String(profileUpdateError.message || ''))) {
            const legacyUpdate: any = {
                assigned_board: normalizedBoards[0] || null
            };
            if (normalizedCompanies.length > 0) {
                legacyUpdate.assigned_company = normalizedCompanies[0];
            }
            const legacyRes = await supabase
                .from('profiles')
                .update(legacyUpdate)
                .eq('id', userId);
            profileUpdateError = legacyRes.error || null;
        }

        if (profileUpdateError) {
            const errorMessage = String(profileUpdateError.message || '');
            if (!isProfileSchemaMismatch(errorMessage)) {
                res.status(500).json({ error: profileUpdateError.message });
                return;
            }
            console.warn('[API] Skipping profile board/company update due to schema mismatch. Continuing with auth metadata update.');
        }

        const { data: existingUser, error: existingUserError } = await supabase.auth.admin.getUserById(userId);
        if (existingUserError || !existingUser?.user) {
            res.status(500).json({ error: existingUserError?.message || 'Could not load user for metadata update.' });
            return;
        }
        const currentMeta = existingUser.user.user_metadata || {};
        const safeEmailTemplates = (email_templates && typeof email_templates === 'object')
            ? email_templates
            : (currentMeta.email_templates || {});
        const { error: metadataUpdateError } = await supabase.auth.admin.updateUserById(userId, {
            user_metadata: {
                ...currentMeta,
                role: 'employee',
                admin_id: normalizedAdminId,
                assigned_boards: normalizedBoards,
                assigned_companies: normalizedCompanies,
                landing_html: typeof landing_html === 'string' ? landing_html : (currentMeta.landing_html || ''),
                email_template: typeof email_template === 'string' ? email_template : (currentMeta.email_template || ''),
                email_templates: safeEmailTemplates
            }
        });
        if (metadataUpdateError) {
            res.status(500).json({ error: `User metadata update failed: ${metadataUpdateError.message}` });
            return;
        }

        if (password) {
            const { error: passwordError } = await supabase.auth.admin.updateUserById(userId, {
                password: String(password)
            });
            if (passwordError) {
                res.status(500).json({ error: `Boards updated, but password update failed: ${passwordError.message}` });
                return;
            }
        }

        res.json({ success: true });
    } catch (e: any) {
        console.error('[API] Admin update-user failed:', e);
        res.status(500).json({ error: e.message || 'Failed to update user.' });
    }
});

app.post('/api/admin/repair-users', async (req, res) => {
    try {
        const { admin_id, default_boards } = req.body || {};
        const normalizedAdminId = String(admin_id || '').trim();
        const normalizedBoards = normalizeList(default_boards).map(normalizeBoardName).filter(Boolean);

        if (!isUuid(normalizedAdminId)) {
            res.status(400).json({ error: 'A valid admin_id is required.' });
            return;
        }
        if (normalizedBoards.length === 0) {
            res.status(400).json({ error: 'At least one default board is required.' });
            return;
        }
        if (normalizedBoards.some((board) => !ALLOWED_BOARDS.has(board))) {
            res.status(400).json({ error: 'Only Board A, Board B, or Board C are allowed.' });
            return;
        }

        const supabase = getDb();
        const { data: candidates, error: candidateError } = await supabase
            .from('profiles')
            .select('*');

        let list = (candidates || []).filter((row: any) =>
            isPseudoEmployeeEmail(row?.email) || !row?.admin_id || !row?.role
        );
        if (candidateError && /admin_id/i.test(String(candidateError.message || ''))) {
            let page = 1;
            const metaList: any[] = [];
            while (page <= 20) {
                const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
                if (listError) {
                    res.status(500).json({ error: listError.message });
                    return;
                }
                const users = listData?.users || [];
                for (const u of users) {
                    if (isPseudoEmployeeEmail(u.email)) {
                        metaList.push({
                            id: u.id,
                            email: u.email,
                            role: u.user_metadata?.role,
                            admin_id: u.user_metadata?.admin_id,
                            assigned_boards: u.user_metadata?.assigned_boards
                        });
                    }
                }
                if (users.length < 200) break;
                page += 1;
            }
            list = metaList;
        } else if (candidateError) {
            res.status(500).json({ error: candidateError.message });
            return;
        }
        let repaired = 0;
        const repairedIds: string[] = [];

        for (const row of list) {
            const currentBoards = pickAssignedBoards(row);
            const needsAdmin = !row.admin_id;
            const needsRole = !row.role || row.role !== 'employee';
            const needsBoards = currentBoards.length === 0;
            if (!needsAdmin && !needsRole && !needsBoards) continue;

            let { error: updateError } = await supabase
                .from('profiles')
                .update({
                    admin_id: row.admin_id || normalizedAdminId,
                    role: 'employee',
                    assigned_boards: needsBoards ? normalizedBoards : currentBoards,
                    board_id: boardNameToId((needsBoards ? normalizedBoards : currentBoards)[0] || null)
                })
                .eq('id', row.id);

            if (updateError && /assigned_boards/i.test(String(updateError.message || ''))) {
                const legacyRes = await supabase
                    .from('profiles')
                    .update({
                        admin_id: row.admin_id || normalizedAdminId,
                        role: 'employee',
                        assigned_board: (needsBoards ? normalizedBoards : currentBoards)[0] || null
                    })
                    .eq('id', row.id);
                updateError = legacyRes.error || null;
            }

            if (!updateError) {
                repaired += 1;
                repairedIds.push(row.id);
            } else {
                console.error(`[API] Failed to repair legacy profile ${row.id}:`, updateError);
            }

            const { data: existingUser, error: existingUserError } = await supabase.auth.admin.getUserById(row.id);
            if (!existingUserError && existingUser?.user) {
                const currentMeta = existingUser.user.user_metadata || {};
                await supabase.auth.admin.updateUserById(row.id, {
                    user_metadata: {
                        ...currentMeta,
                        role: 'employee',
                        admin_id: row.admin_id || normalizedAdminId,
                        assigned_boards: needsBoards ? normalizedBoards : currentBoards
                    }
                });
            }
        }

        res.json({ success: true, repaired, repairedIds });
    } catch (e: any) {
        console.error('[API] Admin repair-users failed:', e);
        res.status(500).json({ error: e.message || 'Failed to repair users.' });
    }
});

app.post('/api/drivers/create', async (req, res) => {
    try {
        const { acting_user_id, name, email, company, company_id, board, dutyStatus } = req.body || {};

        if (!acting_user_id || !name || !email || !company) {
            res.status(400).json({ error: 'acting_user_id, name, email, and company are required.' });
            return;
        }

        const normalizedActingUserId = String(acting_user_id).trim();
        const normalizedName = String(name).trim();
        const normalizedEmail = String(email).trim().toLowerCase();
        const normalizedCompany = String(company).trim();
        const normalizedBoardInput = normalizeBoardName(String(board || '').trim());
        const normalizedBoardId = normalizedBoardInput.toUpperCase().replace('BOARD ', '');

        if (!isUuid(normalizedActingUserId)) {
            res.status(400).json({ error: 'A valid acting_user_id is required.' });
            return;
        }
        if (normalizedName.length < 2) {
            res.status(400).json({ error: 'Driver name must be at least 2 characters.' });
            return;
        }
        if (!isValidEmail(normalizedEmail)) {
            res.status(400).json({ error: 'A valid driver email is required.' });
            return;
        }
        if (normalizedCompany.length < 2) {
            res.status(400).json({ error: 'Company is required.' });
            return;
        }

        const supabase = getDb();
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', normalizedActingUserId)
            .single();

        let role = profile?.role;
        let profileEmail = profile?.email;
        let profileId = profile?.id || normalizedActingUserId;
        let adminId = profile?.admin_id;
        let assignedBoards = pickAssignedBoards(profile);
        let assignedCompanies = pickAssignedCompanies(profile);

        if (profileError || !profile) {
            const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(normalizedActingUserId);
            if (userErr || !userData?.user) {
                res.status(403).json({ error: 'Unable to resolve acting user profile.' });
                return;
            }
            const meta = readUserMetadata(userData.user);
            role = meta.role;
            adminId = meta.admin_id;
            assignedBoards = meta.assigned_boards;
            assignedCompanies = meta.assigned_companies;
            profileEmail = userData.user.email;
            profileId = userData.user.id;
        } else {
            const { data: userData } = await supabase.auth.admin.getUserById(normalizedActingUserId);
            const meta = readUserMetadata(userData?.user);
            role = role || meta.role;
            adminId = adminId || meta.admin_id;
            if (assignedBoards.length === 0) assignedBoards = meta.assigned_boards;
            if (assignedCompanies.length === 0) assignedCompanies = meta.assigned_companies;
        }

        const isAdmin = role === 'admin' || String(profileEmail || '').toLowerCase() === ADMIN_EMAIL;
        const ownerUserId = isAdmin ? profileId : adminId;
        if (!ownerUserId) {
            res.status(403).json({ error: 'Employee is not mapped to an admin account.' });
            return;
        }

        let effectiveBoard = normalizedBoardInput || 'Board A';
        if (isAdmin) {
            if (!ALLOWED_BOARDS.has(effectiveBoard)) {
                res.status(400).json({ error: 'Only Board A, Board B, or Board C are allowed.' });
                return;
            }
        } else {
            if (assignedBoards.length === 0) {
                res.status(403).json({ error: 'Employee has no assigned boards.' });
                return;
            }
            effectiveBoard = normalizeBoardName(assignedBoards[0]) || 'Board A';
            if (assignedCompanies.length > 0 && !assignedCompanies.includes(normalizedCompany)) {
                res.status(403).json({ error: 'Employee cannot create drivers outside assigned companies.' });
                return;
            }
        }

        let resolvedCompanyId: string | null = null;
        if (company_id && isUuid(String(company_id))) {
            resolvedCompanyId = String(company_id);
        } else {
            const targetBoardId = normalizedBoardId || (effectiveBoard.toUpperCase().replace('BOARD ', ''));
            const { data: existingCompany } = await supabase
                .from('companies')
                .select('id')
                .eq('name', normalizedCompany)
                .eq('board_id', targetBoardId)
                .maybeSingle();
            if (existingCompany?.id) {
                resolvedCompanyId = existingCompany.id;
            } else {
                const { data: insertedCompany, error: insertCompanyError } = await supabase
                    .from('companies')
                    .insert({
                        name: normalizedCompany,
                        board_id: targetBoardId,
                        created_by: isAdmin ? profileId : adminId
                    })
                    .select('id')
                    .single();
                if (!insertCompanyError && insertedCompany?.id) {
                    resolvedCompanyId = insertedCompany.id;
                }
            }
        }

        const nowIso = new Date().toISOString();
        const driverId = crypto.randomUUID();
        const driverRow = {
            id: driverId,
            name: normalizedName,
            email: normalizedEmail,
            company_id: resolvedCompanyId,
            board_id: effectiveBoard.toUpperCase().replace('BOARD ', ''),
            created_by: normalizedActingUserId,
            created_at: nowIso,
            updated_at: nowIso
        };

        const { error: insertError } = await supabase.from('drivers_new').insert(driverRow);
        if (insertError) {
            res.status(500).json({ error: insertError.message });
            return;
        }

        const actorLabel = profile?.name || profileEmail || profileId;
        const activityContent = `[ACTIVITY] ${actorLabel} created driver ${normalizedName} (${normalizedEmail}) in ${normalizedCompany}, ${effectiveBoard}`;
        await supabase.from('email_logs').insert({
            id: crypto.randomUUID(),
            user_id: ownerUserId,
            driver_id: driverId,
            driver_name: normalizedName,
            timestamp: nowIso,
            status_at_time: String(dutyStatus || 'Not Set'),
            content: activityContent,
            sent_via: 'System',
            type: 'activity'
        });

        res.json({
            success: true,
            driver: {
                id: driverId,
                name: normalizedName,
                email: normalizedEmail,
                company_id: resolvedCompanyId,
                board_id: effectiveBoard.toUpperCase().replace('BOARD ', ''),
                company: normalizedCompany,
                board: effectiveBoard
            }
        });
    } catch (e: any) {
        console.error('[API] Driver create failed:', e);
        res.status(500).json({ error: e.message || 'Failed to create driver.' });
    }
});

app.post('/api/companies/create', async (req, res) => {
    try {
        const { acting_user_id, name, board } = req.body || {};
        if (!acting_user_id || !name) {
            res.status(400).json({ error: 'acting_user_id and name are required.' });
            return;
        }

        const normalizedActingUserId = String(acting_user_id).trim();
        const normalizedName = String(name).trim();
        if (!isUuid(normalizedActingUserId)) {
            res.status(400).json({ error: 'A valid acting_user_id is required.' });
            return;
        }
        if (normalizedName.length < 2) {
            res.status(400).json({ error: 'Company name must be at least 2 characters.' });
            return;
        }

        const supabase = getDb();
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', normalizedActingUserId)
            .single();
        const { data: userData } = await supabase.auth.admin.getUserById(normalizedActingUserId);
        const meta = readUserMetadata(userData?.user);

        const role = profile?.role || meta.role;
        const adminId = profile?.admin_id || meta.admin_id;
        const assignedBoards = pickAssignedBoards(profile).length > 0 ? pickAssignedBoards(profile) : meta.assigned_boards;
        const isAdmin = role === 'admin' || String(profile?.email || userData?.user?.email || '').toLowerCase() === ADMIN_EMAIL;

        let effectiveBoard = normalizeBoardName(String(board || '').trim()) || 'Board A';
        if (isAdmin) {
            if (!ALLOWED_BOARDS.has(effectiveBoard)) {
                res.status(400).json({ error: 'Only Board A, Board B, or Board C are allowed.' });
                return;
            }
        } else {
            if (assignedBoards.length === 0) {
                res.status(403).json({ error: 'Employee has no assigned boards.' });
                return;
            }
            effectiveBoard = normalizeBoardName(assignedBoards[0]);
        }

        const boardId = effectiveBoard.toUpperCase().replace('BOARD ', '');
        const { data: existing } = await supabase
            .from('companies')
            .select('id,name,board_id')
            .eq('name', normalizedName)
            .eq('board_id', boardId)
            .maybeSingle();
        if (existing?.id) {
            res.json({ success: true, company: existing, existed: true });
            return;
        }

        const createdBy = isAdmin ? normalizedActingUserId : (adminId || normalizedActingUserId);
        const { data: inserted, error: insertError } = await supabase
            .from('companies')
            .insert({
                name: normalizedName,
                board_id: boardId,
                created_by: createdBy
            })
            .select('id,name,board_id')
            .single();

        if (insertError) {
            res.status(500).json({ error: insertError.message });
            return;
        }

        res.json({ success: true, company: inserted });
    } catch (e: any) {
        console.error('[API] Company create failed:', e);
        res.status(500).json({ error: e.message || 'Failed to create company.' });
    }
});

const handleBroadcast = async (req: express.Request, res: express.Response) => {
    const files = req.files as Express.Multer.File[] | undefined;

    try {
        const { recipients, subject, message } = req.body;

        if (!recipients || !subject || !message) {
            res.status(400).json({ error: 'Recipients, subject, and message are required.' });
            return;
        }

        let recipientList: unknown;
        try {
            recipientList = typeof recipients === 'string' ? JSON.parse(recipients) : recipients;
        } catch {
            res.status(400).json({ error: 'Recipients must be a valid JSON array.' });
            return;
        }
        const normalizedRecipients = normalizeList(recipientList);
        const normalizedSubject = String(subject).trim();
        const normalizedMessage = String(message).trim();

        if (normalizedRecipients.length === 0) {
            res.status(400).json({ error: 'At least one valid recipient is required.' });
            return;
        }

        if (normalizedSubject.length < 3) {
            res.status(400).json({ error: 'Subject must be at least 3 characters.' });
            return;
        }

        if (normalizedMessage.length < 3) {
            res.status(400).json({ error: 'Message must be at least 3 characters.' });
            return;
        }

        if (normalizedRecipients.some((email) => !isValidEmail(email))) {
            res.status(400).json({ error: 'All recipients must be valid email addresses.' });
            return;
        }

        const emailAttachments = (files || []).map(file => ({
            filename: file.originalname,
            path: file.path
        }));

        const success = await sendCustomBroadcastEmail(normalizedRecipients, normalizedSubject, normalizedMessage, emailAttachments);

        if (!success) {
            res.status(500).json({ error: 'Failed to send broadcast email.' });
            return;
        }

        res.json({ success: true, message: 'Broadcast sent successfully!' });
    } catch (error: any) {
        console.error('[BROADCAST] Error handling broadcast:', error);
        res.status(500).json({ error: `Internal server error: ${error.message}` });
    } finally {
        cleanupUploads(files || []);
    }
};

app.post('/api/broadcast', upload.array('attachments', 10), handleBroadcast);

app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API route not found' });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({ error: 'Invalid JSON payload.' });
        return;
    }
    if (err?.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Attachment file size limit exceeded (15MB).' });
        return;
    }
    if (err?.code === 'LIMIT_FILE_COUNT') {
        res.status(400).json({ error: 'Too many attachments. Maximum is 10.' });
        return;
    }
    console.error('[SERVER] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error.' });
});

if (fs.existsSync(frontendIndexPath)) {
    app.use(express.static(frontendDistPath));

    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/')) {
            next();
            return;
        }
        res.sendFile(frontendIndexPath);
    });
} else {
    console.warn(`[SERVER] Frontend build not found at ${frontendIndexPath}. API routes will still work.`);
}

app.listen(PORT, () => {
    console.log(`[SERVER] Backend listening on port ${PORT}`);
});
