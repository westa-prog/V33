import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
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
        const { error: updateError } = await supabase.from('profiles').update({
            admin_id,
            role: 'employee',
            assigned_boards: normalizedBoards,
            assigned_companies: normalizedCompanies
        }).eq('id', newUserId);

        if (updateError) {
            console.error('[API] Failed to update profile assignments:', updateError);
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
