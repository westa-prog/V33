import React, { useState, useMemo, useEffect } from 'react';
import { Driver, ELDStatus } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Play, Square, RefreshCw, Monitor, Tablet, Smartphone, Link, Unlink, KeyRound, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import axios from 'axios';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Map, MapControls } from './ui/map';

interface DashboardProps {
    drivers: Driver[];
    assignedBoard?: string;
    firebaseUid?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ drivers, assignedBoard, firebaseUid }) => {
    const rawApiBaseUrl = ((import.meta as any).env.VITE_API_URL || '').trim();
    const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '');
    const apiUrl = (path: string) => apiBaseUrl ? `${apiBaseUrl}${path}` : path;
    const [boardFilter, setBoardFilter] = useState<string | 'ALL'>('ALL');
    const [previewMode, setPreviewMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
    const [backendStatus, setBackendStatus] = useState<{ status: string; cronActive: boolean; lastSyncTime: string | null; isSyncing: boolean } | null>(null);
    const [eldStatus, setEldStatus] = useState<{ configured: boolean; verified: boolean; method: string } | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState<{ driversProcessed: number; firestoreWrites: number } | null>(null);
    // ELD credentials form state
    const [showEldPanel, setShowEldPanel] = useState(false);
    const [eldLoginMode, setEldLoginMode] = useState<'credentials' | 'token'>('credentials');
    const [eldUsername, setEldUsername] = useState('');
    const [eldPassword, setEldPassword] = useState('');
    const [eldToken, setEldToken] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [eldConnectResult, setEldConnectResult] = useState<{ success: boolean; message: string; tenantId?: string | null } | null>(null);

    // If user is RBAC-restricted, boards list is irrelevant — they see all drivers passed to them by App.tsx
    const boards = Array.from(new Set(drivers.map(d => d.board).filter(Boolean)));

    const filteredDrivers = useMemo(() => {
        // If user has an assigned board, App.tsx already pre-filtered — skip local filter
        if (assignedBoard) return drivers;
        if (boardFilter === 'ALL') return drivers;
        return drivers.filter(d => d.board === boardFilter);
    }, [drivers, boardFilter, assignedBoard]);

    const totalDrivers = filteredDrivers.length;
    const activeDrivers = filteredDrivers.filter(d => d.eldStatus === ELDStatus.CONNECTED).length;
    const inactiveDrivers = filteredDrivers.filter(d => d.eldStatus === ELDStatus.DISCONNECTED).length;

    const connectionStats = useMemo(() => {
        return [
            { name: 'Connected', value: activeDrivers },
            { name: 'Disconnected', value: inactiveDrivers }
        ].filter(stat => stat.value > 0);
    }, [activeDrivers, inactiveDrivers]);

    const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa'];

    const dutyStats = useMemo(() => {
        const counts = filteredDrivers.reduce((acc, driver) => {
            const status = driver.dutyStatus || 'Not Set';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return Object.entries(counts).map(([name, Total]) => ({ name, Total }));
    }, [filteredDrivers]);

    useEffect(() => {
        const checkBackend = async () => {
            try {
                const res = await axios.get(apiUrl('/api/status'));
                setBackendStatus(res.data);
            } catch (e) {
                setBackendStatus({ status: 'offline', cronActive: false, lastSyncTime: null, isSyncing: false });
            }
        };
        const checkEldStatus = async () => {
            try {
                const res = await axios.get(apiUrl('/api/eld/status'));
                setEldStatus(res.data);
            } catch { /* Backend offline, ELD status unknown */ }
        };
        checkBackend();
        checkEldStatus();
        const interval = setInterval(checkBackend, 10000);
        return () => clearInterval(interval);
    }, [apiBaseUrl]);

    const importFromELD = async () => {
        if (!firebaseUid) return alert('You must be logged in to import ELD data.');
        if (!backendStatus || backendStatus.status === 'offline') return alert('Backend is offline. Please start the Node.js server first.');
        if (!eldStatus?.verified) return alert('Please connect your ELD account first using the "Connect ELD" panel.');
        try {
            setIsImporting(true);
            setImportResult(null);
            const res = await axios.post(apiUrl('/api/eld/import-now'), {
                firebaseUserId: firebaseUid,
                supabaseUserId: firebaseUid
            });
            setImportResult({
                driversProcessed: res.data.driversProcessed || 0,
                firestoreWrites: res.data.firestoreWrites || res.data.databaseWrites || 0
            });
        } catch (e: any) {
            alert(`Import failed: ${e?.response?.data?.error || e.message}`);
        } finally {
            setIsImporting(false);
        }
    };

    const connectToELD = async () => {
        if (!backendStatus || backendStatus.status === 'offline') {
            return alert('Backend server must be running first. Start it with: cd backend && npm start');
        }
        setIsConnecting(true);
        setEldConnectResult(null);
        try {
            const payload = eldLoginMode === 'token'
                ? { apiKey: eldToken.trim() }
                : { username: eldUsername.trim(), password: eldPassword };
            const res = await axios.post(apiUrl('/api/eld/configure'), payload);
            setEldConnectResult({ success: true, message: res.data.message, tenantId: res.data.tenantId });
            // Refresh ELD status to reflect verified = true
            const statusRes = await axios.get(apiUrl('/api/eld/status'));
            setEldStatus(statusRes.data);
        } catch (e: any) {
            setEldConnectResult({ success: false, message: e?.response?.data?.error || 'Connection failed' });
        } finally {
            setIsConnecting(false);
        }
    };

    const toggleCron = async () => {
        if (!backendStatus || backendStatus.status === 'offline') return alert('Backend is offline.');
        try {
            const endpoint = backendStatus.cronActive ? '/api/sync/stop' : '/api/sync/start';
            await axios.post(apiUrl(endpoint));
            setBackendStatus(prev => prev ? { ...prev, cronActive: !prev.cronActive } : prev);
        } catch (e) {
            alert('Failed to toggle automation');
        }
    };

    const forceSync = async () => {
        if (!backendStatus || backendStatus.status === 'offline') return alert('Backend is offline.');
        try {
            setBackendStatus(prev => prev ? { ...prev, isSyncing: true } : prev);
            await axios.post(apiUrl('/api/sync/trigger'));
        } catch (e) {
            alert('Manual sync failed');
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            {/* Header / Filter */}
            <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Connection Dashboard</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Overview of fleet status and active connections.</p>
                </div>
                <div className="flex items-center gap-4">
                    {/* Viewport Toggles */}
                    <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800">
                        <button 
                            onClick={() => setPreviewMode('desktop')}
                            className={`p-1.5 rounded-md transition-colors ${previewMode === 'desktop' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            title="Desktop View"
                        >
                            <Monitor className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => setPreviewMode('tablet')}
                            className={`p-1.5 rounded-md transition-colors ${previewMode === 'tablet' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            title="Tablet View"
                        >
                            <Tablet className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => setPreviewMode('mobile')}
                            className={`p-1.5 rounded-md transition-colors ${previewMode === 'mobile' ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            title="Mobile View"
                        >
                            <Smartphone className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Board Filter — Hidden for restricted users, visible for admins */}
                    {assignedBoard ? (
                        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                            <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">{assignedBoard}</span>
                        </div>
                    ) : (
                        <select
                            value={boardFilter}
                            onChange={(e) => setBoardFilter(e.target.value)}
                            className="text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 dark:text-slate-300 px-4 py-2 outline-none shadow-sm focus:ring-2 focus:ring-indigo-500 font-bold"
                        >
                            <option value="ALL">All Boards</option>
                            {boards.map(b => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* Preview Wrapper */}
            <div className={`transition-all duration-300 ease-in-out mx-auto ${
                previewMode === 'mobile' ? 'max-w-[400px]' : 
                previewMode === 'tablet' ? 'max-w-[768px]' : 'max-w-full'
            }`}>
            
            {/* Main Layout Grid */}
            <div className={`grid grid-cols-1 gap-6 mt-6 ${previewMode === 'desktop' ? 'lg:grid-cols-2' : ''}`}>
                
                {/* Left Column: All Charts & Stats */}
                <div className="flex flex-col gap-6">
                    {/* Pie Chart */}
                    <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col min-h-[350px]">
                        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-6">Connection Status Overview</h3>
                        <div className="relative h-[260px] md:h-[290px] min-w-0">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                                <PieChart>
                                    <Pie
                                        data={connectionStats}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={90}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {connectionStats.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.name === 'Connected' ? '#34d399' : '#f87171'} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', background: '#1e293b', color: '#fff' }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Legend verticalAlign="middle" align="right" layout="vertical" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                                </PieChart>
                            </ResponsiveContainer>
                            {connectionStats.length === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">No data available</div>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none pr-[90px]">
                                <div className="flex flex-col items-center">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total</span>
                                    <span className="text-2xl font-black text-slate-800 dark:text-white">{totalDrivers}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats Numbers */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center relative overflow-hidden group">
                            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">Inactive Driver's</h3>
                            <div className="text-5xl font-black text-slate-800 dark:text-white mb-2">{inactiveDrivers}</div>
                        </div>
                        <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center relative overflow-hidden group">
                            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">Active Driver's</h3>
                            <div className="text-5xl font-black text-slate-800 dark:text-white mb-2">{activeDrivers}</div>
                        </div>
                    </div>

                    {/* Bar Chart */}
                    <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex-1 min-h-[300px] flex flex-col">
                        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-6">Duty Status Distribution</h3>
                        <div className="relative h-[240px] md:h-[280px] min-w-0">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                                <BarChart data={dutyStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 'bold' }} />
                                    <Tooltip cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }} contentStyle={{ borderRadius: '12px', border: 'none', background: '#1e293b', color: '#fff' }} />
                                    <Bar dataKey="Total" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={50}>
                                        {dutyStats.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Right Column: US Map Section */}
                <Card className="flex flex-col border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/60 shadow-sm backdrop-blur-sm min-h-[600px] h-full">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-lg text-slate-900 dark:text-white flex items-center gap-2">US Connected Fleet Traffic</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 p-0 px-6 pb-6">
                        <div className="h-full w-full min-h-[500px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                            <Map center={[-98.5795, 39.8283]} zoom={4}>
                                 <MapControls position="bottom-right" showZoom showCompass showFullscreen />
                            </Map>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ELD Connection Panel */}
            <div className="mt-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                {/* Panel Header — always visible */}
                <button
                    onClick={() => setShowEldPanel(p => !p)}
                    className="w-full flex items-center justify-between p-6 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${eldStatus?.verified ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                            {eldStatus?.verified
                                ? <Link className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                : <Unlink className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                {eldStatus?.verified ? 'ELD Account Connected' : 'Connect Your ELD Account'}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {eldStatus?.verified
                                    ? `Authenticated via ${eldStatus.method === 'api_key' ? 'API Key / Token' : 'Username & Password'} – ready to import`
                                    : 'Enter your Leader ELD admin credentials to enable real-time driver import'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            eldStatus?.verified
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                        }`}>
                            {eldStatus?.verified ? '✓ Connected' : 'Not Connected'}
                        </span>
                        {showEldPanel ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                </button>

                {/* Collapsible Credentials Form */}
                {showEldPanel && (
                    <div className="border-t border-slate-200 dark:border-slate-800 p-6 space-y-5">
                        {/* Mode Toggle */}
                        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
                            <button
                                onClick={() => setEldLoginMode('credentials')}
                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${eldLoginMode === 'credentials' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                Username & Password
                            </button>
                            <button
                                onClick={() => setEldLoginMode('token')}
                                className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${eldLoginMode === 'token' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                Bearer Token / API Key
                            </button>
                        </div>

                        {/* Credentials Form */}
                        {eldLoginMode === 'credentials' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">ELD Admin Email</label>
                                    <input
                                        type="email"
                                        value={eldUsername}
                                        onChange={e => setEldUsername(e.target.value)}
                                        placeholder="admin@yourcompany.com"
                                        className="w-full px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Password</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={eldPassword}
                                            onChange={e => setEldPassword(e.target.value)}
                                            placeholder="••••••••••"
                                            className="w-full px-4 py-2.5 pr-10 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                        <button onClick={() => setShowPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Bearer Token / API Key</label>
                                <div className="relative">
                                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={eldToken}
                                        onChange={e => setEldToken(e.target.value)}
                                        placeholder="Paste your ELD Bearer token here"
                                        className="w-full pl-10 pr-10 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                                    />
                                    <button onClick={() => setShowPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="text-xs text-slate-400 mt-2">You can extract your token from the Leader ELD web portal's Network tab after logging in.</p>
                            </div>
                        )}

                        {/* Connect Button + Result */}
                        <div className="flex items-center gap-4">
                            <button
                                onClick={connectToELD}
                                disabled={isConnecting || (eldLoginMode === 'credentials' ? (!eldUsername || !eldPassword) : !eldToken)}
                                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all flex items-center gap-2 shadow-md shadow-indigo-500/20"
                            >
                                {isConnecting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                                {isConnecting ? 'Connecting...' : 'Connect ELD'}
                            </button>
                            {eldConnectResult && (
                                <div className={`flex items-center gap-2 text-sm font-bold ${eldConnectResult.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                                    <span>{eldConnectResult.success ? '✅' : '❌'}</span>
                                    <span>{eldConnectResult.message}</span>
                                    {eldConnectResult.tenantId && <span className="text-xs font-normal text-slate-400">(Tenant: {eldConnectResult.tenantId})</span>}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Automation Backend Panel */}
            <div className="mt-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Node.js ELD Automation Engine</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                            The standalone Node.js worker automatically syncs with the ELD API every hour, updates records in the background, and dispatches cycle emails to drivers missing profile form deadlines.
                        </p>
                    </div>
                    {/* ELD Credentials Status */}
                    {eldStatus && (
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                            eldStatus.configured 
                                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                        }`}>
                            <span className={`w-2 h-2 rounded-full ${eldStatus.configured ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                            {eldStatus.configured ? `ELD: ${eldStatus.method === 'api_key' ? 'API Key' : 'Username'}` : 'ELD: No Credentials'}
                        </div>
                    )}
                </div>
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-6">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Worker Status</p>
                            <div className="flex items-center gap-2">
                                <span className={`relative flex h-3 w-3`}>
                                    {backendStatus?.status === 'online' ? (
                                        <>
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                        </>
                                    ) : (
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-slate-400"></span>
                                    )}
                                </span>
                                <span className={`font-bold ${backendStatus?.status === 'online' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                                    {backendStatus?.status === 'online' ? 'ONLINE' : 'OFFLINE'}
                                </span>
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Automation Cron</p>
                            <div className={`font-bold ${backendStatus?.cronActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>
                                {backendStatus?.cronActive ? 'ACTIVE' : 'PAUSED'}
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Last Worker Sync</p>
                            <div className="font-bold text-slate-700 dark:text-slate-300">
                                {backendStatus?.lastSyncTime ? new Date(backendStatus.lastSyncTime).toLocaleTimeString() : 'Never'}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Import from ELD Button */}
                        <button
                            onClick={importFromELD}
                            disabled={isImporting || !backendStatus || backendStatus.status === 'offline'}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 border border-indigo-700 shadow-md shadow-indigo-600/20"
                        >
                            {isImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {isImporting ? 'Importing...' : 'Import from ELD'}
                        </button>
                        <button
                            onClick={forceSync}
                            disabled={!backendStatus || backendStatus.status === 'offline' || backendStatus.isSyncing}
                            className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-sm rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${backendStatus?.isSyncing ? 'animate-spin' : ''}`} />
                            {backendStatus?.isSyncing ? 'Syncing...' : 'Force Sync'}
                        </button>
                        <button
                            onClick={toggleCron}
                            disabled={!backendStatus || backendStatus.status === 'offline'}
                            className={`px-4 py-2 font-bold text-sm rounded-xl text-white transition-all flex items-center gap-2 disabled:opacity-50 ${backendStatus?.cronActive ? 'bg-slate-800 dark:bg-slate-700 hover:bg-slate-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                        >
                            {backendStatus?.cronActive ? <><Square className="w-4 h-4" fill="currentColor" /> Pause Worker</> : <><Play className="w-4 h-4" fill="currentColor" /> Start Worker</>}
                        </button>
                    </div>
                </div>

                {/* Import Result Banner */}
                {importResult && (
                    <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span className="text-emerald-700 dark:text-emerald-300 font-bold">
                            ✅ Import complete — {importResult.driversProcessed} drivers pulled from ELD, {importResult.firestoreWrites} records written to Firestore.
                        </span>
                        <button onClick={() => setImportResult(null)} className="ml-auto text-emerald-500 hover:text-emerald-700 text-xs font-bold">Dismiss</button>
                    </div>
                )}
            </div>
            </div>
        </div>
    );
};
