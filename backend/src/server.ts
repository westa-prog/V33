import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getDb, getSupabaseAdminConfigSummary } from './services/supabaseAdmin';
import {
    getEmailTransportStatus,
    getSmtpConfigSummary,
    sendCustomBroadcastEmail,
    sendTestEmail,
    verifySmtpConnection
} from './services/emailSender';

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
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeCompanyName = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizeCompanyList = (value: string[]) => value.map((item) => normalizeCompanyName(item).toLowerCase()).filter(Boolean);
const normalizeRole = (value: unknown): 'admin' | 'employee' => {
    const role = String(value || '').trim().toLowerCase();
    return role === 'admin' ? 'admin' : 'employee';
};
const isProfileSchemaMismatch = (message: string) => {
    return /assigned_boards|assigned_board|assigned_companies|admin_id|board_id|company_id/i.test(message || '');
};
const isMissingEmployeeAssignmentsTable = (message: string) => {
    return /employee_assignments|relation .* does not exist|Could not find the table/i.test(message || '');
};

const upsertProfileAssignments = async (
    supabase: ReturnType<typeof getDb>,
    payload: {
        id: string;
        email: string;
        name: string;
        role: string;
        admin_id?: string | null;
        assigned_boards?: string[];
        assigned_companies?: string[];
    }
) => {
    const primaryBoardId = boardNameToId(payload.assigned_boards?.[0] || null);
    let { error } = await supabase.from('profiles').upsert({
        id: payload.id,
        email: payload.email,
        name: payload.name,
        admin_id: payload.admin_id || null,
        role: payload.role,
        assigned_boards: payload.assigned_boards || [],
        assigned_companies: payload.assigned_companies || [],
        board_id: primaryBoardId
    }, { onConflict: 'id' });

    if (error && isProfileSchemaMismatch(String(error.message || ''))) {
        const legacyPayload: any = {
            id: payload.id,
            email: payload.email,
            name: payload.name,
            admin_id: payload.admin_id || null,
            role: payload.role,
            assigned_board: payload.assigned_boards?.[0] || null
        };
        if ((payload.assigned_companies || []).length > 0) {
            legacyPayload.assigned_company = payload.assigned_companies?.[0] || null;
        }
        const legacyRes = await supabase.from('profiles').upsert(legacyPayload, { onConflict: 'id' });
        error = legacyRes.error || null;
    }

    return error || null;
};

const syncUserAccess = async (
    supabase: ReturnType<typeof getDb>,
    user: any,
    access: {
        name?: string;
        role: string;
        admin_id?: string | null;
        assigned_boards?: string[];
        assigned_companies?: string[];
        landing_html?: string;
        email_template?: string;
        email_templates?: Record<string, unknown>;
    }
) => {
    const email = normalizeEmail(user?.email);
    const fullName = String(access.name || user?.user_metadata?.full_name || email.split('@')[0] || 'User');
    const currentMeta = user?.user_metadata || {};

    const profileError = await upsertProfileAssignments(supabase, {
        id: user.id,
        email,
        name: fullName,
        role: access.role,
        admin_id: access.admin_id || null,
        assigned_boards: access.assigned_boards || [],
        assigned_companies: access.assigned_companies || []
    });
    if (profileError && !isProfileSchemaMismatch(String(profileError.message || ''))) {
        throw profileError;
    }

    const { error: metadataError } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
            ...currentMeta,
            full_name: fullName,
            role: access.role,
            admin_id: access.admin_id || null,
            assigned_boards: access.assigned_boards || [],
            assigned_companies: access.assigned_companies || [],
            landing_html: typeof access.landing_html === 'string' ? access.landing_html : (currentMeta.landing_html || ''),
            email_template: typeof access.email_template === 'string' ? access.email_template : (currentMeta.email_template || ''),
            email_templates: access.email_templates && typeof access.email_templates === 'object'
                ? access.email_templates
                : (currentMeta.email_templates || {})
        }
    });
    if (metadataError) throw metadataError;
};

const findAuthUserByEmail = async (supabase: ReturnType<typeof getDb>, email: string) => {
    const normalizedEmail = normalizeEmail(email);
    let page = 1;
    while (page <= 20) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        const match = (data?.users || []).find((user) => normalizeEmail(user.email) === normalizedEmail);
        if (match) return match;
        if ((data?.users || []).length < 200) break;
        page += 1;
    }
    return null;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const ALLOWED_BOARDS = new Set(['Board A', 'Board B', 'Board C']);
const ADMIN_EMAIL = 'westa@algogroup.us';
const APP_URL = String(process.env.APP_URL || process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
type AuthenticatedRequest = express.Request & {
    authUser?: any;
    authProfile?: { id: string; email?: string | null; role?: string | null } | null;
};

const getBearerToken = (req: express.Request): string => {
    const value = String(req.headers.authorization || '').trim();
    if (!value.toLowerCase().startsWith('bearer ')) return '';
    return value.slice(7).trim();
};

const requireAuth: express.RequestHandler = async (req: AuthenticatedRequest, res, next) => {
    try {
        const token = getBearerToken(req);
        if (!token) {
            res.status(401).json({ error: 'Authorization bearer token is required.' });
            return;
        }

        const supabase = getDb();
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        if (userError || !userData?.user) {
            res.status(401).json({ error: 'Invalid or expired session token.' });
            return;
        }

        req.authUser = userData.user;
        const { data: profile } = await supabase
            .from('profiles')
            .select('id,email,role')
            .eq('id', userData.user.id)
            .maybeSingle();
        req.authProfile = profile || null;
        next();
    } catch (e: any) {
        res.status(401).json({ error: e?.message || 'Authentication failed.' });
    }
};

const requireAdminAuth: express.RequestHandler = async (req: AuthenticatedRequest, res, next) => {
    await requireAuth(req, res, async () => {
        const authEmail = normalizeEmail(req.authProfile?.email || req.authUser?.email);
        const authRole = String(req.authProfile?.role || req.authUser?.user_metadata?.role || '').trim().toLowerCase();
        if (authEmail !== ADMIN_EMAIL && authRole !== 'admin') {
            res.status(403).json({ error: 'Admin access is required for this action.' });
            return;
        }
        next();
    });
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

const findCompanyByNameAndBoard = async (
    supabase: ReturnType<typeof getDb>,
    companyName: string,
    boardId: string
) => {
    const normalizedName = normalizeCompanyName(companyName).toLowerCase();
    const { data, error } = await supabase
        .from('companies')
        .select('id,name,board_id')
        .eq('normalized_name', normalizedName)
        .eq('board_id', boardId)
        .maybeSingle();

    return { data: data || null, error: error || null };
};

const resolveCompanyForBoard = async (
    supabase: ReturnType<typeof getDb>,
    companyName: string,
    boardId: string,
    createdBy: string | null
) => {
    const normalizedCompany = normalizeCompanyName(companyName);
    if (!normalizedCompany) {
        return { companyId: null, companyName: '' };
    }

    const existing = await findCompanyByNameAndBoard(supabase, normalizedCompany, boardId);
    if (existing.error) throw existing.error;
    if (existing.data?.id) {
        return { companyId: existing.data.id as string, companyName: existing.data.name as string };
    }

    const { data: insertedCompany, error: insertCompanyError } = await supabase
        .from('companies')
        .insert({
            name: normalizedCompany,
            board_id: boardId,
            created_by: createdBy
        })
        .select('id,name,board_id')
        .single();

    if (!insertCompanyError && insertedCompany?.id) {
        return { companyId: insertedCompany.id as string, companyName: insertedCompany.name as string };
    }

    const recovered = await findCompanyByNameAndBoard(supabase, normalizedCompany, boardId);
    if (recovered.error) throw recovered.error;
    if (recovered.data?.id) {
        return { companyId: recovered.data.id as string, companyName: recovered.data.name as string };
    }

    throw new Error(insertCompanyError?.message || 'Failed to resolve target company.');
};

const serializeDriverRow = (
    row: any,
    fallback?: {
        company?: string;
        companyId?: string | null;
        board?: string;
        boardId?: string | null;
        createdBy?: string | null;
    }
) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.companies?.name || fallback?.company || '',
    companyId: row.company_id || fallback?.companyId || null,
    board: normalizeBoardName(row.board_id || row.companies?.board_id || fallback?.boardId || fallback?.board || ''),
    boardId: row.board_id || fallback?.boardId || null,
    createdBy: row.created_by || fallback?.createdBy || null,
    deviceType: row.devicetype || '',
    appVersion: row.appversion || '',
    eldStatus: row.eldstatus || null,
    dutyStatus: row.dutystatus || null,
    followUp: row.followup || null,
    emailSent: Boolean(row.emailsent),
    hasPendingAlert: Boolean(row.haspendingalert),
    lastEmailTime: row.lastemailtime || null,
    lastSentAt: row.lastsentat || null,
    lastPFUpdate: row.lastpfupdate || null,
    lastProfileReminderAt: row.lastprofilereminderat || null,
    last3DayEmail: row.last3dayemail || null,
    last5DayEmail: row.last5dayemail || null,
    updatedAt: row.updated_at || null
});

