import { supabase } from '../supabase';
import { Driver, EmailLogEntry, DriverReply } from '../types';

export interface UserProfile {
    id: string;
    email: string;
    name?: string | null;
    role?: string | null;
    admin_id?: string | null;
    assigned_boards?: string[] | null;
    assigned_companies?: string[] | null;
}

/**
 * Initialize user database on first login
 * In Supabase, the profile is created via a trigger, so we just check it exists.
 */
export const initializeUserDatabase = async (userId: string, userEmail: string, userName: string) => {
    // A profile should already exist from the auth trigger, but we'll fetch it to confirm.
    const { data } = await supabase.from('profiles').select('id').eq('id', userId).single();
    return !!data;
};

export const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, name, role, admin_id, assigned_boards, assigned_companies')
        .eq('id', userId)
        .single();

    if (error) {
        return null;
    }

    return data as UserProfile;
};

/**
 * Check if user has already imported data from Google Sheets
 */
export const hasImportedFromSheets = async (userId: string): Promise<boolean> => {
    const { data } = await supabase.from('profiles').select('has_imported_from_sheets').eq('id', userId).single();
    return data?.has_imported_from_sheets === true;
};

/**
 * Mark that user has imported data from Google Sheets
 */
export const markSheetsImported = async (userId: string) => {
    await supabase.from('profiles').update({
        has_imported_from_sheets: true,
        imported_at: new Date().toISOString()
    }).eq('id', userId);
};

// Helper function to map from App Driver to DB schema
const mapDriverToDb = (userId: string, driver: Partial<Driver>) => {
    return {
        id: driver.id,
        user_id: userId,
        name: driver.name,
        email: driver.email,
        company: driver.company,
        board: driver.board,
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

const mapDbToDriver = (dbRow: any): Driver => {
    return {
        id: dbRow.id,
        name: dbRow.name,
        email: dbRow.email,
        company: dbRow.company,
        board: dbRow.board,
        deviceType: dbRow.devicetype,
        appVersion: dbRow.appversion,
        eldStatus: dbRow.eldstatus,
        dutyStatus: dbRow.dutystatus,
        followUp: dbRow.followup,
        emailSent: dbRow.emailsent,
        hasPendingAlert: dbRow.haspendingalert,
        sheetRowIndex: dbRow.sheetrowindex,
        lastEmailTime: dbRow.lastemailtime,
        lastSentAt: dbRow.lastsentat,
        lastPFUpdate: dbRow.lastpfupdate,
        lastProfileReminderAt: dbRow.lastprofilereminderat,
        last3DayEmail: dbRow.last3dayemail,
        last5DayEmail: dbRow.last5dayemail
    } as Driver;
};

/**
 * Fetch all drivers for a user
 */
export const fetchDrivers = async (userId: string): Promise<Driver[]> => {
    const { data } = await supabase.from('drivers').select('*').eq('user_id', userId);
    return (data || []).map(mapDbToDriver);
};

/**
 * Add a new driver
 */
export const addDriver = async (userId: string, driver: Driver, ownerId?: string) => {
    await supabase.from('drivers').insert(mapDriverToDb(ownerId || userId, driver));
};

/**
 * Bulk add drivers (for Google Sheets import)
 */
export const bulkAddDrivers = async (userId: string, drivers: Driver[], ownerId?: string) => {
    await supabase.from('drivers').insert(drivers.map(d => mapDriverToDb(ownerId || userId, d)));
};

/**
 * Update an existing driver
 */
export const updateDriver = async (userId: string, driverId: string, updates: Partial<Driver>, ownerId?: string) => {
    const effectiveOwnerId = ownerId || userId;
    const { id, user_id, ...dbUpdates } = mapDriverToDb(effectiveOwnerId, updates) as any;

    // Filter out undefined values
    const cleanUpdates = Object.fromEntries(Object.entries(dbUpdates).filter(([_, v]) => v !== undefined));

    await supabase.from('drivers').update({
        ...cleanUpdates,
        updated_at: new Date().toISOString()
    }).eq('id', driverId).eq('user_id', effectiveOwnerId);
};

/**
 * Delete a driver
 */
export const deleteDriver = async (userId: string, driverId: string, ownerId?: string) => {
    const effectiveOwnerId = ownerId || userId;
    await supabase.from('drivers').delete().eq('id', driverId).eq('user_id', effectiveOwnerId);
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

/**
 * Fetch email logs for a user
 */
export const fetchEmailLogs = async (userId: string): Promise<EmailLogEntry[]> => {
    const { data } = await supabase.from('email_logs').select('*').eq('user_id', userId).order('timestamp', { ascending: false });
    return (data || []).map(mapDbToLog);
};

/**
 * Add an email log entry
 */
export const addEmailLog = async (userId: string, log: EmailLogEntry) => {
    await supabase.from('email_logs').insert(mapLogToDb(userId, log));
};

const mapReplyToDb = (userId: string, reply: DriverReply) => ({
    id: reply.id,
    user_id: userId,
    driver_id: reply.driverId,
    driver_name: reply.driverName,
    message: reply.message,
    timestamp: reply.timestamp,
    is_read: reply.isRead
});

const mapDbToReply = (row: any): DriverReply => ({
    id: row.id,
    driverId: row.driver_id,
    driverName: row.driver_name,
    message: row.message,
    timestamp: row.timestamp,
    isRead: row.is_read
});

/**
 * Fetch driver replies for a user
 */
export const fetchDriverReplies = async (userId: string): Promise<DriverReply[]> => {
    const { data } = await supabase.from('driver_replies').select('*').eq('user_id', userId).order('timestamp', { ascending: false });
    return (data || []).map(mapDbToReply);
};

/**
 * Add a driver reply
 */
export const addDriverReply = async (userId: string, reply: DriverReply) => {
    await supabase.from('driver_replies').insert(mapReplyToDb(userId, reply));
};

/**
 * Subscribe to real-time driver updates
 */
export const subscribeToDrivers = (ownerUserId: string, callback: (drivers: Driver[]) => void) => {
    // First, fetch initial list
    fetchDrivers(ownerUserId).then(callback);

    const channel = supabase.channel(`public:drivers:user_id=eq.${ownerUserId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers', filter: `user_id=eq.${ownerUserId}` }, async () => {
            const updated = await fetchDrivers(ownerUserId);
            callback(updated);
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
};

/**
 * Subscribe to real-time email log updates
 */
export const subscribeToEmailLogs = (userId: string, callback: (logs: EmailLogEntry[]) => void) => {
    fetchEmailLogs(userId).then(callback);

    const channel = supabase.channel(`public:email_logs:user_id=eq.${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'email_logs', filter: `user_id=eq.${userId}` }, async () => {
            const updated = await fetchEmailLogs(userId);
            callback(updated);
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
};

/**
 * Subscribe to real-time driver reply updates
 */
export const subscribeToDriverReplies = (userId: string, callback: (replies: DriverReply[]) => void) => {
    fetchDriverReplies(userId).then(callback);

    const channel = supabase.channel(`public:driver_replies:user_id=eq.${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'driver_replies', filter: `user_id=eq.${userId}` }, async () => {
            const updated = await fetchDriverReplies(userId);
            callback(updated);
        })
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
};
