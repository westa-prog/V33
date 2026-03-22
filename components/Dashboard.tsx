import React, { useEffect, useMemo, useState } from 'react';
import { Driver, ELDStatus } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Mail, RefreshCw, Server } from 'lucide-react';
import axios from 'axios';
import { HorizonHeroSection } from './ui/horizon-hero-section';

interface DashboardProps {
    drivers: Driver[];
    assignedBoard?: string;
    employeeName?: string;
}

export const Dashboard: React.FC<DashboardProps> = ({ drivers, assignedBoard, employeeName }) => {
    const rawApiBaseUrl = ((import.meta as any).env.VITE_API_URL || '').trim();
    const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '');
    const isBrowser = typeof window !== 'undefined';
    const isLocalHost = isBrowser && ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const hasLocalApiOverride = /localhost|127\.0\.0\.1/i.test(apiBaseUrl);
    const effectiveApiBaseUrl = !isLocalHost && hasLocalApiOverride ? '' : apiBaseUrl;
    const apiUrl = (path: string) => effectiveApiBaseUrl ? `${effectiveApiBaseUrl}${path}` : path;

    const [boardFilter, setBoardFilter] = useState<string | 'ALL'>('ALL');
    const [backendStatus, setBackendStatus] = useState<{
        status: string;
        emailConfigured: boolean;
        emailMode?: 'smtp' | 'resend' | 'smtp+resend' | 'simulation';
        smtpConfigured?: boolean;
        resendConfigured?: boolean;
        uploadsEnabled: boolean;
    } | null>(null);
    const [statusLoading, setStatusLoading] = useState(false);

    const boards = Array.from(new Set(drivers.map((d) => d.board).filter(Boolean)));

    const filteredDrivers = useMemo(() => {
        if (assignedBoard) return drivers;
        if (boardFilter === 'ALL') return drivers;
        return drivers.filter((d) => d.board === boardFilter);
    }, [drivers, boardFilter, assignedBoard]);

    const totalDrivers = filteredDrivers.length;
    const activeDrivers = filteredDrivers.filter((d) => d.eldStatus === ELDStatus.CONNECTED).length;
    const inactiveDrivers = filteredDrivers.filter((d) => d.eldStatus === ELDStatus.DISCONNECTED).length;
    const boardViolations = filteredDrivers.filter(
        (d) => d.eldStatus === ELDStatus.DISCONNECTED && ['Driving', 'On Duty'].includes(d.dutyStatus || '')
    ).length;
    const motivationalCopy = [
        'Small improvements compound into reliable operations.',
        'Consistency beats intensity in fleet performance.',
        'Clear updates keep your board moving.'
    ];

    const connectionStats = useMemo(() => {
        return [
            { name: 'Connected', value: activeDrivers },
            { name: 'Disconnected', value: inactiveDrivers }
        ].filter((stat) => stat.value > 0);
    }, [activeDrivers, inactiveDrivers]);

    const dutyStats = useMemo(() => {
        const counts = filteredDrivers.reduce((acc, driver) => {
            const status = driver.dutyStatus || 'Not Set';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return Object.entries(counts).map(([name, Total]) => ({ name, Total }));
    }, [filteredDrivers]);

    const checkBackend = async () => {
        setStatusLoading(true);
        try {
            const res = await axios.get(apiUrl('/api/status'));
            setBackendStatus(res.data);
        } catch {
            setBackendStatus({ status: 'offline', emailConfigured: false, uploadsEnabled: false });
        } finally {
            setStatusLoading(false);
        }
    };

    useEffect(() => {
        const runCheck = async () => {
            try {
                await checkBackend();
            } catch {
                // handled in checkBackend
            }
        };

        runCheck();
        const interval = setInterval(runCheck, 15000);
        return () => clearInterval(interval);
    }, [effectiveApiBaseUrl]);

    const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa'];

    return (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
            {assignedBoard && employeeName && (
                <section className="space-y-6">
                    <HorizonHeroSection
                        title={employeeName}
                        boardName={assignedBoard}
                        subtitleLines={[
                            `Welcome back, ${employeeName}. Your work is shaping ${assignedBoard} right now.`,
                            `Stay focused, keep updates clean, and scroll forward into the live tools for your assigned board.`
                        ]}
                        stats={[
                            { label: 'Assigned Board', value: assignedBoard },
                            { label: 'Drivers', value: filteredDrivers.length },
                            { label: 'Connected', value: activeDrivers, tone: 'success' },
                            { label: 'Attention Needed', value: boardViolations, tone: 'warning' }
                        ]}
                        appraisals={motivationalCopy}
                    />
                </section>
            )}

            <div className="flex justify-between items-center bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Connection Dashboard</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Fleet overview plus backend readiness for messaging and admin tools.</p>
                </div>
                <div className="flex items-center gap-4">
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
                            {boards.map((b) => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            <div className="mx-auto max-w-full">
                <div className="grid grid-cols-1 gap-6 mt-6">
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
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

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-6">
                            <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center relative overflow-hidden group">
                                <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">Inactive Drivers</h3>
                                <div className="text-5xl font-black text-slate-800 dark:text-white mb-2">{inactiveDrivers}</div>
                            </div>
                            <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center relative overflow-hidden group">
                                <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">Active Drivers</h3>
                                <div className="text-5xl font-black text-slate-800 dark:text-white mb-2">{activeDrivers}</div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 min-h-[300px] flex flex-col">
                        <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-6">Duty Status Distribution</h3>
                        <div className="relative h-[260px] md:h-[320px] min-w-0">
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

                <div className="mt-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-6 mb-4">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Messaging Backend</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                                This service now focuses on admin account creation, email broadcasts with attachments, and other long-running messaging tasks.
                            </p>
                        </div>
                        <button
                            onClick={checkBackend}
                            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 text-sm font-bold"
                        >
                            <RefreshCw className={`w-4 h-4 ${statusLoading ? 'animate-spin' : ''}`} />
                            Refresh Card
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <Server className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">API Service</span>
                            </div>
                            <p className={`text-2xl font-black ${backendStatus?.status === 'online' ? 'text-emerald-600 dark:text-emerald-400' : statusLoading ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'}`}>
                                {statusLoading ? 'CHECKING' : backendStatus?.status === 'online' ? 'ONLINE' : 'OFFLINE'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Used by the admin panel and broadcast tools.</p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Email Transport</span>
                            </div>
                            <p className={`text-2xl font-black ${backendStatus?.emailConfigured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                {backendStatus?.emailConfigured
                                    ? backendStatus.emailMode === 'smtp+resend'
                                        ? 'SMTP + RESEND'
                                        : backendStatus.emailMode === 'resend'
                                            ? 'RESEND'
                                            : 'SMTP'
                                    : 'SIMULATION'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                                {backendStatus?.emailConfigured
                                    ? backendStatus.emailMode === 'resend'
                                        ? 'Resend is configured for live outbound email.'
                                        : backendStatus.emailMode === 'smtp+resend'
                                            ? 'SMTP is primary and Resend is available as fallback.'
                                            : 'SMTP is configured for live outbound email.'
                                    : 'No live provider is configured yet, so broadcasts stay in simulation mode.'}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <RefreshCw className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Attachments</span>
                            </div>
                            <p className={`text-2xl font-black ${backendStatus?.uploadsEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
                                {backendStatus?.uploadsEnabled ? 'ENABLED' : 'UNAVAILABLE'}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Broadcast uploads are handled by the Node backend before email delivery.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