const checkTableReachable = async (supabase: ReturnType<typeof getDb>, table: string) => {
    const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' }).limit(1);
    if (error) {
        return { ok: false, error: error.message || `Failed to query ${table}` };
    }
    return { ok: true };
};

app.get('/api/status', async (req, res) => {
    const emailStatus = getEmailTransportStatus();
    const smtpSummary = getSmtpConfigSummary();
    const supabaseConfig = getSupabaseAdminConfigSummary();
    const warnings: string[] = [];

    if (!APP_URL) warnings.push('APP_URL is not configured.');
    if (supabaseConfig.usingAnonFallback) warnings.push('Backend is using SUPABASE_ANON_KEY fallback instead of service role.');
    if (!emailStatus.liveEmailConfigured) warnings.push('No live email provider is configured. Email remains in simulation mode.');

    const checks: Record<string, boolean> = {
        appUrlConfigured: Boolean(APP_URL),
        uploadsEnabled: true,
        backendSupabaseConfigured: supabaseConfig.publishReady,
        databaseReachable: false,
        profilesTableReady: false,
        companiesTableReady: false,
        driversTableReady: false,
        emailLogsTableReady: false,
        driverRepliesTableReady: false,
        employeeAssignmentsTableReady: false,
        liveEmailConfigured: emailStatus.liveEmailConfigured
    };

    if (supabaseConfig.supabaseUrlConfigured) {
        try {
            const supabase = getDb();
            const [
                profilesCheck,
                companiesCheck,
                driversCheck,
                emailLogsCheck,
                driverRepliesCheck,
                assignmentsCheck
            ] = await Promise.all([
                checkTableReachable(supabase, 'profiles'),
                checkTableReachable(supabase, 'companies'),
                checkTableReachable(supabase, 'drivers_new'),
                checkTableReachable(supabase, 'email_logs'),
                checkTableReachable(supabase, 'driver_replies'),
                checkTableReachable(supabase, 'employee_assignments')
            ]);

            checks.profilesTableReady = profilesCheck.ok;
            checks.companiesTableReady = companiesCheck.ok;
            checks.driversTableReady = driversCheck.ok;
            checks.emailLogsTableReady = emailLogsCheck.ok;
            checks.driverRepliesTableReady = driverRepliesCheck.ok;
            checks.employeeAssignmentsTableReady = assignmentsCheck.ok;
            checks.databaseReachable = profilesCheck.ok || companiesCheck.ok || driversCheck.ok;

            for (const result of [profilesCheck, companiesCheck, driversCheck, emailLogsCheck, driverRepliesCheck, assignmentsCheck]) {
                if (!result.ok && result.error) warnings.push(result.error);
            }
        } catch (error: any) {
            warnings.push(error?.message || 'Supabase connectivity check failed.');
        }
    }

    const releaseReady =
        checks.appUrlConfigured &&
        checks.backendSupabaseConfigured &&
        checks.databaseReachable &&
        checks.profilesTableReady &&
        checks.companiesTableReady &&
        checks.driversTableReady &&
        checks.emailLogsTableReady &&
        checks.driverRepliesTableReady &&
        checks.employeeAssignmentsTableReady &&
        checks.liveEmailConfigured;

    res.json({
        status: 'online',
        releaseReady,
        checks,
        emailConfigured: emailStatus.liveEmailConfigured,
        emailMode: emailStatus.mode,
        smtpConfigured: emailStatus.smtpConfigured,
        resendConfigured: emailStatus.resendConfigured,
        smtpHost: smtpSummary.host,
        smtpPort: smtpSummary.port,
        smtpFrom: smtpSummary.from,
        uploadsEnabled: true,
        uptimeSeconds: Math.round(process.uptime()),
        warnings: Array.from(new Set(warnings))
    });
});

app.post('/api/email/test-connection', requireAdminAuth, async (req, res) => {
    try {
        const emailStatus = getEmailTransportStatus();
        const smtpSummary = getSmtpConfigSummary();
        const verifyResult = await verifySmtpConnection();

        if (!verifyResult.ok) {
            res.status(500).json({
                success: false,
                emailMode: emailStatus.mode,
                smtpHost: smtpSummary.host,
                smtpPort: smtpSummary.port,
                smtpFrom: smtpSummary.from,
                error: verifyResult.error
            });
            return;
        }

        res.json({
            success: true,
            emailMode: emailStatus.mode,
            smtpHost: smtpSummary.host,
            smtpPort: smtpSummary.port,
            smtpFrom: smtpSummary.from,
            message: 'SMTP connection verified successfully.'
        });
    } catch (e: any) {
        console.error('[API] Email test-connection failed:', e);
        res.status(500).json({ error: e.message || 'Failed to verify SMTP connection.' });
    }
});

