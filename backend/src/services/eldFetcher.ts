import axios, { AxiosInstance } from 'axios';
import { ELDDriverPayload, DutyStatus, ELDStatus } from '../types';

/**
 * Leader ELD API Integration
 * Backend: api.drivehos.app/api/v1
 * Auth: POST /auth/login → Bearer token
 * Drivers: GET /drivers  
 * HOS/Live Status: GET /hos/system-list
 */

const BASE_URL = process.env.ELD_API_BASE_URL || 'https://api.drivehos.app/api/v1';
let authToken: string | null = null;
let tokenExpiry: number = 0;
let tenantId: string | null = null;

// Axios instance needs to be created, but we will use request interceptor or set baseURL later 
// if it changes dynamically, but typically process.env.ELD_API_BASE_URL is static enough if dotenv is loaded early.
// To be safe against top-level dotenv loading, we use process.env where needed.
const eldApi: AxiosInstance = axios.create({
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' }
});

// Interceptor to ensure baseURL is fresh
eldApi.interceptors.request.use((config) => {
    config.baseURL = process.env.ELD_API_BASE_URL || 'https://api.drivehos.app/api/v1';
    return config;
});

/**
 * Authenticate and get a fresh Bearer token.
 * Called automatically before any data request.
 */
const authenticate = async (): Promise<string> => {
    const now = Date.now();

    // Return cached token if still valid (within 50 mins)
    if (authToken && now < tokenExpiry) {
        return authToken;
    }

    console.log('[ELD AUTH] Logging in to Leader ELD (drivehos.app)...');

    // If user provided a session token from the UI, use it directly.
    if (process.env.ELD_API_KEY) {
        console.log('[ELD AUTH] Using provided ELD_API_KEY as session token.');
        // Cache it so we don't re-check on every call
        authToken = process.env.ELD_API_KEY;
        tokenExpiry = now + 50 * 60 * 1000;
        return authToken;
    }

    const email = process.env.ELD_API_USERNAME;
    const password = process.env.ELD_API_PASSWORD;

    if (!email || !password) {
        throw new Error('[ELD AUTH] Missing ELD_API_KEY or ELD_API_USERNAME/PASSWORD in .env');
    }

    let res;
    try {
        res = await eldApi.post('/auth/login', { email, password, recaptcha_token: 'bypass', recaptcha: '' });
    } catch (apiError: any) {
        // Extract the exact error message from the ELD API response
        const apiData = apiError.response?.data;
        const errMsg = apiData?.message || apiData?.error || JSON.stringify(apiData) || apiError.message;
        console.error('[ELD AUTH] Login rejected by Leader ELD:', errMsg);
        throw new Error(errMsg);
    }

    // Extract token — common patterns: res.data.token, res.data.access_token, res.data.data.token
    const token =
        res.data?.token ||
        res.data?.access_token ||
        res.data?.data?.token ||
        res.data?.data?.access_token;

    if (!token) {
        console.error('[ELD AUTH] Login response:', JSON.stringify(res.data, null, 2));
        throw new Error('Token not found in login response.');
    }

    // Extract tenant_id from login if not already set
    if (!tenantId) {
        tenantId =
            res.data?.tenant_id ||
            res.data?.data?.tenant_id ||
            res.data?.user?.tenant_id ||
            null;
        if (tenantId) console.log(`[ELD AUTH] Tenant ID resolved from login: ${tenantId}`);
    }

    authToken = token;
    tokenExpiry = now + 50 * 60 * 1000; // Cache for 50 minutes

    console.log('[ELD AUTH] ✅ Authenticated successfully.');
    return token;
};

/**
 * Reset cached auth state. Call this when new credentials are set at runtime.
 */
export const resetAuth = () => {
    authToken = null;
    tokenExpiry = 0;
    tenantId = null;
    console.log('[ELD AUTH] Auth cache cleared — will re-authenticate on next request.');
};

/**
 * Test authentication with the current credentials.
 * Makes a REAL call to /drivers?limit=1 to confirm the token actually works.
 * Throws on failure. Used by the configure endpoint to validate credentials from the UI.
 */
