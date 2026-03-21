import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, MoreVertical, Wifi, WifiOff, FileWarning, MessageSquare, History, ChevronDown, ChevronUp, UserPlus } from 'lucide-react';
import { cn } from '../lib/utils';
import { Driver, Filters } from '../types';

type SortKey = 'company' | 'board' | null;
type SortDir = 'asc' | 'desc';

interface ComplianceLedgerProps {
    drivers: Driver[];
    filters: Filters;
    setFilters: React.Dispatch<React.SetStateAction<Filters>>;
    companies: string[];
    boards: string[];
}

export function ComplianceLedger({ drivers, filters, setFilters, companies, boards }: ComplianceLedgerProps) {
    const [sortKey, setSortKey] = useState<SortKey>(null);
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const sortedDrivers = useMemo(() => {
        let data = [...drivers];
        if (sortKey) {
            data.sort((a, b) => {
                const valA = (a[sortKey] || '').toString().toLowerCase();
                const valB = (b[sortKey] || '').toString().toLowerCase();
                
                if (valA < valB) return sortDir === 'asc' ? -1 : 1;
                if (valA > valB) return sortDir === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return data;
    }, [drivers, sortKey, sortDir]);

    const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => {
        if (!active) return <ChevronDown size={14} className="text-muted-foreground/30 ml-1" />;
        return dir === 'asc' 
            ? <ChevronUp size={14} className="text-primary ml-1" />
            : <ChevronDown size={14} className="text-primary ml-1" />;
    };

    return (
        <div className="space-y-4">
            {/* Escalation Banner */}
            <div className="bg-blue-950/50 border border-blue-900/50 rounded-lg p-2 text-xs font-semibold text-blue-400 flex items-center gap-2">
                 <MoreVertical size={14} className="rotate-90" />
                 ESCALATION SORTING: OLDEST ALERTS PRIORITIZED AT TOP
            </div>

            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-foreground">
                        <div className="p-1 bg-primary/10 rounded-lg">
                             <MessageSquare className="h-4 w-4 text-primary" />
                        </div>
                        <h2 className="text-sm font-semibold">Compliance Ledger (Updated)</h2>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-3">
                        <button className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-md text-sm font-medium transition-colors shrink-0">
                            <UserPlus size={16} />
                            Add Driver
                        </button>
                        
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search by driver name..."
                                value={filters.search}
                                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                                className="pl-9 pr-4 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-full"
                            />
                        </div>

                        <div className="flex items-center justify-center px-1 text-muted-foreground">
                            <Filter size={16} />
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                             <div className="relative">
                                <select 
                                    className="appearance-none pl-3 pr-8 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer min-w-[140px]"
                                    value={filters.company}
                                    onChange={(e) => setFilters(prev => ({ ...prev, company: e.target.value }))}
                                >
                                    <option value="all">All Companies</option>
                                    {companies.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                             </div>

                             <div className="relative">
                                <select 
                                    className="appearance-none pl-3 pr-8 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer min-w-[120px]"
                                    value={filters.board}
                                    onChange={(e) => setFilters(prev => ({ ...prev, board: e.target.value }))}
                                >
                                    <option value="all">All Boards</option>
                                    {boards.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                             </div>

                             <div className="relative">
                                <select 
                                    className="appearance-none pl-3 pr-8 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer min-w-[140px]"
                                    value={filters.status}
                                    onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as Driver['status'] | 'all' }))}
                                >
                                    <option value="all">All Connections</option>
                                    <option value="connected">Connected</option>
                                    <option value="disconnected">Disconnected</option>
                                    <option value="warning">Warning</option>
                                </select>
                                <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                             </div>

                             <div className="relative">
                                <select 
                                    className="appearance-none pl-3 pr-8 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer min-w-[140px]"
                                    value={filters.dutyStatus}
                                    onChange={(e) => setFilters(prev => ({ ...prev, dutyStatus: e.target.value as Driver['dutyStatus'] | 'all' }))}
                                >
                                    <option value="all">All Duty Status</option>
                                    <option value="Driving">Driving</option>
                                    <option value="On Duty">On Duty</option>
                                    <option value="Off Duty">Off Duty</option>
                                    <option value="Sleeper">Sleeper</option>
                                </select>
                                <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                             </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground font-medium border-b border-border text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-4 py-3 w-8">
                                    <input type="checkbox" className="rounded border-gray-400" />
                                </th>
                                <th className="px-4 py-3">Driver Info</th>
                                <th 
                                    className="px-4 py-3 cursor-pointer hover:bg-muted/80 transition-colors select-none group"
                                    onClick={() => handleSort('company')}
                                >
                                    <div className="flex items-center">
                                        Company
                                        <SortIcon active={sortKey === 'company'} dir={sortDir} />
                                    </div>
                                </th>
                                <th 
                                    className="px-4 py-3 cursor-pointer hover:bg-muted/80 transition-colors select-none group"
                                    onClick={() => handleSort('board')}
                                >
                                    <div className="flex items-center">
                                        Board
                                        <SortIcon active={sortKey === 'board'} dir={sortDir} />
                                    </div>
                                </th>
                                <th className="px-4 py-3">Leader ELD</th>
                                <th className="px-4 py-3">Duty Status</th>
                                <th className="px-4 py-3">Connection</th>
                                <th className="px-4 py-3 text-center">Follow Up</th>
                                <th className="px-4 py-3 text-center">Alert History</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {sortedDrivers.map((driver) => (
                                <motion.tr
                                    key={driver.id}
                                    layout
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="hover:bg-muted/30 transition-colors group"
                                >
                                    <td className="px-4 py-3">
                                        <input type="checkbox" className="rounded border-gray-400" />
                                    </td>
                                    <td className="px-4 py-3 font-medium text-foreground">
                                        {driver.name}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {driver.company}
                                    </td>
                                    <td className="px-4 py-3 text-muted-foreground">
                                        {driver.board}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs">
                                        {driver.truckId}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={cn(
                                            "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                                            driver.dutyStatus === 'Driving' && "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400",
                                            driver.dutyStatus === 'On Duty' && "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
                                            (driver.dutyStatus === 'Off Duty' || driver.dutyStatus === 'Sleeper') && "bg-gray-100 text-gray-700 dark:bg-gray-500/10 dark:text-gray-400",
                                        )}>
                                            {driver.dutyStatus}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className={cn(
                                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
                                            driver.status === 'connected' && "bg-green-500/10 text-green-500 border-green-500/20",
                                            driver.status === 'disconnected' && "bg-destructive/10 text-destructive border-destructive/20",
                                            driver.status === 'warning' && "bg-orange-500/10 text-orange-500 border-orange-500/20",
                                        )}>
                                            {driver.status === 'connected' && <Wifi size={10} />}
                                            {driver.status === 'disconnected' && <WifiOff size={10} />}
                                            {driver.status === 'warning' && <FileWarning size={10} />}
                                            <span className="capitalize">{driver.status}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <button className="p-1.5 hover:bg-primary/10 text-primary rounded-md transition-colors">
                                            <MessageSquare size={16} />
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <button className="p-1.5 hover:bg-accent text-muted-foreground hover:text-foreground rounded-md transition-colors relative">
                                            <History size={16} />
                                            {driver.violations > 0 && (
                                                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-destructive rounded-full border-2 border-card flex items-center justify-center text-[8px] text-white">
                                                    {driver.violations}
                                                </span>
                                            )}
                                        </button>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Showing {sortedDrivers.length} of {drivers.length} drivers</span>
                    <div className="flex gap-2">
                        <button className="px-2 py-1 rounded hover:bg-accent disabled:opacity-50" disabled>Previous</button>
                        <button className="px-2 py-1 rounded hover:bg-accent">Next</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