app.post('/api/email/test-send', requireAdminAuth, async (req, res) => {
    try {
        const to = String(req.body?.to || '').trim().toLowerCase();
        if (!isValidEmail(to)) {
            res.status(400).json({ error: 'A valid recipient email is required.' });
            return;
        }

        const sendResult = await sendTestEmail(to);
        if (!sendResult.ok) {
            res.status(500).json({ success: false, error: sendResult.error || 'Failed to send test email.' });
            return;
        }

        res.json({ success: true, message: `Test email sent to ${to}.` });
    } catch (e: any) {
        console.error('[API] Email test-send failed:', e);
        res.status(500).json({ error: e.message || 'Failed to send test email.' });
    }
});

app.post('/api/auth/ensure-profile', async (req, res) => {
    try {
        const userId = String(req.body?.user_id || '').trim();
        if (!isUuid(userId)) {
            res.status(400).json({ error: 'A valid user_id is required.' });
            return;
        }

        const supabase = getDb();
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
        if (userError || !userData?.user) {
            res.status(404).json({ error: 'User not found.' });
            return;
        }

        const email = normalizeEmail(userData.user.email);
        const fullName = String(userData.user.user_metadata?.full_name || email.split('@')[0] || 'User');
        const isAdmin = email === ADMIN_EMAIL;
        let assignment: any = null;
        if (!isAdmin) {
            const { data: assignmentData, error: assignmentError } = await supabase
                .from('employee_assignments')
                .select('*')
                .eq('email', email)
                .maybeSingle();
            if (assignmentError && !isMissingEmployeeAssignmentsTable(String(assignmentError.message || ''))) {
                res.status(500).json({ error: assignmentError.message });
                return;
            }
            assignment = assignmentData || null;
        }

        if (isAdmin) {
            await syncUserAccess(supabase, userData.user, {
                role: 'admin',
                assigned_boards: [],
                assigned_companies: []
            });
            res.json({ success: true, role: 'admin' });
            return;
        }

        if (assignment) {
            const assignmentRole = normalizeRole(assignment.role);
            await syncUserAccess(supabase, userData.user, {
                role: assignmentRole,
                admin_id: assignmentRole === 'admin' ? null : assignment.admin_id,
                assigned_boards: assignmentRole === 'admin' ? [] : normalizeList(assignment.assigned_boards).map(normalizeBoardName).filter(Boolean),
                assigned_companies: normalizeList(assignment.assigned_companies)
            });

            await supabase
                .from('employee_assignments')
                .update({
                    name: fullName || assignment.name,
                    claimed_user_id: userId,
                    status: 'active',
                    joined_at: assignment.joined_at || new Date().toISOString()
                })
                .eq('id', assignment.id);

            res.json({
                success: true,
                role: assignmentRole,
                admin_id: assignmentRole === 'admin' ? null : assignment.admin_id,
                assigned_boards: assignmentRole === 'admin' ? [] : normalizeList(assignment.assigned_boards).map(normalizeBoardName).filter(Boolean)
            });
            return;
        }

        const upsertError = await upsertProfileAssignments(supabase, {
            id: userId,
            email,
            name: fullName,
            role: String(userData.user.user_metadata?.role || 'user'),
            admin_id: String(userData.user.user_metadata?.admin_id || '') || null,
            assigned_boards: pickMetadataList(userData.user.user_metadata?.assigned_boards || userData.user.user_metadata?.assigned_board)
                .map(normalizeBoardName)
                .filter(Boolean),
            assigned_companies: pickMetadataList(userData.user.user_metadata?.assigned_companies || userData.user.user_metadata?.assigned_company)
        });

        if (upsertError && !isProfileSchemaMismatch(String(upsertError.message || ''))) {
            res.status(500).json({ error: upsertError.message });
            return;
        }

        res.json({ success: true, role: String(userData.user.user_metadata?.role || 'user') });
    } catch (e: any) {
        console.error('[API] Ensure profile failed:', e);
        if (isMissingEmployeeAssignmentsTable(String(e?.message || ''))) {
            res.status(500).json({ error: 'Missing Supabase migration: run supabase/migrations/0007_employee_assignments.sql and redeploy Render.' });
            return;
        }
        res.status(500).json({ error: e.message || 'Failed to ensure profile.' });
    }
});

app.post('/api/admin/assign-user', async (req, res) => {
    try {
        const { email, name, role, admin_id, assigned_boards, assigned_companies } = req.body || {};
        const normalizedEmail = normalizeEmail(email);
        const normalizedName = String(name || '').trim();
        const normalizedRole = normalizeRole(role);
        const normalizedAdminId = String(admin_id || '').trim();
        const normalizedBoards = normalizeRole(role) === 'admin'
            ? []
            : normalizeList(assigned_boards).map(normalizeBoardName).filter(Boolean);
        const normalizedCompanies = normalizeList(assigned_companies);

        if (!isValidEmail(normalizedEmail)) {
            res.status(400).json({ error: 'A valid employee email is required.' });
            return;
        }
        if (!isUuid(normalizedAdminId)) {
            res.status(400).json({ error: 'A valid admin_id is required.' });
            return;
        }
        if (normalizedBoards.some((board) => !ALLOWED_BOARDS.has(board))) {
            res.status(400).json({ error: 'Only Board A, Board B, or Board C are allowed.' });
            return;
        }

        const supabase = getDb();
        const authUser = await findAuthUserByEmail(supabase, normalizedEmail);
        const claimedUserId = authUser?.last_sign_in_at ? authUser.id : null;
        const status = claimedUserId ? 'active' : 'pending';

        const { data: assignment, error: assignmentError } = await supabase
            .from('employee_assignments')
            .upsert({
                email: normalizedEmail,
                name: normalizedName || null,
                admin_id: normalizedAdminId,
                role: normalizedRole,
                assigned_boards: normalizedBoards,
                assigned_companies: normalizedCompanies,
                status,
                claimed_user_id: claimedUserId,
                joined_at: claimedUserId ? new Date().toISOString() : null
            }, { onConflict: 'email' })
            .select('*')
            .single();

        if (assignmentError) {
            res.status(500).json({ error: assignmentError.message });
            return;
        }

        if (authUser) {
            await syncUserAccess(supabase, authUser, {
                name: normalizedName || undefined,
                role: normalizedRole,
                admin_id: normalizedRole === 'admin' ? null : normalizedAdminId,
                assigned_boards: normalizedBoards,
                assigned_companies: normalizedCompanies
            });
        } else {
            const inviteOptions: {
                data: Record<string, unknown>;
                redirectTo?: string;
            } = {
                data: {
                    full_name: normalizedName || normalizedEmail.split('@')[0],
                    role: normalizedRole,
                    admin_id: normalizedRole === 'admin' ? null : normalizedAdminId,
                    assigned_boards: normalizedBoards,
                    assigned_companies: normalizedCompanies
                }
            };
            if (APP_URL) {
                inviteOptions.redirectTo = APP_URL;
            }
            const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(normalizedEmail, inviteOptions);
            if (inviteError) {
                res.status(500).json({ error: inviteError.message || 'Failed to send invite email.' });
                return;
            }
        }

        res.json({
            success: true,
            assignment,
            joined: Boolean(claimedUserId),
            message: authUser
                ? `${normalizedEmail} already exists in auth. Access was updated${claimedUserId ? ' immediately' : ', and the invite remains pending until first sign-in'}.`
                : `${normalizedEmail} was assigned and a Supabase invite email was sent.`
        });
    } catch (e: any) {
        console.error('[API] Admin assign-user failed:', e);
        if (isMissingEmployeeAssignmentsTable(String(e?.message || ''))) {
            res.status(500).json({ error: 'Missing Supabase migration: run supabase/migrations/0007_employee_assignments.sql and redeploy Render.' });
            return;
        }
        res.status(500).json({ error: e.message || 'Failed to assign user access.' });
    }
});

