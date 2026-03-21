
import React, { useState, useMemo, useEffect } from 'react';
import { Driver, DutyStatus, ELDStatus, FollowUpStatus } from '../types';
import {
  Search,
  Filter,
  X,
  UserPlus,
  Save,
  Bell,
  BellOff,
  ArrowUpAZ,
  CheckCircle2,
  ShieldCheck,
  Mail,
  Trash2,
  CheckCircle,
  RefreshCcw,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DriverTableProps {
  drivers: Driver[]; // Original list for dropdowns
  filteredDrivers: Driver[]; // Already filtered list from App
  filters: {
    searchQuery: string;
    eldFilter: ELDStatus | 'ALL';
    dutyFilter: DutyStatus | 'ALL';
    companyFilter: string | 'ALL';
    boardFilter: string | 'ALL';
  };
  setFilters: {
    setSearchQuery: (v: string) => void;
    setEldFilter: (v: ELDStatus | 'ALL') => void;
    setDutyFilter: (v: DutyStatus | 'ALL') => void;
    setCompanyFilter: (v: string) => void;
    setBoardFilter: (v: string) => void;
  };
  onUpdateDriver: (id: string, updates: Partial<Driver>) => void;
  onAddDriver: (driver: Omit<Driver, 'id' | 'emailSent' | 'lastEmailTime'>) => void;
  onDeleteDriver: (id: string) => void;
  onManualSendEmail: (id: string) => Promise<{ sentAt: string }>;
  onResetDriver: (id: string) => void;
}

export const DriverTable: React.FC<DriverTableProps> = ({
  drivers,
  filteredDrivers,
  filters,
  setFilters,
  onUpdateDriver,
  onAddDriver,
  onDeleteDriver,
  onManualSendEmail,
  onResetDriver
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sendingId, setSendingId] = useState<string | null>(null);

  const handleSendFollowUp = async (driverId: string) => {
    setSendingId(driverId);
    try {
      await onManualSendEmail(driverId);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to send follow-up');
    } finally {
      setSendingId(null);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Edit Driver State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);

  // Helper for real-time relative timestamps
  const getRelativeTime = (timestamp?: string) => {
    if (!timestamp) return '';
    const now = new Date();
    const then = new Date(timestamp);
    const diffInMs = now.getTime() - then.getTime();
    const diffInMins = Math.floor(diffInMs / (1000 * 60));

    if (diffInMins < 1) return 'Just now';
    if (diffInMins < 60) return `${diffInMins}m ago`;
    const diffInHours = Math.floor(diffInMins / 60);
    return `${diffInHours}h ago`;
  };

  const openEditModal = (driver: Driver) => {
    setEditingDriver(driver);
    setIsEditModalOpen(true);
  };

  const handleEditSave = () => {
    if (!editingDriver) return;
    if (!editingDriver.name || !editingDriver.email) return; // Basic Validation

    onUpdateDriver(editingDriver.id, {
      name: editingDriver.name,
      email: editingDriver.email,
      company: editingDriver.company,
      board: editingDriver.board,
      appVersion: editingDriver.appVersion
    });
    setIsEditModalOpen(false);
  };

  // New Driver Form State
  const [newDriver, setNewDriver] = useState({
    name: '',
    email: '',
    company: '',
    board: 'Board A',
    deviceType: '',
    appVersion: '',
    eldStatus: ELDStatus.CONNECTED,
    dutyStatus: DutyStatus.NOT_SET,
    followUp: FollowUpStatus.NONE
  });

  const companies = useMemo(() => {
    const list = Array.from(new Set(drivers.map(d => d.company))).filter(Boolean);
    return list.sort();
  }, [drivers]);

  const boards = ['Board A', 'Board B', 'Board C'];

  const sortedDrivers = useMemo(() => {
    return [...filteredDrivers].sort((a, b) => {
      if (a.emailSent && !b.emailSent) return -1;
      if (!a.emailSent && b.emailSent) return 1;

      if (a.emailSent && b.emailSent && a.lastEmailTime && b.lastEmailTime) {
        const timeA = new Date(a.lastEmailTime).getTime();
        const timeB = new Date(b.lastEmailTime).getTime();
        return timeA - timeB;
      }

      return a.name.localeCompare(b.name);
    });
  }, [filteredDrivers]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedDrivers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedDrivers.map(d => d.id)));
    }
  };

  const handleBulkConnect = () => {
    selectedIds.forEach(id => {
      onUpdateDriver(id, {
        eldStatus: ELDStatus.CONNECTED,
        followUp: FollowUpStatus.NONE,
        emailSent: false
      });
    });
    setSelectedIds(new Set());
  };

  const handleBulkReminder = () => {
    selectedIds.forEach(id => {
      onUpdateDriver(id, {
        emailSent: true,
        lastEmailTime: new Date().toISOString()
      });
    });
    setSelectedIds(new Set());
  };

  const getRowColor = (driver: Driver) => {
    if (selectedIds.has(driver.id)) return 'bg-indigo-50 dark:bg-indigo-900/30';
    if (driver.eldStatus === ELDStatus.CONNECTED) return 'bg-green-50/50 dark:bg-green-900/10';
    if (driver.eldStatus === ELDStatus.DISCONNECTED && (driver.dutyStatus === DutyStatus.ON_DUTY || driver.dutyStatus === DutyStatus.DRIVING)) {
      return 'bg-red-50/80 dark:bg-red-900/20';
    }
    if (driver.emailSent) return 'bg-yellow-50/50 dark:bg-yellow-900/10';
    return 'bg-white dark:bg-slate-900';
  };

  const clearFilters = () => {
    setFilters.setSearchQuery('');
    setFilters.setEldFilter('ALL');
    setFilters.setDutyFilter('ALL');
    setFilters.setCompanyFilter('ALL');
    setFilters.setBoardFilter('ALL');
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriver.name || !newDriver.email || !newDriver.company) return;
    onAddDriver(newDriver);
    setIsModalOpen(false);
    setNewDriver({
      name: '',
      email: '',
      company: '',
      board: 'Board A',
      deviceType: '',
      appVersion: '',
      eldStatus: ELDStatus.CONNECTED,
      dutyStatus: DutyStatus.NOT_SET,
      followUp: FollowUpStatus.NONE
    });
  };

  const hasActiveFilters = filters.searchQuery !== '' || filters.eldFilter !== 'ALL' || filters.dutyFilter !== 'ALL' || filters.companyFilter !== 'ALL' || filters.boardFilter !== 'ALL';

  return (
    <div className="space-y-4 relative">
      {/* Action & Filtering Bar */}
      <div className="flex flex-wrap items-center gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 transition-colors">
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-all shadow-sm active:scale-95"
        >
          <UserPlus className="w-4 h-4" />
          Add Driver
        </button>

        <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-2 hidden md:block"></div>

        <div className="relative flex-1 min-w-[200px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search by driver name..."
            value={filters.searchQuery}
            onChange={(e) => setFilters.setSearchQuery(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filters.companyFilter}
            onChange={(e) => setFilters.setCompanyFilter(e.target.value)}
            className="text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 dark:text-slate-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm font-medium"
          >
            <option value="ALL">All Companies</option>
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={filters.boardFilter}
            onChange={(e) => setFilters.setBoardFilter(e.target.value)}
            className="text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 dark:text-slate-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm font-medium"
          >
            <option value="ALL">All Boards</option>
            {boards.map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          <select
            value={filters.eldFilter}
            onChange={(e) => setFilters.setEldFilter(e.target.value as ELDStatus | 'ALL')}
            className="text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 dark:text-slate-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm font-medium"
          >
            <option value="ALL">All Connections</option>
            <option value={ELDStatus.CONNECTED}>Connected</option>
            <option value={ELDStatus.DISCONNECTED}>Disconnected</option>
          </select>

          <select
            value={filters.dutyFilter}
            onChange={(e) => setFilters.setDutyFilter(e.target.value as DutyStatus | 'ALL')}
            className="text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 dark:text-slate-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm font-medium"
          >
            <option value="ALL">All Duty Status</option>
            {Object.values(DutyStatus).map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 px-2 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest bg-indigo-50/50 dark:bg-indigo-950/30 w-fit py-1 rounded-md">
        <ArrowUpAZ className="w-3 h-3" />
        Escalation Sorting: Oldest alerts prioritized at top
      </div>

      <div className="overflow-x-auto bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className="px-4 py-4 text-left">
                <input
                  type="checkbox"
                  checked={sortedDrivers.length > 0 && selectedIds.size === sortedDrivers.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Driver Info</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Company</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Board</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Leader ELD</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Duty Status</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Connection</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Follow Up</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Alert History</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {sortedDrivers.length > 0 ? sortedDrivers.map((driver) => (
              <tr key={driver.id} className={`${getRowColor(driver)} transition-colors duration-200`}>
                <td className="px-4 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(driver.id)}
                    onChange={() => toggleSelect(driver.id)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="h-10 w-10 flex-shrink-0 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-400 font-bold">
                      {driver.name.charAt(0)}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">{driver.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{driver.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                    {driver.company}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <select
                    value={driver.board}
                    onChange={(e) => onUpdateDriver(driver.id, { board: e.target.value })}
                    className="text-[10px] font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded uppercase border border-indigo-100 dark:border-indigo-800 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    {boards.map(b => (
                      <option key={b} value={b} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                        {b}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-900/10 px-2 py-1 rounded">
                    {driver.appVersion}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <select
                    value={driver.dutyStatus || DutyStatus.NOT_SET}
                    onChange={(e) => onUpdateDriver(driver.id, { dutyStatus: e.target.value as DutyStatus })}
                    className={`text-sm border-none bg-transparent font-medium focus:ring-2 focus:ring-indigo-500 rounded p-1 dark:text-slate-300`}
                  >
                    {Object.values(DutyStatus).map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <select
                    value={driver.eldStatus || ELDStatus.CONNECTED}
                    onChange={(e) => onUpdateDriver(driver.id, { eldStatus: e.target.value as ELDStatus })}
                    className={`text-sm rounded-lg border px-3 py-1 font-semibold ${driver.eldStatus === ELDStatus.DISCONNECTED
                      ? 'border-red-200 text-red-700 bg-red-50 dark:border-red-900 dark:text-red-400 dark:bg-red-950/30'
                      : 'border-green-200 text-green-700 bg-green-50 dark:border-green-900 dark:text-green-400 dark:bg-green-950/30'
                      }`}
                  >
                    <option value={ELDStatus.CONNECTED}>Connected</option>
                    <option value={ELDStatus.DISCONNECTED}>Disconnected</option>
                  </select>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {driver.eldStatus === ELDStatus.DISCONNECTED ? (
                    <div className="flex flex-col gap-1.5">
                      {(() => {
                        const lastSent = driver.lastSentAt ? new Date(driver.lastSentAt).getTime() : 0;
                        const cooldownMs = 60 * 60 * 1000;
                        const elapsed = currentTime.getTime() - lastSent;
                        const isCooldowned = elapsed < cooldownMs;
                        const remainingMs = cooldownMs - elapsed;

                        const formatCountdown = (ms: number) => {
                          const mins = Math.floor(ms / 60000);
                          const secs = Math.floor((ms % 60000) / 1000);
                          return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                        };

                        return (
                          <>
                            <button
                              disabled={isCooldowned || sendingId === driver.id}
                              onClick={() => handleSendFollowUp(driver.id)}
                              className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 ${isCooldowned
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-200 dark:border-slate-700'
                                : sendingId === driver.id
                                  ? 'bg-indigo-400 text-white cursor-wait'
                                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 dark:shadow-none'
                                }`}
                            >
                              {sendingId === driver.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Mail className="w-3.5 h-3.5" />
                              )}
                              {sendingId === driver.id
                                ? 'Sending...'
                                : isCooldowned
                                  ? `Available in ${formatCountdown(remainingMs)}`
                                  : 'Send Follow-Up'}
                            </button>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                              Last Sent: {driver.lastSentAt ? new Date(driver.lastSentAt).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              }) : 'Never'}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <select
                      value={driver.followUp}
                      onChange={(e) => onUpdateDriver(driver.id, { followUp: e.target.value as FollowUpStatus })}
                      className={`text-xs font-bold px-2 py-1 rounded border ${driver.followUp === FollowUpStatus.ACTION_REQUIRED
                        ? 'bg-red-600 text-white border-red-700'
                        : driver.followUp === FollowUpStatus.CONNECT
                          ? 'bg-blue-600 text-white border-blue-700'
                          : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700'
                        }`}
                    >
                      <option value={FollowUpStatus.NONE}>None</option>
                      <option value={FollowUpStatus.ACTION_REQUIRED}>Action required</option>
                      <option value={FollowUpStatus.CONNECT}>Connect</option>
                    </select>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => openEditModal(driver)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors"
                      title="Edit Driver"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onUpdateDriver(driver.id, {
                        emailSent: !driver.emailSent,
                        lastEmailTime: !driver.emailSent ? new Date().toISOString() : driver.lastEmailTime
                      })}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${driver.emailSent ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white dark:bg-slate-200 shadow ring-0 transition duration-200 ease-in-out ${driver.emailSent ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                    {driver.hasPendingAlert ? (
                      <button
                        onClick={() => onManualSendEmail(driver.id)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black rounded-full shadow-lg animate-bounce transition-all active:scale-90"
                      >
                        <Mail className="w-3 h-3" />
                        SEND ALERT
                      </button>
                    ) : driver.emailSent ? (
                      <span className="text-yellow-600 dark:text-yellow-500 font-bold text-[11px] uppercase tracking-tight flex items-center gap-1">
                        <Bell className="w-3 h-3" /> Active - {getRelativeTime(driver.lastEmailTime)}
                      </span>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600 italic text-xs flex items-center gap-1">
                        <BellOff className="w-3 h-3" /> Pending
                      </span>
                    )}

                    <button
                      onClick={() => onResetDriver(driver.id)}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-indigo-500 transition-colors"
                      title="Reset Status"
                    >
                      <RefreshCcw className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-slate-400 italic">
                  No drivers found matching your criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-slate-900 dark:bg-indigo-950 border border-slate-800 dark:border-indigo-800 rounded-full px-6 py-3 shadow-2xl flex items-center gap-6 text-white"
          >
            <div className="flex items-center gap-2 pr-6 border-r border-slate-700 dark:border-indigo-800">
              <span className="bg-indigo-600 h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold">
                {selectedIds.size}
              </span>
              <span className="text-sm font-bold whitespace-nowrap">Units Selected</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleBulkConnect}
                className="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-full text-xs font-bold transition-all active:scale-95"
              >
                <CheckCircle className="w-4 h-4" />
                Mark Connected
              </button>
              <button
                onClick={handleBulkReminder}
                className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded-full text-xs font-bold transition-all active:scale-95"
              >
                <Mail className="w-4 h-4" />
                Send Reminder
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="p-1.5 hover:bg-slate-800 dark:hover:bg-indigo-900 rounded-full text-slate-400 transition-colors"
                title="Cancel Selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Driver Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm p-4 transition-all">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all border dark:border-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Add New Driver
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newDriver.name}
                  onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })}
                  placeholder="e.g. Alexander Pierce"
                  className="w-full px-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={newDriver.email}
                  onChange={(e) => setNewDriver({ ...newDriver, email: e.target.value })}
                  placeholder="driver@company.com"
                  className="w-full px-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1">Company Name</label>
                  <input
                    type="text"
                    required
                    value={newDriver.company}
                    onChange={(e) => setNewDriver({ ...newDriver, company: e.target.value })}
                    placeholder="e.g. Alpha Logistics"
                    className="w-full px-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1">Fleet Board</label>
                  <select
                    value={newDriver.board}
                    onChange={(e) => setNewDriver({ ...newDriver, board: e.target.value })}
                    className="w-full px-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  >
                    {boards.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 rounded-lg text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save Driver
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Driver Modal */}
      {isEditModalOpen && editingDriver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm p-4 transition-all">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all border dark:border-slate-800">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowUpAZ className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Edit Driver {editingDriver.name}
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editingDriver.name}
                  onChange={(e) => setEditingDriver({ ...editingDriver, name: e.target.value })}
                  className="w-full px-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={editingDriver.email}
                  onChange={(e) => setEditingDriver({ ...editingDriver, email: e.target.value })}
                  className="w-full px-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1">Company</label>
                  <input
                    type="text"
                    required
                    value={editingDriver.company}
                    onChange={(e) => setEditingDriver({ ...editingDriver, company: e.target.value })}
                    className="w-full px-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1">Fleet Board</label>
                  <select
                    value={editingDriver.board}
                    onChange={(e) => setEditingDriver({ ...editingDriver, board: e.target.value })}
                    className="w-full px-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  >
                    {boards.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase mb-1">App Version</label>
                <input
                  type="text"
                  value={editingDriver.appVersion}
                  onChange={(e) => setEditingDriver({ ...editingDriver, appVersion: e.target.value })}
                  className="w-full px-4 py-2 text-sm border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="pt-4 flex gap-3 flex-col sm:flex-row">
                <button
                  onClick={handleEditSave}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save Changes
                </button>
                <button
                  onClick={() => {
                    if (window.confirm("Are you sure you want to delete this driver? This cannot be undone.")) {
                      onDeleteDriver(editingDriver.id);
                      setIsEditModalOpen(false);
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Driver
                </button>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 rounded-lg text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
