import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import * as cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { runSyncWorker, runSyncForUser } from './services/syncWorker';
import { fetchELDData } from './services/eldFetcher';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Set up temporary storage for email attachments
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

const PORT = process.env.PORT || 5000;

let isSyncing = false;
let cronJob: ScheduledTask | null = null;
let lastSyncTime: string | null = null;
let eldAuthVerified = false;  // true once credentials were tested successfully

// Start the cron job to run every hour at minute 0
export const startCron = () => {
    if (cronJob) return;

    // Default: Run every hour '0 * * * *'. For testing, we can use '* * * * *' (every minute)
    const schedule = process.env.CRON_SCHEDULE || '0 * * * *';
    console.log(`[CRON] Starting Scheduler: ${schedule}`);

    cronJob = cron.schedule(schedule, async () => {
        if (isSyncing) {
            console.log('[CRON] Sync already in progress, skipping tick.');
            return;
        }

        isSyncing = true;
        try {
            console.log(`[CRON] Executing Sync Worker at ${new Date().toISOString()}`);
            await runSyncWorker();
            lastSyncTime = new Date().toISOString();
        } catch (error) {
            console.error('[CRON] Error during sync loop:', error);
        } finally {
            isSyncing = false;
        }
    });
};

export const stopCron = () => {
    if (cronJob) {
        cronJob.stop();
        cronJob = null;
        console.log('[CRON] Scheduler Stopped');
    }
};

// Start it immediately
startCron();

// API Routes
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        cronActive: !!cronJob,
        lastSyncTime,
        isSyncing
    });
});

// Endpoint: Get driver data from ELD API for debugging
app.get('/api/eld/drivers', async (req, res) => {
    try {
        const drivers = await fetchELDData();
        res.json({ drivers });
    } catch (e) {
        console.error('[API] Error fetching ELD drivers:', e);
        res.status(500).json({ error: 'Failed to fetch driver data' });
    }
});

// Endpoint: Check if ELD credentials are configured and verified
app.get('/api/eld/status', (req, res) => {
    const hasCredentials = !!(process.env.ELD_API_KEY || (process.env.ELD_API_USERNAME && process.env.ELD_API_PASSWORD));
    res.json({
        configured: hasCredentials,
        verified: eldAuthVerified,
        method: process.env.ELD_API_KEY ? 'api_key' : (hasCredentials ? 'username_password' : 'none'),
        baseUrl: process.env.ELD_API_BASE_URL || 'https://api.drivehos.app/api/v1'
    });
});

// Endpoint: Accept ELD credentials from the UI and test authentication
// This lets users enter their ELD admin credentials directly from the app UI
// without needing to edit .env manually.
app.post('/api/eld/configure', async (req, res) => {
    const { username, password, apiKey, baseUrl } = req.body;

    if (!apiKey && (!username || !password)) {
        res.status(400).json({ error: 'Provide either apiKey or both username and password.' });
        return;
    }

    // Set credentials in the running process environment
    if (apiKey) {
        process.env.ELD_API_KEY = apiKey;
        delete process.env.ELD_API_USERNAME;
        delete process.env.ELD_API_PASSWORD;
        console.log('[ELD CONFIG] API Key configured from UI.');
    } else {
        process.env.ELD_API_USERNAME = username;
        process.env.ELD_API_PASSWORD = password;
        delete process.env.ELD_API_KEY;
        console.log(`[ELD CONFIG] Username/Password configured from UI for: ${username}`);
    }
    if (baseUrl) process.env.ELD_API_BASE_URL = baseUrl;

    // Test the credentials by attempting a real auth
    try {
        const { testELDAuth } = await import('./services/eldFetcher');
        const result = await testELDAuth();
        eldAuthVerified = true;
        console.log(`[ELD CONFIG] ✅ Authentication verified! Tenant: ${result.tenantId || 'N/A'}`);

        // Persist working token to .env so it survives backend restarts
        try {
            const envPath = path.join(__dirname, '..', '..', '.env');
            let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
            const setVar = (c: string, k: string, v: string) => {
                const re = new RegExp(`^${k}=.*$`, 'm');
                return re.test(c) ? c.replace(re, `${k}=${v}`) : c + `\n${k}=${v}`;
            };
            if (apiKey) {
                envContent = setVar(envContent, 'ELD_API_KEY', apiKey);
                envContent = envContent.replace(/^ELD_API_USERNAME=.*\n?/m, '').replace(/^ELD_API_PASSWORD=.*\n?/m, '');
            } else {
                envContent = setVar(envContent, 'ELD_API_USERNAME', username);
                envContent = setVar(envContent, 'ELD_API_PASSWORD', password);
                envContent = envContent.replace(/^ELD_API_KEY=.*\n?/m, '');
            }
            if (baseUrl) envContent = setVar(envContent, 'ELD_API_BASE_URL', baseUrl);
            fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
            console.log('[ELD CONFIG] ✅ Token persisted to .env file.');
        } catch (envErr: any) {
            console.warn('[ELD CONFIG] Could not persist to .env:', envErr.message);
        }

        res.json({ success: true, message: 'ELD credentials verified successfully.', tenantId: result.tenantId });
    } catch (e: any) {
        eldAuthVerified = false;
        delete process.env.ELD_API_KEY;
        delete process.env.ELD_API_USERNAME;
        delete process.env.ELD_API_PASSWORD;
        console.error('[ELD CONFIG] ❌ Authentication failed:', e.message);
        res.status(401).json({ error: `ELD authentication failed: ${e.message}` });
    }
});