app.get('/api/admin/assignments', async (req, res) => {
    try {
        const adminId = String(req.query.admin_id || '').trim();
        if (!isUuid(adminId)) {
            res.status(400).json({ error: 'A valid admin_id is required.' });
            return;
        }

        const supabase = getDb();
        const { data, error } = await supabase
            .from('employee_assignments')
            .select('*')
            .eq('admin_id', adminId)
            .order('updated_at', { ascending: false });

        if (error) {
            if (isMissingEmployeeAssignmentsTable(String(error.message || ''))) {
                res.status(500).json({ error: 'Missing Supabase migration: run supabase/migrations/0007_employee_assignments.sql and redeploy Render.' });
                return;
            }
            res.status(500).json({ error: error.message });
            return;
        }

        const mapped = [];
        for (const row of (data || [])) {
            let joinedUserName = row.name || '';
            let landingHtml = '';
            let emailTemplate = '';
            let emailTemplates: Record<string, unknown> = {};
            if (row.claimed_user_id) {
                const { data: userData } = await supabase.auth.admin.getUserById(row.claimed_user_id);
                joinedUserName = String(userData?.user?.user_metadata?.full_name || joinedUserName || row.email);
                landingHtml = String(userData?.user?.user_metadata?.landing_html || '');
                emailTemplate = String(userData?.user?.user_metadata?.email_template || '');
                emailTemplates = (userData?.user?.user_metadata?.email_templates && typeof userData.user.user_metadata.email_templates === 'object')
                    ? userData.user.user_metadata.email_templates
                    : {};
            }
            mapped.push({
                id: row.id,
                email: row.email,
                name: joinedUserName || row.email,
                role: normalizeRole(row.role),
                assigned_boards: normalizeList(row.assigned_boards).map(normalizeBoardName).filter(Boolean),
                assigned_companies: normalizeList(row.assigned_companies),
                status: row.status,
                claimed_user_id: row.claimed_user_id,
                joined_at: row.joined_at,
                invited_at: row.invited_at,
                updated_at: row.updated_at,
                landing_html: landingHtml,
                email_template: emailTemplate,
                email_templates: emailTemplates
            });
        }

        res.json({ success: true, assignments: mapped });
    } catch (e: any) {
        console.error('[API] Admin list-assignments failed:', e);
        if (isMissingEmployeeAssignmentsTable(String(e?.message || ''))) {
            res.status(500).json({ error: 'Missing Supabase migration: run supabase/migrations/0007_employee_assignments.sql and redeploy Render.' });
            return;
        }
        res.status(500).json({ error: e.message || 'Failed to load assignments.' });
    }
});

app.patch('/api/admin/assignments/:assignmentId', async (req, res) => {
    try {
        const assignmentId = String(req.params.assignmentId || '').trim();
        const { admin_id, name, role, assigned_boards, assigned_companies, landing_html, email_template, email_templates } = req.body || {};
        const normalizedAdminId = String(admin_id || '').trim();
        const normalizedName = String(name || '').trim();
        const normalizedRole = normalizeRole(role);
        const normalizedBoards = normalizedRole === 'admin'
            ? []
            : normalizeList(assigned_boards).map(normalizeBoardName).filter(Boolean);
        const normalizedCompanies = normalizeList(assigned_companies);

        if (!isUuid(assignmentId) || !isUuid(normalizedAdminId)) {
            res.status(400).json({ error: 'Valid assignmentId and admin_id are required.' });
            return;
        }
        if (normalizedBoards.some((board) => !ALLOWED_BOARDS.has(board))) {
            res.status(400).json({ error: 'Only Board A, Board B, or Board C are allowed.' });
            return;
        }

        const supabase = getDb();
        const { data: existing, error: existingError } = await supabase
            .from('employee_assignments')
            .select('*')
            .eq('id', assignmentId)
            .eq('admin_id', normalizedAdminId)
            .single();

        if (existingError || !existing) {
            if (isMissingEmployeeAssignmentsTable(String(existingError?.message || ''))) {
                res.status(500).json({ error: 'Missing Supabase migration: run supabase/migrations/0007_employee_assignments.sql and redeploy Render.' });
                return;
            }
            res.status(404).json({ error: 'Assignment not found.' });
            return;
        }

        const { data: assignment, error: updateError } = await supabase
            .from('employee_assignments')
            .update({
                name: normalizedName || existing.name || null,
                role: normalizedRole,
                assigned_boards: normalizedBoards,
                assigned_companies: normalizedCompanies
            })
            .eq('id', assignmentId)
            .select('*')
            .single();

        if (updateError || !assignment) {
            res.status(500).json({ error: updateError?.message || 'Failed to update assignment.' });
            return;
        }

        if (assignment.claimed_user_id) {
            const { data: userData, error: userError } = await supabase.auth.admin.getUserById(assignment.claimed_user_id);
            if (userError || !userData?.user) {
                res.status(500).json({ error: userError?.message || 'Failed to load claimed user.' });
                return;
            }

            await syncUserAccess(supabase, userData.user, {
                name: normalizedName || existing.name || undefined,
                role: normalizedRole,
                admin_id: normalizedRole === 'admin' ? null : normalizedAdminId,
                assigned_boards: normalizedBoards,
                assigned_companies: normalizedCompanies,
                landing_html: typeof landing_html === 'string' ? landing_html : undefined,
                email_template: typeof email_template === 'string' ? email_template : undefined,
                email_templates: email_templates && typeof email_templates === 'object' ? email_templates : undefined
            });
        }

        res.json({ success: true, assignment });
    } catch (e: any) {
        console.error('[API] Admin update-assignment failed:', e);
        if (isMissingEmployeeAssignmentsTable(String(e?.message || ''))) {
            res.status(500).json({ error: 'Missing Supabase migration: run supabase/migrations/0007_employee_assignments.sql and redeploy Render.' });
            return;
        }
        res.status(500).json({ error: e.message || 'Failed to update assignment.' });
    }
});