export const testELDAuth = async (): Promise<{ tenantId: string | null }> => {
    // Force a fresh authentication (ignore cache)
    resetAuth();
    const token = await authenticate();
    const headers = buildHeaders(token);

    // Make a real test call to verify the token is accepted for data requests
    try {
        const testRes = await eldApi.get('/drivers', {
            headers,
            params: { page: 1, limit: 1, status: 'all' }
        });
        console.log('[ELD AUTH] Token verification passed. Response keys:', Object.keys(testRes.data || {}));
    } catch (verifyError: any) {
        const apiData = verifyError.response?.data;
        const errMsg = apiData?.message || apiData?.description || JSON.stringify(apiData) || verifyError.message;
        // Reset so we don't cache a bad token
        resetAuth();
        delete process.env.ELD_API_KEY;
        delete process.env.ELD_API_USERNAME;
        delete process.env.ELD_API_PASSWORD;
        throw new Error(`Token rejected by ELD /drivers: ${errMsg}`);
    }

    return { tenantId };
};

/**
 * Build headers for authenticated ELD requests.
 */
const buildHeaders = (token: string) => {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`
    };
    const currentTenantId = tenantId || process.env.ELD_TENANT_ID;
    if (currentTenantId) {
        headers['tenant_id'] = currentTenantId;
    }
    return headers;
};

/**
 * Fetch all drivers from Leader ELD, including real-time HOS status.
 * Merges /drivers (identity) + /hos/system-list (location, connection, duty).
 */
export const fetchELDData = async (): Promise<ELDDriverPayload[]> => {
    // Ensure required credentials are present (either API key OR username + password)
    if (!process.env.ELD_API_KEY && (!process.env.ELD_API_USERNAME || !process.env.ELD_API_PASSWORD)) {
        console.warn('[ELD] Missing ELD API credentials (no token and no login); returning empty driver list.');
        return [];
    }
    const token = await authenticate();
    const headers = buildHeaders(token);

    console.log('[ELD] Fetching ALL drivers from /drivers (paginated)...');

    // --- Step 1: Paginate through ALL drivers ---
    const rawDrivers: any[] = [];
    let page = 1;
    const PAGE_SIZE = 100;

    while (true) {
        let driversRes;
        try {
            driversRes = await eldApi.get('/drivers', {
                headers,
                params: { page, limit: PAGE_SIZE, status: 'all', sortBy: 'driver', orderBy: 'asc' }
            });
        } catch (apiError: any) {
            const apiData = apiError.response?.data;
            const errMsg = apiData?.message || apiData?.error || JSON.stringify(apiData) || apiError.message;
            console.error(`[ELD FETCH] /drivers rejected:`, errMsg);
            throw new Error(`ELD /drivers rejected: ${errMsg}`);
        }

        // Always log raw keys on first page so we can see what the ELD returns
        if (page === 1) {
            console.log('[ELD DEBUG] /drivers raw top-level keys:', Object.keys(driversRes.data || {}));
            console.log('[ELD DEBUG] /drivers raw data (truncated):', JSON.stringify(driversRes.data).slice(0, 500));
        }

        // Try every common response shape
        let pageData: any[] =
            driversRes.data?.data ||
            driversRes.data?.drivers ||
            driversRes.data?.list ||
            driversRes.data?.results ||
            driversRes.data?.items ||
            driversRes.data?.records ||
            (Array.isArray(driversRes.data) ? driversRes.data : null) ||
            [];

        // If pageData is still not an array, try to extract the first array-valued key
        if (!Array.isArray(pageData)) {
            const firstArrayKey = Object.keys(driversRes.data || {}).find(k => Array.isArray((driversRes.data as any)[k]));
            if (firstArrayKey) {
                console.log(`[ELD DEBUG] Using array key: "${firstArrayKey}"`);
                pageData = (driversRes.data as any)[firstArrayKey];
            } else {
                console.warn('[ELD DEBUG] No array found in /drivers response — stopping pagination.');
                break;
            }
        }

        if (page === 1) {
            console.log(`[ELD DEBUG] pageData type: ${typeof pageData}, length: ${Array.isArray(pageData) ? pageData.length : 'N/A'}`);
            console.log('[ELD DEBUG] First driver sample:', JSON.stringify(pageData[0]).slice(0, 400));
        }

        if (pageData.length === 0) break;

        rawDrivers.push(...pageData);
        console.log(`[ELD] /drivers page ${page}: fetched ${pageData.length} (total so far: ${rawDrivers.length})`);

        // Stop if we got fewer results than the page size — means we're on the last page
        if (pageData.length < PAGE_SIZE) break;
        page++;
    }

    console.log(`[ELD] ✅ Total drivers fetched: ${rawDrivers.length}`);

    // --- Step 2: Paginate through all HOS/location/connection records ---
    console.log('[ELD] Fetching live HOS status from /hos/system-list (paginated)...');
    const rawHos: any[] = [];
    let hosPage = 1;

    while (true) {
        let hosRes;
        try {
            hosRes = await eldApi.get('/hos/system-list', {
                headers,
                params: { page: hosPage, limit: PAGE_SIZE, eld_status: 'all', duty_status: 'all' }
            });
        } catch (apiError: any) {
             const apiData = apiError.response?.data;
             const errMsg = apiData?.message || apiData?.error || JSON.stringify(apiData) || apiError.message;
             console.error(`[ELD FETCH] /hos/system-list rejected:`, errMsg);
             throw new Error(`ELD /hos/system-list rejected: ${errMsg}`);
        }

        const hosPageData: any[] = hosRes.data?.data || hosRes.data?.list || hosRes.data || [];
        if (!Array.isArray(hosPageData) || hosPageData.length === 0) break;

        rawHos.push(...hosPageData);
        console.log(`[ELD] /hos/system-list page ${hosPage}: fetched ${hosPageData.length} (total so far: ${rawHos.length})`);

        if (hosPageData.length < PAGE_SIZE) break;
        hosPage++;
    }

    console.log(`[ELD] ✅ Total HOS records fetched: ${rawHos.length}`);

    // Build a quick lookup map by driver_id for HOS data
    const hosMap: Record<string, any> = {};
    for (const hos of rawHos) {
        const id = hos.driver_id || hos.id;
        if (id) hosMap[id] = hos;
    }

    // --- Step 3: Merge and normalize ---
    const enriched: ELDDriverPayload[] = rawDrivers.map((d: any) => {
        const id = d.driver_id || d.id;
        const hos = hosMap[id] || {};

        // Normalize duty status
        const rawDuty = (hos.duty_status || d.duty_status || '').toLowerCase();
        let dutyStatus = DutyStatus.NOT_SET;
        if (rawDuty.includes('driving')) dutyStatus = DutyStatus.DRIVING;
        else if (rawDuty.includes('on_duty') || rawDuty.includes('on duty')) dutyStatus = DutyStatus.ON_DUTY;
        else if (rawDuty.includes('off_duty') || rawDuty.includes('off duty')) dutyStatus = DutyStatus.OFF_DUTY;
        else if (rawDuty.includes('sleeper') || rawDuty.includes('sleep')) dutyStatus = DutyStatus.SLEEPER;

        // Connection status
        const isConnected = hos.online === true || hos.eld_status === true || hos.eld_status === 'connected';

        // GPS coordinates
        const lat = parseFloat(hos.lat || hos.latitude || hos.gps_lat || '0');
        const lng = parseFloat(hos.lon || hos.lng || hos.longitude || hos.gps_lon || '0');

        // Profile form last updated — use driver's own updated_at field
        const lastProfileUpdateIso = d.profile_updated_at || d.pf_updated_at || d.updated_at || null;

        // Extract board from ELD group/fleet/tag fields
        const rawBoard =
            d.group?.name ||
            d.fleet?.name ||
            d.board ||
            d.tag ||
            d.group_name ||
            hos.group_name ||
            null;
        
        // Extract company name
        const company =
            d.company?.name ||
            d.carrier?.name ||
            d.company_name ||
            d.carrier_name ||
            '';

        // Device information
        const deviceType = d.device_type || d.device?.type || hos.device_type || 'Leader ELD';
        const appVersion = d.app_version || d.version || hos.app_version || '';

        return {
            driverId: String(id),
            fullName: `${d.first_name || ''} ${d.last_name || ''}`.trim() || 'Unknown Driver',
            emailAddress: d.email || '',
            coordinates: { lat, lng },
            isConnected,
            dutyStatus,
            lastProfileUpdateIso,
            board: rawBoard || undefined,
            company: company || undefined,
            deviceType: deviceType || undefined,
            appVersion: appVersion || undefined
        };
    });

    console.log(`[ELD] ✅ Successfully enriched ${enriched.length} drivers.`);
    return enriched;
};
