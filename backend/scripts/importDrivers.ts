import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { getDb } from '../src/services/supabaseAdmin';
import { ELDStatus, DutyStatus } from '../src/types';

// Load environment variables
dotenv.config();

const SUPABASE_USER_IDS: string[] = [
    // Add UUIDs of the admin users here
];

const importData = async () => {
    console.log('--- Starting Manual Driver Import ---');
    const db = getDb();

    if (!db) {
        console.error('❌ Firebase DB failed to initialize. Check .env');
        process.exit(1);
    }

    const filePath = path.join(__dirname, '..', 'active_drivers.json');
    if (!fs.existsSync(filePath)) {
        console.error(`❌ Data file not found at: ${filePath}`);
        console.error(`Please save the JSON from the ELD portal as active_drivers.json in the backend folder.`);
        process.exit(1);
    }

    let driversList = [];
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(fileContent);

        // Handle common JSON responses where data might be under 'data', 'drivers', or raw array
        driversList = parsed.data || parsed.drivers || parsed.list || parsed;

        if (!Array.isArray(driversList)) {
            throw new Error('Parsed data is not an array.');
        }
    } catch (e) {
        console.error('❌ Failed to parse active_drivers.json:', e.message);
        process.exit(1);
    }

    console.log(`✅ Loaded ${driversList.length} drivers from JSON.`);

    const now = new Date();
    let importedCount = 0;
    let upserts = [];

    for (const d of driversList) {
        const id = String(d.driver_id || d.id);
        if (!id) continue;

        const fullName = `${d.first_name || ''} ${d.last_name || ''}`.trim() || 'Unknown Driver';
        const email = d.email || '';

        // Setup initial driver record mapping
        const driverPayload: Record<string, any> = {
            id,
            name: fullName,
            email: email,
            company: d.carrier_name || '',
            deviceType: 'Leader ELD',
            eldStatus: ELDStatus.DISCONNECTED,
            dutyStatus: DutyStatus.NOT_SET,
            emailSent: false,
            lastPFUpdate: d.profile_updated_at || d.pf_updated_at || d.updated_at || null,
            syncedAt: now.toISOString()
        };

        // Write to all core admin accounts
        for (const uid of SUPABASE_USER_IDS) {
            upserts.push({
                id,
                user_id: uid,
                name: fullName,
                email: email,
                company: d.carrier_name || '',
                devicetype: 'Leader ELD',
                eldstatus: ELDStatus.DISCONNECTED,
                dutystatus: DutyStatus.NOT_SET,
                emailsent: false,
                lastpfupdate: d.profile_updated_at || d.pf_updated_at || d.updated_at || null,
                updated_at: now.toISOString()
            });
        }
        importedCount++;

        if (upserts.length >= 800) {
            await db.from('drivers').upsert(upserts, { onConflict: 'id,user_id' });
            console.log(`[Batch] Written chunk of ${upserts.length} records...`);
            upserts = [];
        }
    }

    try {
        if (upserts.length > 0) {
            await db.from('drivers').upsert(upserts, { onConflict: 'id,user_id' });
        }
        console.log(`✅ Successfully imported/updated ${importedCount} drivers across ${SUPABASE_USER_IDS.length} users.`);
    } catch (e) {
        console.error('❌ Failed to commit final batch to Firestore:', e);
    }

    console.log('--- Import Complete ---');
    process.exit(0);
};

importData();