app.post('/api/drivers/create', async (req, res) => {
    try {
        const { acting_user_id, name, email, company, company_id, board, deviceType, appVersion, eldStatus, dutyStatus, followUp } = req.body || {};

        if (!acting_user_id || !name || !email || !company) {
            res.status(400).json({ error: 'acting_user_id, name, email, and company are required.' });
            return;
        }

        const normalizedActingUserId = String(acting_user_id).trim();
        const normalizedName = String(name).trim();
        const normalizedEmail = String(email).trim().toLowerCase();
        const normalizedCompany = normalizeCompanyName(company);
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
        let assignedCompanySet = normalizeCompanyList(assignedCompanies);

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
            assignedCompanySet = normalizeCompanyList(assignedCompanies);
            profileEmail = userData.user.email;
            profileId = userData.user.id;
        } else {
            const { data: userData } = await supabase.auth.admin.getUserById(normalizedActingUserId);
            const meta = readUserMetadata(userData?.user);
            role = role || meta.role;
            adminId = adminId || meta.admin_id;
            if (assignedBoards.length === 0) assignedBoards = meta.assigned_boards;
            if (assignedCompanies.length === 0) assignedCompanies = meta.assigned_companies;
            assignedCompanySet = normalizeCompanyList(assignedCompanies);
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
            if (assignedCompanySet.length > 0 && !assignedCompanySet.includes(normalizedCompany.toLowerCase())) {
                res.status(403).json({ error: 'Employee cannot create drivers outside assigned companies.' });
                return;
            }
        }
        const effectiveBoardId = boardNameToId(effectiveBoard);
        if (!effectiveBoardId) {
            res.status(400).json({ error: 'Invalid board mapping.' });
            return;
        }

        // Self-heal legacy profiles so RLS reads board_id correctly for employees.
        await supabase
            .from('profiles')
            .update({ board_id: effectiveBoardId })
            .eq('id', normalizedActingUserId)
            .is('board_id', null);

        const targetBoardId = normalizedBoardId || effectiveBoardId;
        let resolvedCompanyId: string | null = null;
        let resolvedCompanyName = normalizedCompany;
        if (company_id && isUuid(String(company_id))) {
            resolvedCompanyId = String(company_id);
        } else {
            const resolvedCompany = await resolveCompanyForBoard(
                supabase,
                normalizedCompany,
                targetBoardId,
                isAdmin ? profileId : adminId
            );
            resolvedCompanyId = resolvedCompany.companyId;
            resolvedCompanyName = resolvedCompany.companyName || normalizedCompany;
        }

        const { data: duplicateDriver } = await supabase
            .from('drivers_new')
            .select('id,name,email,board_id,company_id')
            .eq('email', normalizedEmail)
            .eq('board_id', effectiveBoardId)
            .maybeSingle();

        if (duplicateDriver?.id) {
            res.status(409).json({
                error: `A driver with email ${normalizedEmail} already exists on ${effectiveBoard}.`,
                driverId: duplicateDriver.id
            });
            return;
        }

        const nowIso = new Date().toISOString();
        const driverId = crypto.randomUUID();
        const driverRowFull = {
            id: driverId,
            name: normalizedName,
            email: normalizedEmail,
            company_id: resolvedCompanyId,
            board_id: effectiveBoardId,
            created_by: normalizedActingUserId,
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
        const driverRowMinimal = {
            id: driverId,
            name: normalizedName,
            email: normalizedEmail,
            company_id: resolvedCompanyId,
            board_id: effectiveBoardId,
            created_by: normalizedActingUserId,
            created_at: nowIso,
            updated_at: nowIso
        };

        let { error: insertError } = await supabase.from('drivers_new').insert(driverRowFull);
        if (insertError && /column .* does not exist/i.test(String(insertError.message || ''))) {
            const fallback = await supabase.from('drivers_new').insert(driverRowMinimal);
            insertError = fallback.error || null;
        }
        if (insertError) {
            res.status(500).json({ error: insertError.message });
            return;
        }

        const actorLabel = profile?.name || profileEmail || profileId;
        const activityContent = `[ACTIVITY] ${actorLabel} created driver ${normalizedName} (${normalizedEmail}) in ${resolvedCompanyName}, ${effectiveBoard}`;
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
                companyId: resolvedCompanyId,
                boardId: effectiveBoardId,
                company: resolvedCompanyName,
                board: effectiveBoard,
                createdBy: normalizedActingUserId,
                deviceType: String(deviceType || ''),
                appVersion: String(appVersion || ''),
                eldStatus: String(eldStatus || 'Connected'),
                dutyStatus: String(dutyStatus || 'Not Set'),
                followUp: String(followUp || 'None'),
                emailSent: false,
                hasPendingAlert: false
            }
        });
    } catch (e: any) {
        console.error('[API] Driver create failed:', e);
        res.status(500).json({ error: e.message || 'Failed to create driver.' });
    }
});

