import { supabase } from '../supabase';
import { Company, Driver, EmailLogEntry, DriverReply } from '../types';

export interface UserProfile {
    id: string;
    email: string;
    name?: string | null;
    role?: string | null;
    admin_id?: string | null;
    assigned_boards?: string[] | null;
    assigned_companies?: string[] | null;
    board_id?: string | null;
    company_id?: string | null;
}

type DriverRealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

const throwIfSupabaseError = (scope: string, error: any) => {
    if (!error) return;
    const message = error?.message || String(error);
    console.error(`[SUPABASE] ${scope} failed:`, error);
    throw new Error(message);
};

const boardLabelToId = (board?: string | null): string | null => {
    const raw = (board || '').trim().toUpperCase();
    if (!raw) return null;
    if (raw === 'A' || raw === 'BOARD A') return 'A';
    if (raw === 'B' || raw === 'BOARD B') return 'B';
    if (raw === 'C' || raw === 'BOARD C') return 'C';
    return raw;
};

const boardIdToLabel = (boardId?: string | null): string => {
    const raw = (boardId || '').trim().toUpperCase();
    if (raw === 'A') return 'Board A';
    if (raw === 'B') return 'Board B';
    if (raw === 'C') return 'Board C';
    if (!raw) return '';
    return `Board ${raw}`;
};

const normalizeList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map((v) => typeof v === 'string' ? v.trim() : '').filter(Boolean);
};

const dedupeDriverRows = (rows: any[]) => {
    const bestRows = new Map<string, any>();

    const scoreRow = (row: any) => {
        let score = 0;
        if (row.company_id) score += 5;
        if (row.companies?.name) score += 3;
        if (row.board_id) score += 2;
        if (row.lastpfupdate) score += 1;
        if (row.lastemailtime) score += 1;
        if (row.lastsentat) score += 1;
        return score;
    };

    const rowTimestamp = (row: any) => {
        const raw = row.updated_at || row.created_at || 0;
        const parsed = new Date(raw).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
    };

    for (const row of rows) {
        const normalizedEmail = String(row.email || '').trim().toLowerCase();
        const boardId = String(row.board_id || '').trim().toUpperCase();
        const key = normalizedEmail ? `${normalizedEmail}::${boardId}` : String(row.id);
        const current = bestRows.get(key);
        if (!current) {
            bestRows.set(key, row);
            continue;
        }

        const currentScore = scoreRow(current);
        const nextScore = scoreRow(row);
        if (nextScore > currentScore || (nextScore === currentScore && rowTimestamp(row) > rowTimestamp(current))) {
            bestRows.set(key, row);
        }
    }

    return Array.from(bestRows.values());
};

export const initializeUserDatabase = async (_userId: string, _userEmail: string, _userName: string) => {
    // Profile is created by DB trigger.
    return true;
};

export const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    throwIfSupabaseError('fetchUserProfile', error);
    if (!data) return null;
    const row: any = data;
    const boards = Array.isArray(row.assigned_boards)
        ? normalizeList(row.assigned_boards)
        : (typeof row.assigned_board === 'string' && row.assigned_board
            ? [row.assigned_board]
            : (typeof row.board_id === 'string' && row.board_id
                ? [boardIdToLabel(row.board_id)]
                : []));
    const companies = Array.isArray(row.assigned_companies)
        ? normalizeList(row.assigned_companies)
        : (typeof row.assigned_company === 'string' && row.assigned_company ? [row.assigned_company] : []);

    return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        admin_id: row.admin_id,
        assigned_boards: boards,
        assigned_companies: companies,
        board_id: row.board_id || null,
        company_id: row.company_id || null
    };
};

