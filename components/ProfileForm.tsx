import React, { useState, useMemo } from 'react';
import { Mail, AlertTriangle } from 'lucide-react';
import { Driver, EmailLogEntry } from '../types';

interface ProfileFormProps {
    drivers: Driver[];
    emailLogs: EmailLogEntry[];
    onSendReminder: (driverId: string, days: 3 | 5) => Promise<void>;
    onUpdatePFDate: (driverId: string, dateStr: string) => Promise<void>;
}

export const ProfileForm: React.FC<ProfileFormProps> = ({ drivers, emailLogs, onSendReminder, onUpdatePFDate }) => {
    const [sendingState, setSendingState] = useState<{ id: string; days: number } | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [boardFilter, setBoardFilter] = useState<string | 'ALL'>('ALL');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'UPDATED' | 'WARNING' | 'RISK' | 'OVERDUE' | 'EMAILED'>('ALL');
    const [nameSearch, setNameSearch] = useState('');

    // Extract unique boards for the filter dropdown
    const boards = Array.from(new Set(drivers.map(d => d.board).filter(Boolean)));

    const filteredDrivers = useMemo(() => {
        let filtered = drivers;
        if (boardFilter !== 'ALL') {
            filtered = filtered.filter(driver => driver.board === boardFilter);
        }
        if (nameSearch) {
            filtered = filtered.filter(driver => driver.name.toLowerCase().includes(nameSearch.toLowerCase()));
        }
        return filtered;
    }, [drivers, boardFilter, nameSearch]);

    // Enrich drivers with calculated statuses
    const enrichedDrivers = useMemo(() => {
        const now = currentTime;
        const todayStr = now.toDateString();
        const dayStamp = (value: string | Date) => {
            const d = new Date(value);
            return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        };

        return filteredDrivers.map(driver => {
            let status: 'ok' | 'warning' | '3_day_pending' | '5_day_pending' = 'ok';
            let daysInactive = 0;
            let responseResult: 'no_email' | 'updated' | 'waiting' | 'ignored' = 'no_email';
            let latestReminderEmail: string | null = null;
            let needs3DayEmail = false;
            let needs5DayEmail = false;

            // Find the latest reminder
            if (driver.last3DayEmail || driver.last5DayEmail) {
                const t1 = driver.last3DayEmail ? new Date(driver.last3DayEmail).getTime() : 0;
                const t2 = driver.last5DayEmail ? new Date(driver.last5DayEmail).getTime() : 0;
                latestReminderEmail = new Date(Math.max(t1, t2)).toISOString();
            }

            if (driver.lastPFUpdate) {
                const lastUpdate = new Date(driver.lastPFUpdate);
                daysInactive = Math.floor((dayStamp(now) - dayStamp(lastUpdate)) / (1000 * 60 * 60 * 24));

                if (daysInactive >= 5) status = '5_day_pending';
                else if (daysInactive >= 3) status = '3_day_pending';
                else if (daysInactive === 2) status = 'warning';

                // Single-Send Cycle Logic
                needs3DayEmail = status === '3_day_pending' &&
                    (!driver.last3DayEmail || new Date(driver.last3DayEmail).getTime() < lastUpdate.getTime());

                needs5DayEmail = status === '5_day_pending' &&
                    (!driver.last5DayEmail || new Date(driver.last5DayEmail).getTime() < lastUpdate.getTime());

                if (latestReminderEmail) {
                    // Compare by date (not exact time) so setting PF date to "today"
                    // immediately resolves "Waiting" in the current cycle.
                    if (dayStamp(lastUpdate) >= dayStamp(latestReminderEmail)) {
                        responseResult = 'updated';
                    } else if (status === '5_day_pending') {
                        responseResult = 'ignored';
                    } else {
                        responseResult = 'waiting';
                    }
                }
            } else if (latestReminderEmail) {
                // No PF update but reminder was sent
                // Estimate days inactive since reminder to determine if ignored
                const reminderDate = new Date(latestReminderEmail);
                const daysSinceReminder = Math.floor((now.getTime() - reminderDate.getTime()) / (1000 * 60 * 60 * 24));
                responseResult = daysSinceReminder >= 5 ? 'ignored' : 'waiting';
            }

            const sent3DayToday = driver.last3DayEmail && new Date(driver.last3DayEmail).toDateString() === todayStr;
            const sent5DayToday = driver.last5DayEmail && new Date(driver.last5DayEmail).toDateString() === todayStr;

            return {
                ...driver,
                calculatedStatus: status,
                daysInactive,
                sent3DayToday,
                sent5DayToday,
                latestReminderEmail,
                responseResult,
                needs3DayEmail,
                needs5DayEmail
            };
        });
    }, [filteredDrivers, currentTime]);

    const stats = useMemo(() => {
        let warningPending = 0;
        let threeDayPending = 0;
        let fiveDayPending = 0;
        let driversUpdatedAfterReminder = 0;
        let driversIgnoredReminder = 0;

        enrichedDrivers.forEach(d => {
            if (d.calculatedStatus === 'warning') warningPending++;
            if (d.calculatedStatus === '3_day_pending') threeDayPending++;
            if (d.calculatedStatus === '5_day_pending') fiveDayPending++;
            if (d.responseResult === 'updated') driversUpdatedAfterReminder++;
            if (d.responseResult === 'ignored') driversIgnoredReminder++;
        });

        return {
            warning: warningPending,
            threeDay: threeDayPending,
            fiveDay: fiveDayPending,
            updatedAfterReminder: driversUpdatedAfterReminder,
            ignoredReminder: driversIgnoredReminder
        };
    }, [enrichedDrivers]);

    const finalFilteredDrivers = useMemo(() => {
        if (statusFilter === 'ALL') return enrichedDrivers;
        return enrichedDrivers.filter(driver => {
            if (statusFilter === 'UPDATED') return driver.calculatedStatus === 'ok';
            if (statusFilter === 'WARNING') return driver.calculatedStatus === 'warning';
            if (statusFilter === 'RISK') return driver.calculatedStatus === '3_day_pending';
            if (statusFilter === 'OVERDUE') return driver.calculatedStatus === '5_day_pending';
            if (statusFilter === 'EMAILED') return driver.sent3DayToday || driver.sent5DayToday;
            return true;
        });
    }, [enrichedDrivers, statusFilter]);

    React.useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const handleSend = async (driver: any, days: 3 | 5) => {
        setSendingState({ id: driver.id, days });
        try {
            await onSendReminder(driver.id, days);
        } catch (e) {
            console.error(e);
            const detail = e instanceof Error ? e.message : 'Unknown backend error';
            alert("Failed to send reminder to " + driver.name + ". " + detail);
        } finally {
            setSendingState(null);
        }
    };

    const handleBulkSend = async (days: 3 | 5) => {
        const targets = enrichedDrivers.filter(d => days === 3 ? d.needs3DayEmail : d.needs5DayEmail);

        if (targets.length === 0) {
            alert(`No drivers currently need a ${days}-day reminder.`);
            return;
        }

        if (!window.confirm(`Are you sure you want to send ${targets.length} automated ${days}-day reminders?`)) {
            return;
        }

        for (const driver of targets) {
            setSendingState({ id: driver.id, days });
            try {
                await onSendReminder(driver.id, days);
                // Optional tiny delay to prevent API hammering if list is huge
                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                console.error(`Failed to send to ${driver.name}`, e);
            }
        }
        setSendingState(null);
        alert(`Finished sending ${targets.length} reminders.`);
    };

    return (
        <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        Driver PF Monitor
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Track and manage driver profile forms automatically.</p>
                </div>
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Search drivers..."
                        value={nameSearch}
                        onChange={(e) => setNameSearch(e.target.value)}
                        className="text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 dark:text-slate-300 px-3 py-2 outline-none shadow-sm focus:ring-2 focus:ring-indigo-500"
                    />
                    <select
                        value={boardFilter}
                        onChange={(e) => setBoardFilter(e.target.value)}
                        className="text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 dark:text-slate-300 px-3 py-2 outline-none shadow-sm focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="ALL">All Boards</option>
                        {boards.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                </div>
            </div>

            {/* Dashboard Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-slate-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-slate-500/20 transition-all"></div>
                    <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Total Drivers</h3>
                    <div className="text-4xl font-black text-slate-800 dark:text-white mb-1">{filteredDrivers.length}</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-emerald-500/20 transition-all"></div>
                    <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">🟢 Updated</h3>
                    <div className="text-4xl font-black text-slate-800 dark:text-white mb-1">{filteredDrivers.length - stats.warning - stats.threeDay - stats.fiveDay}</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-yellow-500/20 transition-all"></div>
                    <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">🟡 Warning</h3>
                    <div className="text-4xl font-black text-slate-800 dark:text-white mb-1">{stats.warning}</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-orange-500/20 transition-all"></div>
                    <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">🟠 3-Day Risk</h3>
                    <div className="text-4xl font-black text-slate-800 dark:text-white mb-1">{stats.threeDay}</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-red-500/20 transition-all"></div>
                    <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">🔴 Overdue</h3>
                    <div className="text-4xl font-black text-slate-800 dark:text-white mb-1">{stats.fiveDay}</div>
                </div>
            </div>

            {/* Sub-Metrics Response Tracker */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/50 p-4 rounded-xl flex items-center justify-between">
                    <div>
                        <h4 className="text-emerald-800 dark:text-emerald-400 font-bold text-sm">🟢 Fixed After Reminder</h4>
                        <p className="text-emerald-600 dark:text-emerald-500 text-xs mt-0.5">Drivers who updated their form after you sent an email.</p>
                    </div>
                    <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 px-4">{stats.updatedAfterReminder}</div>
                </div>

                <div className="flex-1 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/50 p-4 rounded-xl flex items-center justify-between">
                    <div>
                        <h4 className="text-red-800 dark:text-red-400 font-bold text-sm">🔴 Ignored Reminder</h4>
                        <p className="text-red-600 dark:text-red-500 text-xs mt-0.5">Drivers who reached 5 days overdue despite being emailed.</p>
                    </div>
                    <div className="text-2xl font-black text-red-700 dark:text-red-400 px-4">{stats.ignoredReminder}</div>
                </div>
            </div>

            {/* Bulk Automation and Smart Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-slate-100 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setStatusFilter('ALL')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${statusFilter === 'ALL' ? 'bg-slate-800 text-white border-slate-700 dark:bg-white dark:text-slate-900 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800'}`}
                    >
                        All Drivers
                    </button>
                    <button
                        onClick={() => setStatusFilter('UPDATED')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${statusFilter === 'UPDATED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-800/50 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800'}`}
                    >
                        🟢 Updated
                    </button>
                    <button
                        onClick={() => setStatusFilter('WARNING')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${statusFilter === 'WARNING' ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-400 dark:border-yellow-800/50 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-yellow-50 hover:border-yellow-200 hover:text-yellow-700 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800'}`}
                    >
                        🟡 Warning
                    </button>
                    <button
                        onClick={() => setStatusFilter('RISK')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${statusFilter === 'RISK' ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-400 dark:border-orange-800/50 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800'}`}
                    >
                        🟠 3 Day Risk
                    </button>
                    <button
                        onClick={() => setStatusFilter('OVERDUE')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${statusFilter === 'OVERDUE' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-400 dark:border-red-800/50 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-700 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800'}`}
                    >
                        🔴 5+ Day Overdue
                    </button>
                    <button
                        onClick={() => setStatusFilter('EMAILED')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border flex items-center gap-1.5 ${statusFilter === 'EMAILED' ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-400 dark:border-indigo-800/50 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800'}`}
                    >
                        Emails Sent Today
                    </button>
                </div>

                <div className="flex flex-wrap gap-2 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-700 pt-3 md:pt-0 md:pl-4">
                    <button
                        onClick={() => handleBulkSend(3)}
                        disabled={enrichedDrivers.filter(d => d.needs3DayEmail).length === 0 || !!sendingState}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                    >
                        <Mail className="w-4 h-4" />
                        Send 3-Day Reminders ({enrichedDrivers.filter(d => d.needs3DayEmail).length})
                    </button>
                    <button
                        onClick={() => handleBulkSend(5)}
                        disabled={enrichedDrivers.filter(d => d.needs5DayEmail).length === 0 || !!sendingState}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                    >
                        <AlertTriangle className="w-4 h-4" />
                        Send 5-Day Reminders ({enrichedDrivers.filter(d => d.needs5DayEmail).length})
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                    <thead className="bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Driver Info</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Last PF Update</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Reminder Sent</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Result</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                        {finalFilteredDrivers.map(driver => (
                            <tr key={driver.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                        <div className="h-10 w-10 flex-shrink-0 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center font-bold">
                                            {driver.name.charAt(0)}
                                        </div>
                                        <div className="ml-4">
                                            <div className="text-sm font-bold text-slate-900 dark:text-white">{driver.name}</div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{driver.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <input
                                        type="date"
                                        value={driver.lastPFUpdate ? new Date(driver.lastPFUpdate).toISOString().split('T')[0] : ''}
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                onUpdatePFDate(driver.id, `${e.target.value}T12:00:00.000Z`);
                                            } else {
                                                onUpdatePFDate(driver.id, '');
                                            }
                                        }}
                                        className="text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-300"
                                    />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-400">
                                        {driver.latestReminderEmail
                                            ? new Date(driver.latestReminderEmail).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                                            : '—'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {driver.responseResult === 'updated' && <span className="text-xs font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-400 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">🟢 Fixed</span>}
                                    {driver.responseResult === 'waiting' && <span className="text-xs font-bold text-yellow-700 bg-yellow-100 dark:bg-yellow-900/40 dark:text-yellow-400 px-3 py-1 rounded-full border border-yellow-200 dark:border-yellow-800">🟡 Waiting</span>}
                                    {driver.responseResult === 'ignored' && <span className="text-xs font-bold text-red-700 bg-red-100 dark:bg-red-900/40 dark:text-red-400 px-3 py-1 rounded-full border border-red-200 dark:border-red-800">🔴 Ignored</span>}
                                    {driver.responseResult === 'no_email' && <span className="text-xs font-bold text-slate-400 px-3">—</span>}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {driver.calculatedStatus === 'ok' && <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">🟢 Updated</span>}
                                    {driver.calculatedStatus === 'warning' && <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400 flex items-center gap-1.5">🟡 Warning</span>}
                                    {driver.calculatedStatus === '3_day_pending' && <span className="text-xs font-bold text-orange-600 dark:text-orange-500 flex items-center gap-1.5">🟠 3 Day Risk</span>}
                                    {driver.calculatedStatus === '5_day_pending' && <span className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1.5">🔴 5+ Day Overdue</span>}

                                    {!driver.lastPFUpdate && <span className="ml-2 text-[10px] text-slate-400 font-bold block mt-1">Set date first</span>}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className="flex flex-col gap-2">
                                                {driver.calculatedStatus === '3_day_pending' && (
                                                    <button
                                                        disabled={!driver.needs3DayEmail || (sendingState?.id === driver.id && sendingState?.days === 3)}
                                                        onClick={() => handleSend(driver, 3)}
                                                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 ${!driver.needs3DayEmail ? 'bg-slate-100 text-slate-400 dark:bg-slate-800' : 'bg-orange-600 hover:bg-orange-700 text-white'}`}
                                                        title={!driver.needs3DayEmail ? 'Reminder already sent for this cycle' : ''}
                                                    >
                                                        {sendingState?.id === driver.id && sendingState?.days === 3 ? 'Sending...' : 'Send Reminder'}
                                                    </button>
                                                )}
                                                {driver.calculatedStatus === '5_day_pending' && (
                                                    <button
                                                        disabled={!driver.needs5DayEmail || (sendingState?.id === driver.id && sendingState?.days === 5)}
                                                        onClick={() => handleSend(driver, 5)}
                                                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 ${!driver.needs5DayEmail ? 'bg-slate-100 text-slate-400 dark:bg-slate-800' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                                                        title={!driver.needs5DayEmail ? 'Reminder already sent for this cycle' : ''}
                                                    >
                                                        {sendingState?.id === driver.id && sendingState?.days === 5 ? 'Sending...' : 'Send Reminder'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filteredDrivers.length === 0 && (
                            <tr>
                                <td colSpan={3} className="px-6 py-12 text-center text-slate-400 font-medium">
                                    No drivers found in the unified database matching criteria.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div >
    );
};