app.patch('/api/drivers/:driverId', async (req, res) => {
    try {
        const driverId = String(req.params.driverId || '').trim();
        const {
            acting_user_id,
            name,
            email,
            company,
            company_id,
            board,
            deviceType,
            appVersion,
            eldStatus,
            dutyStatus,
            followUp,
            emailSent,
            hasPendingAlert,
            lastEmailTime,
            lastSentAt,
            lastPFUpdate,
            lastProfileReminderAt,
            last3DayEmail,
            last5DayEmail
        } = req.body || {};

        if (!isUuid(driverId) || !isUuid(String(acting_user_id || '').trim())) {
            res.status(400).json({ error: 'Valid driverId and acting_user_id are required.' });
            return;
        }

        const actingUserId = String(acting_user_id).trim();
        const supabase = getDb();

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', actingUserId)
            .single();

        let role = profile?.role;
        let profileEmail = profile?.email;
        let adminId = profile?.admin_id || null;
        let assignedBoards = pickAssignedBoards(profile);
        let assignedCompanies = pickAssignedCompanies(profile);
        let assignedCompanySet = normalizeCompanyList(assignedCompanies);

        if (profileError || !profile) {
            const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(actingUserId);
            if (userErr || !userData?.user) {
                res.status(403).json({ error: 'Unable to resolve acting user profile.' });
                return;
            }
            const meta = readUserMetadata(userData.user);
            role = meta.role;
            adminId = meta.admin_id || null;
            assignedBoards = meta.assigned_boards;
            assignedCompanies = meta.assigned_companies;
            assignedCompanySet = normalizeCompanyList(assignedCompanies);
            profileEmail = userData.user.email;
        } else {
            const { data: userData } = await supabase.auth.admin.getUserById(actingUserId);
            const meta = readUserMetadata(userData?.user);
            role = role || meta.role;
            adminId = adminId || meta.admin_id || null;
            if (assignedBoards.length === 0) assignedBoards = meta.assigned_boards;
            if (assignedCompanies.length === 0) assignedCompanies = meta.assigned_companies;
            assignedCompanySet = normalizeCompanyList(assignedCompanies);
        }

        const isAdmin = role === 'admin' || String(profileEmail || '').toLowerCase() === ADMIN_EMAIL;

        const { data: existingDriver, error: driverError } = await supabase
            .from('drivers_new')
            .select('*, companies(id,name,board_id)')
            .eq('id', driverId)
            .single();

        if (driverError || !existingDriver) {
            res.status(404).json({ error: 'Driver not found.' });
            return;
        }

        const currentBoardName = normalizeBoardName(existingDriver.board_id || existingDriver.companies?.board_id || '');
        const currentCompanyName = String(existingDriver.companies?.name || '').trim();

        const normalizedAssignedBoards = assignedBoards.map(normalizeBoardName).filter(Boolean);

        if (!isAdmin) {
            if (assignedBoards.length === 0) {
                res.status(403).json({ error: 'Employee has no assigned boards.' });
                return;
            }

            if (currentBoardName && !normalizedAssignedBoards.includes(currentBoardName)) {
                res.status(403).json({ error: 'Employee cannot update drivers outside assigned boards.' });
                return;
            }

            if (assignedCompanySet.length > 0 && currentCompanyName && !assignedCompanySet.includes(normalizeCompanyName(currentCompanyName).toLowerCase())) {
                res.status(403).json({ error: 'Employee cannot update drivers outside assigned companies.' });
                return;
            }
        }

        const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString()
        };

        if (typeof name === 'string') {
            const normalizedName = name.trim();
            if (normalizedName.length < 2) {
                res.status(400).json({ error: 'Driver name must be at least 2 characters.' });
                return;
            }
            updates.name = normalizedName;
        }

        if (typeof email === 'string') {
            const normalizedEmail = email.trim().toLowerCase();
            if (!isValidEmail(normalizedEmail)) {
                res.status(400).json({ error: 'A valid driver email is required.' });
                return;
            }
            updates.email = normalizedEmail;
        }

        let effectiveBoard = typeof board === 'string' ? normalizeBoardName(board) : currentBoardName;
        if (!effectiveBoard) {
            effectiveBoard = normalizeBoardName(existingDriver.board_id || '') || 'Board A';
        }

        if (!isAdmin) {
            const requestedBoard = typeof board === 'string' ? normalizeBoardName(board) : '';
            if (requestedBoard && normalizedAssignedBoards.includes(requestedBoard)) {
                effectiveBoard = requestedBoard;
            } else if (currentBoardName && normalizedAssignedBoards.includes(currentBoardName)) {
                effectiveBoard = currentBoardName;
            } else {
                effectiveBoard = normalizedAssignedBoards[0] || effectiveBoard;
            }
        } else if (board !== undefined && !ALLOWED_BOARDS.has(effectiveBoard)) {
            res.status(400).json({ error: 'Only Board A, Board B, or Board C are allowed.' });
            return;
        }

        const effectiveBoardId = boardNameToId(effectiveBoard);
        if (!effectiveBoardId) {
            res.status(400).json({ error: 'Invalid board mapping.' });
            return;
        }
        updates.board_id = effectiveBoardId;

        let resolvedCompanyId = existingDriver.company_id || null;
        let resolvedCompanyName = currentCompanyName;
        if (company_id === null) {
            resolvedCompanyId = null;
        } else if (typeof company_id === 'string' && isUuid(company_id)) {
            resolvedCompanyId = company_id;
            const { data: targetCompanyById } = await supabase
                .from('companies')
                .select('id,name,board_id')
                .eq('id', company_id)
                .maybeSingle();
            resolvedCompanyName = targetCompanyById?.name || resolvedCompanyName;
        } else if (typeof company === 'string') {
            const normalizedCompany = normalizeCompanyName(company);
            if (normalizedCompany.length < 2) {
                res.status(400).json({ error: 'Company is required.' });
                return;
            }
            if (!isAdmin && assignedCompanySet.length > 0 && !assignedCompanySet.includes(normalizedCompany.toLowerCase())) {
                res.status(403).json({ error: 'Employee cannot move drivers outside assigned companies.' });
                return;
            }

            const resolvedCompany = await resolveCompanyForBoard(
                supabase,
                normalizedCompany,
                effectiveBoardId,
                existingDriver.created_by || actingUserId
            );

            if (!resolvedCompany.companyId) {
                res.status(400).json({ error: 'Target company was not found for the selected board.' });
                return;
            }

            resolvedCompanyId = resolvedCompany.companyId;
            resolvedCompanyName = resolvedCompany.companyName || normalizedCompany;
        }

        updates.company_id = resolvedCompanyId;

        const nextEmail = typeof email === 'string' ? email.trim().toLowerCase() : String(existingDriver.email || '').trim().toLowerCase();
        const { data: duplicateDriver } = await supabase
            .from('drivers_new')
            .select('id')
            .eq('email', nextEmail)
            .eq('board_id', effectiveBoardId)
            .neq('id', driverId)
            .maybeSingle();

        if (duplicateDriver?.id) {
            res.status(409).json({ error: `A driver with email ${nextEmail} already exists on ${effectiveBoard}.` });
            return;
        }

        if (deviceType !== undefined) updates.devicetype = String(deviceType || '');
        if (appVersion !== undefined) updates.appversion = String(appVersion || '');
        if (eldStatus !== undefined) updates.eldstatus = eldStatus ? String(eldStatus) : null;
        if (dutyStatus !== undefined) updates.dutystatus = dutyStatus ? String(dutyStatus) : null;
        if (followUp !== undefined) updates.followup = followUp ? String(followUp) : null;
        if (emailSent !== undefined) updates.emailsent = Boolean(emailSent);
        if (hasPendingAlert !== undefined) updates.haspendingalert = Boolean(hasPendingAlert);
        if (lastEmailTime !== undefined) updates.lastemailtime = lastEmailTime || null;
        if (lastSentAt !== undefined) updates.lastsentat = lastSentAt || null;
        if (lastPFUpdate !== undefined) updates.lastpfupdate = lastPFUpdate || null;
        if (lastProfileReminderAt !== undefined) updates.lastprofilereminderat = lastProfileReminderAt || null;
        if (last3DayEmail !== undefined) updates.last3dayemail = last3DayEmail || null;
        if (last5DayEmail !== undefined) updates.last5dayemail = last5DayEmail || null;

        const { error: updateError } = await supabase
            .from('drivers_new')
            .update(updates)
            .eq('id', driverId);

        if (updateError) {
            res.status(500).json({ error: updateError.message || 'Failed to update driver.' });
            return;
        }

        const { data: refreshedDriver, error: refreshedError } = await supabase
            .from('drivers_new')
            .select('*, companies(id,name,board_id)')
            .eq('id', driverId)
            .single();

        if (refreshedError || !refreshedDriver) {
            res.status(500).json({ error: refreshedError?.message || 'Driver updated but failed to reload.' });
            return;
        }

        res.json({
            success: true,
            driver: serializeDriverRow(refreshedDriver, {
                company: resolvedCompanyName || existingDriver.companies?.name || '',
                companyId: refreshedDriver.company_id || existingDriver.company_id || null,
                boardId: refreshedDriver.board_id || existingDriver.board_id || existingDriver.companies?.board_id || null,
                createdBy: refreshedDriver.created_by || existingDriver.created_by || null
            })
        });
    } catch (e: any) {
        console.error('[API] Driver update failed:', e);
        res.status(500).json({ error: e.message || 'Failed to update driver.' });
    }
});