export const subscribeToUserProfile = (userId: string, callback: (profile: UserProfile | null) => void) => {
    fetchUserProfile(userId).then(callback);
    const channel = supabase.channel(`public:profiles:id=eq.${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, async () => {
            callback(await fetchUserProfile(userId));
        })
        .subscribe();
    return () => supabase.removeChannel(channel);
};

export const hasImportedFromSheets = async (userId: string): Promise<boolean> => {
    const { data, error } = await supabase.from('profiles').select('has_imported_from_sheets').eq('id', userId).single();
    throwIfSupabaseError('hasImportedFromSheets', error);
    return data?.has_imported_from_sheets === true;
};

export const markSheetsImported = async (userId: string) => {
    const { error } = await supabase.from('profiles').update({
        has_imported_from_sheets: true,
        imported_at: new Date().toISOString()
    }).eq('id', userId);
    throwIfSupabaseError('markSheetsImported', error);
};

const mapDriverToDb = (driver: Partial<Driver>) => {
    const boardId = driver.boardId || boardLabelToId(driver.board);
    return {
        id: driver.id,
        name: driver.name,
        email: driver.email,
        company_id: driver.companyId || null,
        board_id: boardId,
        created_by: driver.createdBy || null,
        devicetype: driver.deviceType,
        appversion: driver.appVersion,
        eldstatus: driver.eldStatus,
        dutystatus: driver.dutyStatus,
        followup: driver.followUp,
        emailsent: driver.emailSent,
        haspendingalert: driver.hasPendingAlert,
        sheetrowindex: driver.sheetRowIndex,
        lastemailtime: driver.lastEmailTime,
        lastsentat: driver.lastSentAt,
        lastpfupdate: driver.lastPFUpdate,
        lastprofilereminderat: driver.lastProfileReminderAt,
        last3dayemail: driver.last3DayEmail,
        last5dayemail: driver.last5DayEmail
    };
};

const mapDbToDriver = (dbRow: any, creatorMap?: Record<string, { name?: string; email?: string }>): Driver => {
    const creator = creatorMap?.[dbRow.created_by || ''] || {};
    const boardId = dbRow.board_id || dbRow.boardId || null;
    const companyName = dbRow.companies?.name || dbRow.company || dbRow.companyName || '';
    return {
        id: dbRow.id,
        name: dbRow.name,
        email: dbRow.email,
        company: companyName,
        board: boardIdToLabel(boardId) || dbRow.board || '',
        companyId: dbRow.company_id || dbRow.companyId || null,
        boardId,
        createdBy: dbRow.created_by || dbRow.createdBy || null,
        createdByName: creator.name || null,
        createdByEmail: creator.email || null,
        deviceType: dbRow.devicetype || '',
        appVersion: dbRow.appversion || '',
        eldStatus: dbRow.eldstatus || null,
        dutyStatus: dbRow.dutystatus || null,
        followUp: dbRow.followup || null,
        emailSent: Boolean(dbRow.emailsent),
        hasPendingAlert: Boolean(dbRow.haspendingalert),
        sheetRowIndex: dbRow.sheetrowindex || undefined,
        lastEmailTime: dbRow.lastemailtime || undefined,
        lastSentAt: dbRow.lastsentat || undefined,
        lastPFUpdate: dbRow.lastpfupdate || undefined,
        lastProfileReminderAt: dbRow.lastprofilereminderat || undefined,
        last3DayEmail: dbRow.last3dayemail || undefined,
        last5DayEmail: dbRow.last5dayemail || undefined
    } as Driver;
};

const hydrateCreatorMap = async (rows: any[]) => {
    const ids = Array.from(new Set(rows.map((r) => r.created_by).filter(Boolean)));
    const map: Record<string, { name?: string; email?: string }> = {};
    if (ids.length === 0) return map;

    const { data, error } = await supabase
        .from('profiles')
        .select('id,name,email')
        .in('id', ids);
    throwIfSupabaseError('hydrateCreatorMap', error);
    for (const profile of (data || [])) {
        map[profile.id] = { name: profile.name, email: profile.email };
    }
    return map;
};

const fetchDriverRecord = async (driverId: string) => {
    const { data, error } = await supabase
        .from('drivers_new')
        .select('*, companies(id,name,board_id)')
        .eq('id', driverId)
        .maybeSingle();
    throwIfSupabaseError('fetchDriverRecord', error);
    return data || null;
};

export const fetchDrivers = async (_ownerId: string): Promise<Driver[]> => {
    const { data, error } = await supabase
        .from('drivers_new')
        .select('*, companies(id,name,board_id)')
        .order('created_at', { ascending: false });
    throwIfSupabaseError('fetchDrivers', error);

    const rows = dedupeDriverRows(data || []);
    const creatorMap = await hydrateCreatorMap(rows);
    return rows.map((row) => mapDbToDriver(row, creatorMap));
};

export const addDriver = async (_userId: string, driver: Driver) => {
    const row = mapDriverToDb(driver);
    const { error } = await supabase.from('drivers_new').insert(row);
    throwIfSupabaseError('addDriver', error);
};

export const bulkAddDrivers = async (_userId: string, drivers: Driver[]) => {
    const rows = drivers.map((d) => mapDriverToDb(d));
    const { error } = await supabase.from('drivers_new').insert(rows);
    throwIfSupabaseError('bulkAddDrivers', error);
};

export const updateDriver = async (_userId: string, driverId: string, updates: Partial<Driver>, _ownerId?: string) => {
    const { id, ...dbUpdates } = mapDriverToDb(updates) as any;
    const cleanUpdates = Object.fromEntries(Object.entries(dbUpdates).filter(([_, v]) => v !== undefined));
    const { error } = await supabase.from('drivers_new').update({
        ...cleanUpdates,
        updated_at: new Date().toISOString()
    }).eq('id', driverId);
    throwIfSupabaseError('updateDriver', error);
};

export const deleteDriver = async (_userId: string, driverId: string, _ownerId?: string) => {
    const { error } = await supabase.from('drivers_new').delete().eq('id', driverId);
    throwIfSupabaseError('deleteDriver', error);
};

export const fetchCompanies = async (boardId?: string): Promise<Company[]> => {
    let query = supabase
        .from('companies')
        .select('id,name,board_id')
        .order('name', { ascending: true });
    if (boardId) query = query.eq('board_id', boardId);
    const { data, error } = await query;
    throwIfSupabaseError('fetchCompanies', error);
    return (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        boardId: row.board_id || null
    }));
};

export const subscribeToCompanies = (callback: (companies: Company[]) => void, boardId?: string) => {
    fetchCompanies(boardId).then(callback);
    const channel = supabase.channel(`public:companies${boardId ? `:board_id=eq.${boardId}` : ''}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'companies',
            ...(boardId ? { filter: `board_id=eq.${boardId}` } : {})
        }, async () => {
            const refreshed = await fetchCompanies(boardId);
            callback(refreshed);
        })
        .subscribe();
    return () => supabase.removeChannel(channel);
};

