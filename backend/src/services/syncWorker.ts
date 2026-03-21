import { fetchELDData } from './eldFetcher';
import { sendReminderEmail, sendDisconnectionEmail } from './emailSender';
import { getDb } from './supabaseAdmin';
import { ELDDriverPayload, ELDStatus, DutyStatus } from '../types';

/**
 * Supabase user IDs that should receive the synced driver data.
 */
const SUPABASE_USER_IDS: string[] = [
    // Add UUIDs of the admin users here (e.g., info.algoservice01 uuid)
];

/**
 * Core function that fetches ELD data and writes to Firestore for a given set of user IDs.
 * Called by both the cron scheduler and the on-demand import endpoint.
 */
const runSyncForUserIds = async (userIds: string[]) => {
    console.log('\n================================');
    console.log('[WORKER] Starting ELD sync cycle...');
    console.log(`[WORKER] Time: ${new Date().toISOString()}`);
    console.log('================================');

    const now = new Date();
    const db = getDb();

    console.log(`[WORKER] Writing to ${userIds.length} user account(s): ${userIds.join(', ')}`);

    // 1. Fetch live fleet data from Leader ELD API (paginated)
    const liveDrivers = await fetchELDData();

    let processedCount = 0;
    let emailsSent = 0;
    let writtenCount = 0;

    for (const eldDriver of liveDrivers) {
        processedCount++;
        const driverId = eldDriver.driverId;

        // 2. Read last known reminder timestamps from the primary user's Firestore doc
        let last3DayEmail: string | null = null;
        let last5DayEmail: string | null = null;
        let lastDisconnectEmail: string | null = null;
        let existingData: any = {};

        if (db) {
            try {
                // Read state from first user's record in Supabase
                const { data } = await db.from('drivers')
                    .select('*')
                    .eq('id', driverId)
                    .eq('user_id', userIds[0])
                    .single();
                if (data) {
                    existingData = data;
                    last3DayEmail = existingData.last3dayemail || null;
                    last5DayEmail = existingData.last5dayemail || null;
                    lastDisconnectEmail = existingData.lastdisconnectemail || null;
                }
            } catch (e) {
                console.warn(`[WORKER] Could not read Supabase for driver ${driverId}:`, e);
            }
        }

        // 3. Calculate inactivity
        let daysInactive = 0;
        let status = 'ok';
        let needs3DayEmail = false;
        let needs5DayEmail = false;
        let updatedLast3DayEmail = last3DayEmail;
        let updatedLast5DayEmail = last5DayEmail;
        let updatedDisconnectEmail = lastDisconnectEmail;

        if (eldDriver.lastProfileUpdateIso) {
            const lastUpdate = new Date(eldDriver.lastProfileUpdateIso);
            daysInactive = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));

            if (daysInactive >= 5) status = '5_day_pending';
            else if (daysInactive >= 3) status = '3_day_pending';
            else if (daysInactive === 2) status = 'warning';

            // Single-send-per-cycle logic
            needs3DayEmail = status === '3_day_pending' &&
                (!last3DayEmail || new Date(last3DayEmail).getTime() < lastUpdate.getTime());
            needs5DayEmail = status === '5_day_pending' &&
                (!last5DayEmail || new Date(last5DayEmail).getTime() < lastUpdate.getTime());
        }

        // 4. Disconnection alert — max once per day
        const needsDisconnectEmail = !eldDriver.isConnected && eldDriver.emailAddress &&
            (!lastDisconnectEmail || new Date(lastDisconnectEmail).toDateString() !== now.toDateString());

        // 5. Send emails
        if (needs3DayEmail && eldDriver.emailAddress) {
            console.log(`[WORKER] 📧 3-day reminder → ${eldDriver.fullName} (${eldDriver.emailAddress})`);
            const sent = await sendReminderEmail(eldDriver.emailAddress, eldDriver.fullName, 3);
            if (sent) { updatedLast3DayEmail = now.toISOString(); emailsSent++; }
        }

        if (needs5DayEmail && eldDriver.emailAddress) {
            console.log(`[WORKER] 📧 5-day reminder → ${eldDriver.fullName} (${eldDriver.emailAddress})`);
            const sent = await sendReminderEmail(eldDriver.emailAddress, eldDriver.fullName, 5);
            if (sent) { updatedLast5DayEmail = now.toISOString(); emailsSent++; }
        }

        if (needsDisconnectEmail) {
            console.log(`[WORKER] 🔴 Disconnection alert → ${eldDriver.fullName}`);
            const sent = await sendDisconnectionEmail(eldDriver.emailAddress, eldDriver.fullName);
            if (sent) { updatedDisconnectEmail = now.toISOString(); emailsSent++; }
        }

        // 6. Write to Supabase using bulk upsert mapping 
        if (db) {
            const upsertPayloads = userIds.map(uid => ({
                id: driverId,
                user_id: uid,
                name: eldDriver.fullName,
                email: eldDriver.emailAddress,
                company: eldDriver.company || existingData.company || '',
                board: eldDriver.board || existingData.board || '',
                devicetype: eldDriver.deviceType || existingData.devicetype || 'Leader ELD',
                appversion: eldDriver.appVersion || existingData.appversion || '',
                eldstatus: eldDriver.isConnected ? ELDStatus.CONNECTED : ELDStatus.DISCONNECTED,
                dutystatus: eldDriver.dutyStatus || DutyStatus.NOT_SET,
                emailsent: existingData.emailsent || false,
                followup: existingData.followup || null,
                lastpfupdate: eldDriver.lastProfileUpdateIso,
                last3dayemail: updatedLast3DayEmail,
                last5dayemail: updatedLast5DayEmail,
                updated_at: now.toISOString()
            }));

            const { error } = await db.from('drivers').upsert(upsertPayloads, { onConflict: 'id,user_id' });
            if (error) {
                console.error(`[WORKER] ❌ Write failed for ${eldDriver.fullName}:`, error);
            } else {
                writtenCount++;
            }
        } else {
            console.log(`[SIM] ${eldDriver.fullName} | ${eldDriver.isConnected ? '🟢 Connected' : '🔴 Disconnected'} | ${status} | Days inactive: ${daysInactive}`);
        }
    }

    console.log('================================');
    console.log(`[WORKER] ✅ Sync complete!`);
    console.log(`[WORKER]    Processed: ${processedCount} drivers`);
    console.log(`[WORKER]    Supabase writes: ${writtenCount}`);
    console.log(`[WORKER]    Emails sent: ${emailsSent}`);
    console.log('================================\n');

    return { processedCount, writtenCount, emailsSent };
};

/**
 * Run a full ELD sync cycle for ALL configured admin users (used by cron scheduler).
 */
export const runSyncWorker = async () => {
    const userIds = process.env.SUPABASE_USER_ID
        ? [process.env.SUPABASE_USER_ID, ...SUPABASE_USER_IDS.filter(id => id !== process.env.SUPABASE_USER_ID)]
        : SUPABASE_USER_IDS;
    if (userIds.length === 0) return { processedCount: 0, writtenCount: 0, emailsSent: 0 };
    return runSyncForUserIds(userIds);
};

export const runSyncForUser = async (supabaseUserId: string) => {
    console.log(`[WORKER] On-demand import triggered for user: ${supabaseUserId}`);
    const userIds = [supabaseUserId, ...SUPABASE_USER_IDS.filter(id => id !== supabaseUserId)];
    return runSyncForUserIds(userIds);
};