app.post('/api/drivers/reset', async (req, res) => {
    try {
        const actingUserId = String(req.body?.acting_user_id || '').trim();
        const driverIds: string[] = Array.from(new Set<string>(
            Array.isArray(req.body?.driver_ids)
                ? req.body.driver_ids.map((value: unknown) => String(value || '').trim()).filter(isUuid)
                : []
        ));

        if (!isUuid(actingUserId) || driverIds.length === 0) {
            res.status(400).json({ error: 'Valid acting_user_id and at least one driver_id are required.' });
            return;
        }

        const supabase = getDb();
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', actingUserId)
            .single();

        let role = profile?.role;
        let profileEmail = profile?.email;
        let assignedBoards = pickAssignedBoards(profile);
        let assignedCompanies = pickAssignedCompanies(profile);
        let assignedCompanySet = normalizeCompanyList(assignedCompanies);

        if (profileError || !profile) {
            const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(actingUserId);
            if (userErr || !userData?.user) {
                res.status(403).json({ error: 'Unable to resolve acting user profile.' });
                return;
            }
            const meta = readUserMetadata(userData.user);
            role = meta.role;
            assignedBoards = meta.assigned_boards;
            assignedCompanies = meta.assigned_companies;
            assignedCompanySet = normalizeCompanyList(assignedCompanies);
            profileEmail = userData.user.email;
        } else {
            const { data: userData } = await supabase.auth.admin.getUserById(actingUserId);
            const meta = readUserMetadata(userData?.user);
            role = role || meta.role;
            if (assignedBoards.length === 0) assignedBoards = meta.assigned_boards;
            if (assignedCompanies.length === 0) assignedCompanies = meta.assigned_companies;
            assignedCompanySet = normalizeCompanyList(assignedCompanies);
        }

        const isAdmin = role === 'admin' || normalizeEmail(profileEmail) === ADMIN_EMAIL;

        const { data: targetDrivers, error: targetError } = await supabase
            .from('drivers_new')
            .select('*, companies(id,name,board_id)')
            .in('id', driverIds);

        if (targetError) {
            res.status(500).json({ error: targetError.message || 'Failed to load target drivers.' });
            return;
        }

        const rows = targetDrivers || [];
        if (rows.length !== driverIds.length) {
            const foundIds = new Set<string>(rows.map((row: any) => String(row.id)));
            const missingIds = driverIds.filter((id) => !foundIds.has(id));
            res.status(404).json({ error: `Some drivers were not found: ${missingIds.join(', ')}` });
            return;
        }

        if (!isAdmin) {
            if (assignedBoards.length === 0) {
                res.status(403).json({ error: 'Employee has no assigned boards.' });
                return;
            }

            const normalizedAssignedBoards = assignedBoards.map(normalizeBoardName).filter(Boolean);
            const forbiddenDriver = rows.find((driver: any) => {
                const currentBoardName = normalizeBoardName(driver.board_id || driver.companies?.board_id || '');
                const currentCompanyName = normalizeCompanyName(driver.companies?.name || '');

                if (currentBoardName && !normalizedAssignedBoards.includes(currentBoardName)) {
                    return true;
                }

                if (assignedCompanySet.length > 0 && currentCompanyName && !assignedCompanySet.includes(currentCompanyName.toLowerCase())) {
                    return true;
                }

                return false;
            });

            if (forbiddenDriver) {
                res.status(403).json({ error: 'Employee cannot reset drivers outside assigned access.' });
                return;
            }
        }

        const resetUpdates = {
            eldstatus: 'Connected',
            dutystatus: 'Not Set',
            followup: 'None',
            emailsent: false,
            haspendingalert: false,
            updated_at: new Date().toISOString()
        };

        const { error: resetError } = await supabase
            .from('drivers_new')
            .update(resetUpdates)
            .in('id', driverIds);

        if (resetError) {
            res.status(500).json({ error: resetError.message || 'Failed to reset drivers.' });
            return;
        }

        const { data: refreshedDrivers, error: refreshedError } = await supabase
            .from('drivers_new')
            .select('*, companies(id,name,board_id)')
            .in('id', driverIds);

        if (refreshedError) {
            res.status(500).json({ error: refreshedError.message || 'Drivers reset but failed to reload.' });
            return;
        }

        const order = new Map(driverIds.map((id, index) => [id, index]));
        const orderedDrivers = [...(refreshedDrivers || [])].sort((a: any, b: any) => {
            return (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0);
        });

        res.json({
            success: true,
            drivers: orderedDrivers.map((driver: any) => serializeDriverRow(driver, {
                company: driver.companies?.name || '',
                companyId: driver.company_id || null,
                boardId: driver.board_id || driver.companies?.board_id || null,
                createdBy: driver.created_by || null
            }))
        });
    } catch (e: any) {
        console.error('[API] Driver reset failed:', e);
        res.status(500).json({ error: e.message || 'Failed to reset drivers.' });
    }
});