const mapLogToDb = (userId: string, log: EmailLogEntry) => ({
    id: log.id,
    user_id: userId,
    driver_id: log.driverId,
    driver_name: log.driverName,
    timestamp: log.timestamp,
    status_at_time: log.statusAtTime,
    content: log.content,
    sent_via: log.sentVia,
    type: log.type || 'alert'
});

const mapDbToLog = (row: any): EmailLogEntry => ({
    id: row.id,
    driverId: row.driver_id,
    driverName: row.driver_name,
    timestamp: row.timestamp,
    statusAtTime: row.status_at_time,
    content: row.content,
    sentVia: row.sent_via,
    type: row.type
} as EmailLogEntry);

export const fetchEmailLogs = async (userId: string): Promise<EmailLogEntry[]> => {
    const { data, error } = await supabase.from('email_logs').select('*').eq('user_id', userId).order('timestamp', { ascending: false });
    throwIfSupabaseError('fetchEmailLogs', error);
    return (data || []).map(mapDbToLog);
};

export const addEmailLog = async (userId: string, log: EmailLogEntry) => {
    const { error } = await supabase.from('email_logs').insert(mapLogToDb(userId, log));
    throwIfSupabaseError('addEmailLog', error);
};

const mapDbToReply = (row: any): DriverReply => ({
    id: row.id,
    driverId: row.driver_id,
    driverName: row.driver_name,
    message: row.message,
    timestamp: row.timestamp,
    isRead: row.is_read
});

