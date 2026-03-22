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

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const ALLOWED_BOARDS = new Set(['Board A', 'Board B', 'Board C']);
const ADMIN_EMAIL = 'westa@algogroup.us';

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
        const normalizedBoards = normalizeList(assigned_boards);
        const normalizedCompanies = normalizeList(assigned_companies);

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
        const pseudoEmail = `${usernameSlug || 'employee'}@v33.local`;

        const { data, error } = await supabase.auth.admin.createUser({
            email: pseudoEmail,
            password: normalizedPassword,
            email_confirm: true,
            user_metadata: { full_name: normalizedUsername }
        });

        if (error) throw error;

        const newUserId = data.user.id;
        const { error: profileUpsertError } = await supabase.from('profiles').upsert({
            id: newUserId,
            email: pseudoEmail,
            name: normalizedUsername,
            admin_id,
            role: 'employee',
            assigned_boards: normalizedBoards,
            assigned_companies: normalizedCompanies
        }, { onConflict: 'id' });

        if (profileUpsertError) {
            console.error('[API] Failed to upsert profile assignments:', profileUpsertError);
            res.status(500).json({ error: `User created, but profile mapping failed: ${profileUpsertError.message}` });
            return;
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
            .select('id, email, name, role, assigned_boards, assigned_companies, created_at')
            .eq('admin_id', adminId)
            .order('created_at', { ascending: false });

        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }

        res.json({ success: true, users: data || [] });
    } catch (e: any) {
        console.error('[API] Admin list-users failed:', e);
        res.status(500).json({ error: e.message || 'Failed to load users.' });
    }
});

app.patch('/api/admin/users/:userId', async (req, res) => {
    try {
        const userId = String(req.params.userId || '').trim();
        const { admin_id, assigned_boards, assigned_companies, password } = req.body || {};
        const normalizedAdminId = String(admin_id || '').trim();

        if (!isUuid(userId) || !isUuid(normalizedAdminId)) {
            res.status(400).json({ error: 'Valid userId and admin_id are required.' });
            return;
        }

        const normalizedBoards = normalizeList(assigned_boards);
        const normalizedCompanies = normalizeList(assigned_companies);
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
            .select('id, admin_id')
            .eq('id', userId)
            .single();

        if (targetError || !targetProfile) {
            res.status(404).json({ error: 'User profile not found.' });
            return;
        }
        if (targetProfile.admin_id !== normalizedAdminId) {
            res.status(403).json({ error: 'This user is not assigned to the provided admin.' });
            return;
        }

        const { error: profileUpdateError } = await supabase
            .from('profiles')
            .update({
                assigned_boards: normalizedBoards,
                assigned_companies: normalizedCompanies
            })
            .eq('id', userId);

        if (profileUpdateError) {
            res.status(500).json({ error: profileUpdateError.message });
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
        const normalizedBoards = normalizeList(default_boards);

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
            .select('id, email, role, admin_id, assigned_boards')
            .ilike('email', '%@v33.local')
            .or('admin_id.is.null,assigned_boards.is.null,role.is.null');

        if (candidateError) {
            res.status(500).json({ error: candidateError.message });
            return;
        }

        const list = candidates || [];
        let repaired = 0;
        const repairedIds: string[] = [];

        for (const row of list) {
            const currentBoards = Array.isArray(row.assigned_boards) ? row.assigned_boards.filter(Boolean) : [];
            const needsAdmin = !row.admin_id;
            const needsRole = !row.role || row.role !== 'employee';
            const needsBoards = currentBoards.length === 0;
            if (!needsAdmin && !needsRole && !needsBoards) continue;

            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    admin_id: row.admin_id || normalizedAdminId,
                    role: 'employee',
                    assigned_boards: needsBoards ? normalizedBoards : currentBoards
                })
                .eq('id', row.id);

            if (!updateError) {
                repaired += 1;
                repairedIds.push(row.id);
            } else {
                console.error(`[API] Failed to repair legacy profile ${row.id}:`, updateError);
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
        const { acting_user_id, name, email, company, board, deviceType, appVersion, eldStatus, dutyStatus, followUp } = req.body || {};

        if (!acting_user_id || !name || !email || !company) {
            res.status(400).json({ error: 'acting_user_id, name, email, and company are required.' });
            return;
        }

        const normalizedActingUserId = String(acting_user_id).trim();
        const normalizedName = String(name).trim();
        const normalizedEmail = String(email).trim().toLowerCase();
        const normalizedCompany = String(company).trim();
        const normalizedBoardInput = String(board || '').trim();

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
            .select('id, email, name, role, admin_id, assigned_boards, assigned_companies')
            .eq('id', normalizedActingUserId)
            .single();

        if (profileError || !profile) {
            res.status(403).json({ error: 'Unable to resolve acting user profile.' });
            return;
        }

        const isAdmin = profile.role === 'admin' || String(profile.email || '').toLowerCase() === ADMIN_EMAIL;
        const ownerUserId = isAdmin ? profile.id : profile.admin_id;
        if (!ownerUserId) {
            res.status(403).json({ error: 'Employee is not mapped to an admin account.' });
            return;
        }

        const assignedBoards = Array.isArray(profile.assigned_boards) ? profile.assigned_boards.filter(Boolean) : [];
        const assignedCompanies = Array.isArray(profile.assigned_companies) ? profile.assigned_companies.filter(Boolean) : [];

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
            effectiveBoard = assignedBoards[0];
            if (assignedCompanies.length > 0 && !assignedCompanies.includes(normalizedCompany)) {
                res.status(403).json({ error: 'Employee cannot create drivers outside assigned companies.' });
                return;
            }
        }

        const nowIso = new Date().toISOString();
        const driverId = crypto.randomUUID();
        const driverRow = {
            id: driverId,
            user_id: ownerUserId,
            name: normalizedName,
            email: normalizedEmail,
            company: normalizedCompany,
            board: effectiveBoard,
            devicetype: String(deviceType || ''),
            appversion: String(appVersion || ''),
            eldstatus: String(eldStatus || 'Connected'),
            dutystatus: String(dutyStatus || 'Not Set'),
            followup: String(followUp || 'None'),
            emailsent: false,
            haspendingalert: false,
            created_at: nowIso,
            updated_at: nowIso
        };

        const { error: insertError } = await supabase.from('drivers').insert(driverRow);
        if (insertError) {
            res.status(500).json({ error: insertError.message });
            return;
        }

        const actorLabel = profile.name || profile.email || profile.id;
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
                company: normalizedCompany,
                board: effectiveBoard
            }
        });
    } catch (e: any) {
        console.error('[API] Driver create failed:', e);
        res.status(500).json({ error: e.message || 'Failed to create driver.' });
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