app.delete('/api/drivers/:driverId', async (req, res) => {
    try {
        const driverId = String(req.params.driverId || '').trim();
        const actingUserId = String(req.body?.acting_user_id || '').trim();

        if (!isUuid(driverId) || !isUuid(actingUserId)) {
            res.status(400).json({ error: 'Valid driverId and acting_user_id are required.' });
            return;
        }

        const supabase = getDb();
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', actingUserId)
            .single();
        const { data: userData } = await supabase.auth.admin.getUserById(actingUserId);
        const meta = readUserMetadata(userData?.user);

        const role = profile?.role || meta.role;
        const profileEmail = profile?.email || userData?.user?.email;
        const isAdmin = role === 'admin' || normalizeEmail(profileEmail) === ADMIN_EMAIL;

        const { data: driver, error: driverError } = await supabase
            .from('drivers_new')
            .select('id,created_by')
            .eq('id', driverId)
            .single();

        if (driverError || !driver) {
            res.status(404).json({ error: 'Driver not found.' });
            return;
        }

        const isCreator = String(driver.created_by || '') === actingUserId;
        if (!isAdmin && !isCreator) {
            res.status(403).json({ error: 'Employees can only delete drivers they created.' });
            return;
        }

        const { error: deleteError } = await supabase
            .from('drivers_new')
            .delete()
            .eq('id', driverId);

        if (deleteError) {
            res.status(500).json({ error: deleteError.message });
            return;
        }

        res.json({ success: true });
    } catch (e: any) {
        console.error('[API] Driver delete failed:', e);
        res.status(500).json({ error: e.message || 'Failed to delete driver.' });
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

        const boardId = boardNameToId(effectiveBoard);
        if (!boardId) {
            res.status(400).json({ error: 'Invalid board mapping.' });
            return;
        }

        // Self-heal legacy profiles so RLS can return board-scoped companies to employee.
        await supabase
            .from('profiles')
            .update({ board_id: boardId })
            .eq('id', normalizedActingUserId)
            .is('board_id', null);

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

app.patch('/api/companies/:companyId', async (req, res) => {
    try {
        const companyId = String(req.params.companyId || '').trim();
        const actingUserId = String(req.body?.acting_user_id || '').trim();
        const normalizedName = String(req.body?.name || '').trim();
        const requestedBoard = normalizeBoardName(String(req.body?.board || '').trim());

        if (!isUuid(companyId) || !isUuid(actingUserId)) {
            res.status(400).json({ error: 'Valid companyId and acting_user_id are required.' });
            return;
        }
        if (normalizedName.length < 2) {
            res.status(400).json({ error: 'Company name must be at least 2 characters.' });
            return;
        }

        const supabase = getDb();
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', actingUserId).single();
        const { data: userData } = await supabase.auth.admin.getUserById(actingUserId);
        const meta = readUserMetadata(userData?.user);

        const role = profile?.role || meta.role;
        const profileEmail = profile?.email || userData?.user?.email;
        const assignedBoards = pickAssignedBoards(profile).length > 0 ? pickAssignedBoards(profile) : meta.assigned_boards;
        const isAdmin = role === 'admin' || normalizeEmail(profileEmail) === ADMIN_EMAIL;

        const { data: company, error: companyError } = await supabase
            .from('companies')
            .select('id,name,board_id,created_by')
            .eq('id', companyId)
            .single();

        if (companyError || !company) {
            res.status(404).json({ error: 'Company not found.' });
            return;
        }

        if (!isAdmin) {
            const isCreator = String(company.created_by || '') === actingUserId;
            const companyBoardLabel = normalizeBoardName(company.board_id);
            const canAccessBoard = assignedBoards.includes(companyBoardLabel) || assignedBoards.includes(`Board ${company.board_id}`);
            if (!isCreator && !canAccessBoard) {
                res.status(403).json({ error: 'Employees can only edit companies they created or companies in assigned boards.' });
                return;
            }
        }

        let effectiveBoard = requestedBoard || normalizeBoardName(company.board_id) || 'Board A';
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
            if (!requestedBoard) {
                effectiveBoard = normalizeBoardName(company.board_id) || normalizeBoardName(assignedBoards[0]);
            }
            if (!assignedBoards.includes(effectiveBoard)) {
                res.status(403).json({ error: 'Employees can only move companies within assigned boards.' });
                return;
            }
        }

        const boardId = boardNameToId(effectiveBoard);
        if (!boardId) {
            res.status(400).json({ error: 'Invalid board mapping.' });
            return;
        }

        const { data: duplicate } = await supabase
            .from('companies')
            .select('id')
            .eq('name', normalizedName)
            .eq('board_id', boardId)
            .neq('id', companyId)
            .maybeSingle();
        if (duplicate?.id) {
            res.status(409).json({ error: 'A company with that name already exists in this board.' });
            return;
        }

        const { data: updated, error: updateError } = await supabase
            .from('companies')
            .update({ name: normalizedName, board_id: boardId })
            .eq('id', companyId)
            .select('id,name,board_id')
            .single();

        if (updateError || !updated) {
            res.status(500).json({ error: updateError?.message || 'Failed to update company.' });
            return;
        }

        res.json({ success: true, company: updated });
    } catch (e: any) {
        console.error('[API] Company update failed:', e);
        res.status(500).json({ error: e.message || 'Failed to update company.' });
    }
});

app.delete('/api/companies/:companyId', async (req, res) => {
    try {
        const companyId = String(req.params.companyId || '').trim();
        const actingUserId = String(req.body?.acting_user_id || '').trim();

        if (!isUuid(companyId) || !isUuid(actingUserId)) {
            res.status(400).json({ error: 'Valid companyId and acting_user_id are required.' });
            return;
        }

        const supabase = getDb();
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', actingUserId).single();
        const { data: userData } = await supabase.auth.admin.getUserById(actingUserId);
        const meta = readUserMetadata(userData?.user);

        const role = profile?.role || meta.role;
        const profileEmail = profile?.email || userData?.user?.email;
        const assignedBoards = pickAssignedBoards(profile).length > 0 ? pickAssignedBoards(profile) : meta.assigned_boards;
        const isAdmin = role === 'admin' || normalizeEmail(profileEmail) === ADMIN_EMAIL;

        const { data: company, error: companyError } = await supabase
            .from('companies')
            .select('id,name,board_id,created_by')
            .eq('id', companyId)
            .single();

        if (companyError || !company) {
            res.status(404).json({ error: 'Company not found.' });
            return;
        }

        if (!isAdmin) {
            const isCreator = String(company.created_by || '') === actingUserId;
            const companyBoardLabel = normalizeBoardName(company.board_id);
            const canAccessBoard = assignedBoards.includes(companyBoardLabel) || assignedBoards.includes(`Board ${company.board_id}`);
            if (!isCreator && !canAccessBoard) {
                res.status(403).json({ error: 'Employees can only delete companies they created or companies in assigned boards.' });
                return;
            }
        }

        const { count } = await supabase
            .from('drivers_new')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId);

        if ((count || 0) > 0) {
            res.status(409).json({ error: 'Delete or move all drivers in this company first.' });
            return;
        }

        const { error: deleteError } = await supabase.from('companies').delete().eq('id', companyId);
        if (deleteError) {
            res.status(500).json({ error: deleteError.message || 'Failed to delete company.' });
            return;
        }

        res.json({ success: true });
    } catch (e: any) {
        console.error('[API] Company delete failed:', e);
        res.status(500).json({ error: e.message || 'Failed to delete company.' });
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

        const sendResult = await sendCustomBroadcastEmail(normalizedRecipients, normalizedSubject, normalizedMessage, emailAttachments);

        if (!sendResult.ok) {
            res.status(500).json({ error: `Failed to send broadcast email: ${sendResult.error || 'Unknown SMTP error'}` });
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

app.post('/api/broadcast', requireAuth, upload.array('attachments', 10), handleBroadcast);

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
