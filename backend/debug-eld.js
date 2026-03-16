/**
 * Quick debug script: fetch raw ELD /drivers response and print structure.
 * Run from backend folder: node debug-eld.js
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.ELD_API_BASE_URL || 'https://api.drivehos.app/api/v1';
const token = process.env.ELD_API_KEY;

if (!token) {
    console.error('No ELD_API_KEY in .env. Set it first.');
    process.exit(1);
}

(async () => {
    try {
        console.log('Using baseUrl:', BASE_URL);
        console.log('Token (first 30 chars):', token.substring(0, 30) + '...');
        
        const res = await axios.get(`${BASE_URL}/drivers`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { page: 1, limit: 5, status: 'all' }
        });
        
        console.log('\n=== /drivers RESPONSE ===');
        console.log('Status:', res.status);
        console.log('Top-level keys:', Object.keys(res.data));
        
        // Try to find the array
        for (const key of Object.keys(res.data)) {
            const val = res.data[key];
            if (Array.isArray(val)) {
                console.log(`\nFound array at key "${key}" with ${val.length} items`);
                if (val.length > 0) {
                    console.log('\nFirst driver keys:', Object.keys(val[0]));
                    console.log('\nFirst driver (sample):', JSON.stringify(val[0], null, 2).slice(0, 600));
                }
            } else {
                console.log(`Key "${key}":`, typeof val === 'object' ? JSON.stringify(val) : val);
            }
        }
    } catch (err) {
        console.error('Error:', err.response?.status, JSON.stringify(err.response?.data));
    }
})();