// Endpoint: Trigger a full ELD import for a specific user
app.post('/api/eld/import-now', async (req, res) => {
    const { supabaseUserId } = req.body;
    if (!supabaseUserId) {
        res.status(400).json({ error: 'supabaseUserId is required in the request body' });
        return;
    }
    
    if (isSyncing) {
        res.status(400).json({ error: 'A sync is already in progress. Please wait.' });
        return;
    }
    
    try {
        isSyncing = true;
        console.log(`[API] Manual import-now triggered for user: ${supabaseUserId}`);
        const result = await runSyncForUser(supabaseUserId);
        lastSyncTime = new Date().toISOString();
        res.json({
            message: 'ELD import complete!',
            lastSyncTime,
            driversProcessed: result?.processedCount || 0,
            databaseWrites: result?.writtenCount || 0
        });
    } catch (e: any) {
        console.error('[API] ELD import-now failed:', e);
        res.status(500).json({ error: e?.message || 'Import failed' });
    } finally {
        isSyncing = false;
    }
});
// Endpoint: Create a sub-user (Employee) via Admin
import { getDb } from './services/supabaseAdmin';

app.post('/api/admin/create-user', async (req, res) => {
    try {
        const { username, password, admin_id, admin_email, assigned_boards, assigned_companies } = req.body;
        
        if (!username || !password || !admin_id || !admin_email) {
             res.status(400).json({ error: 'Missing required fields' });
             return;
        }

        const supabase = getDb();
        const pseudoEmail = `${username.toLowerCase().replace(/\s+/g, '')}@v33.local`;
        
        // 1. Create user in Supabase Auth bypassing standard signup
        const { data, error } = await supabase.auth.admin.createUser({
            email: pseudoEmail,
            password: password,
            email_confirm: true,
            user_metadata: { full_name: username }
        });
        
        if (error) throw error;
        
        const newUserId = data.user.id;
        
        // 2. Update the auto-created profile (via trigger) with the new bindings
        const { error: updateError } = await supabase.from('profiles').update({
            admin_id: admin_id,
            role: 'employee',
            assigned_boards: assigned_boards || [],
            assigned_companies: assigned_companies || []
        }).eq('id', newUserId);
        
        if (updateError) {
             console.error('[API] Failed to update profile assignments:', updateError);
        }
        
        // 3. Email the credentials to the admin
        const subject = `New Employee Account: ${username}`;
        const message = `
            <div style="font-family: sans-serif; padding: 20px;">
                <h2>New Employee Credentials Generated</h2>
                <p>You have successfully created an account for <strong>${username}</strong>.</p>
                <div style="background: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Login Email:</strong> ${pseudoEmail}</p>
                    <p><strong>Password:</strong> ${password}</p>
                </div>
                <p>They can use this email and password to log in. They will only see drivers for their assigned boards/companies.</p>
            </div>
        `;
        
        // Delay to avoid blocking the response
        sendCustomBroadcastEmail([admin_email], subject, message, []).catch(e => console.error('[EMAIL] Failed to send credentials to admin', e));
        
        res.json({ success: true, user: data.user, loginEmail: pseudoEmail });
    } catch (e: any) {
         console.error('[API] Admin create-user failed:', e);
         res.status(500).json({ error: e.message });
    }
});

// Endpoint: Custom Email Broadcast with Attachments
import { sendCustomBroadcastEmail } from './services/emailSender';

app.post('/api/eld/broadcast', upload.array('attachments', 10), async (req, res) => {
    try {
        const { recipients, subject, message } = req.body;
        const files = req.files as Express.Multer.File[];
        
        if (!recipients || !subject || !message) {
            res.status(400).json({ error: 'Recipients, subject, and message are required.' });
            return;
        }

        const recipientList = typeof recipients === 'string' ? JSON.parse(recipients) : recipients;

        // Map Multer files to Nodemailer attachment format
        const emailAttachments = (files || []).map(file => ({
            filename: file.originalname,
            path: file.path
        }));

        console.log(`[BROADCAST] Preparing to send custom email to ${recipientList.length} drivers...`);
        console.log(`[BROADCAST] Attachments: ${emailAttachments.length}`);

        const success = await sendCustomBroadcastEmail(recipientList, subject, message, emailAttachments);

        // Cleanup temp files after attempting to send
        for (const file of files || []) {
            try {
                fs.unlinkSync(file.path);
            } catch (err) {
                console.error(`[BROADCAST] Failed to delete temp file ${file.path}:`, err);
            }
        }

        if (success) {
            res.json({ success: true, message: 'Broadcast sent successfully!' });
        } else {
            res.status(500).json({ error: 'Failed to send broadcast email.' });
        }
    } catch (error: any) {
        console.error('[BROADCAST] Error handling broadcast:', error);
        res.status(500).json({ error: `Internal server error: ${error.message}` });
    }
});

app.post('/api/sync/start', (req, res) => {
    startCron();
    res.json({ message: 'Cron started' });
});

app.post('/api/sync/stop', (req, res) => {
    stopCron();
    res.json({ message: 'Cron stopped' });
});

app.post('/api/sync/trigger', async (req, res) => {
    if (isSyncing) { res.status(400).json({ error: 'Already syncing' }); return; }

    try {
        isSyncing = true;
        await runSyncWorker();
        lastSyncTime = new Date().toISOString();
        res.json({ message: 'Manual sync complete', lastSyncTime });
    } catch (e) {
        res.status(500).json({ error: 'Sync failed' });
    } finally {
        isSyncing = false;
    }
});

app.listen(PORT, () => {
    console.log(`✅ Backend Server listening on port ${PORT}`);
});