export const fetchDriverReplies = async (userId: string): Promise<DriverReply[]> => {
    const { data, error } = await supabase.from('driver_replies').select('*').eq('user_id', userId).order('timestamp', { ascending: false });
    throwIfSupabaseError('fetchDriverReplies', error);
    return (data || []).map(mapDbToReply);
};

export const addDriverReply = async (userId: string, reply: DriverReply) => {
    const { error } = await supabase.from('driver_replies').insert({
        id: reply.id,
        user_id: userId,
        driver_id: reply.driverId,
        driver_name: reply.driverName,
        message: reply.message,
        timestamp: reply.timestamp,
        is_read: reply.isRead
    });
    throwIfSupabaseError('addDriverReply', error);
};

export const subscribeToDrivers = (
    ownerId: string,
    callback: (drivers: Driver[]) => void,
    onEvent?: (eventType: DriverRealtimeEvent, driver?: Driver) => void
) => {
    let currentDrivers: Driver[] = [];
    fetchDrivers(ownerId)
        .then((rows) => {
            currentDrivers = rows;
            callback(rows);
        })
        .catch((error) => {
            console.error('[REALTIME] Initial driver fetch failed:', error);
        });

    const channel = supabase.channel(`public:drivers_new:all`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers_new' }, async (payload: any) => {
            try {
                if (payload?.eventType === 'INSERT' && payload?.new) {
                    const fullRow = await fetchDriverRecord(String(payload.new.id || ''));
                    const sourceRow = fullRow || payload.new;
                    const creatorMap = await hydrateCreatorMap([sourceRow]);
                    const inserted = mapDbToDriver(sourceRow, creatorMap);
                    currentDrivers = [inserted, ...currentDrivers.filter((d) => d.id !== inserted.id)];
                    callback(currentDrivers);
                    onEvent?.('INSERT', inserted);
                } else if (payload?.eventType === 'UPDATE' && payload?.new) {
                    const fullRow = await fetchDriverRecord(String(payload.new.id || ''));
                    const sourceRow = fullRow || payload.new;
                    const creatorMap = await hydrateCreatorMap([sourceRow]);
                    const updated = mapDbToDriver(sourceRow, creatorMap);
                    currentDrivers = currentDrivers.map((d) => d.id === updated.id ? updated : d);
                    callback(currentDrivers);
                    onEvent?.('UPDATE', updated);
                } else if (payload?.eventType === 'DELETE' && payload?.old) {
                    const deletedId = payload.old.id as string;
                    const deleted = currentDrivers.find((d) => d.id === deletedId);
                    currentDrivers = currentDrivers.filter((d) => d.id !== deletedId);
                    callback(currentDrivers);
                    onEvent?.('DELETE', deleted);
                }
            } catch (error) {
                console.warn('[REALTIME] Optimistic patch failed, will reconcile with fetch.', error);
            }

            try {
                const refreshed = await fetchDrivers(ownerId);
                currentDrivers = refreshed;
                callback(refreshed);
            } catch (error) {
                console.error('[REALTIME] Driver reconciliation fetch failed:', error);
            }
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
};

export const subscribeToEmailLogs = (userId: string, callback: (logs: EmailLogEntry[]) => void) => {
    fetchEmailLogs(userId).then(callback);
    const channel = supabase.channel(`public:email_logs:user_id=eq.${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'email_logs', filter: `user_id=eq.${userId}` }, async () => {
            callback(await fetchEmailLogs(userId));
        })
        .subscribe();
    return () => supabase.removeChannel(channel);
};

export const subscribeToDriverReplies = (userId: string, callback: (replies: DriverReply[]) => void) => {
    fetchDriverReplies(userId).then(callback);
    const channel = supabase.channel(`public:driver_replies:user_id=eq.${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_replies', filter: `user_id=eq.${userId}` }, async () => {
            callback(await fetchDriverReplies(userId));
        })
        .subscribe();
    return () => supabase.removeChannel(channel);
};
