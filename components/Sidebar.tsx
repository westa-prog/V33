import React, { useMemo, useState } from 'react';
import { 
  LayoutDashboard, 
  Wifi, 
  FileText, 
  Sparkles, 
  TrendingUp, 
  Mail,
  UserPlus,
  Settings,
  LogOut,
  ChevronDown,
  ChevronRight,
  User,
  PlugZap
  ,
  MessageSquare
} from 'lucide-react';
import { motion } from 'framer-motion';
import { DatabaseSyncControl } from './DatabaseSyncControl';
import { cn } from '@/lib/utils';

export const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", id: 'Dashboard', color: "text-blue-500" },
  { icon: Wifi, label: "Connection", id: 'Connection', color: "text-green-500" },
  { icon: FileText, label: "Profile Form", id: 'Profile Form', color: "text-orange-500" },
  { icon: Sparkles, label: "AI Assistant", id: 'AI Assistant', color: "text-purple-500" },
  { icon: MessageSquare, label: "Team Chat", id: 'Team Chat', color: "text-cyan-500" },
  { icon: TrendingUp, label: "History & Activity", id: 'History', color: "text-emerald-500" },
  { icon: Mail, label: "Broadcast", id: 'Broadcast', color: "text-rose-500" },
  { icon: Settings, label: "Settings", id: 'Settings', color: "text-slate-500" },
  { icon: UserPlus, label: "Admin Panel", id: 'Admin Panel', color: "text-indigo-500", adminOnly: true }
];

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isAdmin: boolean;
  onLogout: () => void;
  googleConnected: boolean;
  googleClientIdPresent: boolean;
  onGoogleConnect: () => void;
  dbConnected: boolean;
  isSyncing: boolean;
  lastSync?: string;
  isLiveMode: boolean;
  onToggleLiveMode: (enabled: boolean) => void;
  profileName?: string;
  profilePicture?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isAdmin,
  onLogout,
  googleConnected,
  googleClientIdPresent,
  onGoogleConnect,
  dbConnected,
  isSyncing,
  lastSync,
  isLiveMode,
  onToggleLiveMode,
  profileName,
  profilePicture
}) => {
  const [showQuick, setShowQuick] = useState(true);
  const visibleMenuItems = useMemo(
    () => menuItems.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin]
  );
  const profileEmail = profileName ? `${profileName.toLowerCase().replace(/\s+/g, '.')}@algogroup.us` : 'user@algogroup.us';
  const fallbackAvatar = 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=900&auto=format&fit=crop&q=60&ixlib=M3wxMjA3fDB8MHxzZWFyY2h8Mjh8fHByb2ZpbGV8ZW58MHx8MHx8fDA%3D';
  const sidebarVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  };
  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 15,
      },
    },
  };

  return (
    <motion.aside
      className="z-40 m-3 flex h-[calc(100%-1.5rem)] w-72 flex-col rounded-3xl border border-white/50 bg-white/70 p-4 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/65 dark:text-slate-100"
      initial="hidden"
      animate="visible"
      variants={sidebarVariants}
      aria-label="App Sidebar"
    >
      <motion.div variants={itemVariants} className="flex items-center space-x-4 p-2">
        <img
          src={profilePicture || fallbackAvatar}
          alt={`${profileName || 'User'} avatar`}
          className="h-12 w-12 rounded-full object-cover ring-2 ring-white/70 dark:ring-white/10"
        />
        <div className="flex min-w-0 flex-col truncate">
          <span className="truncate text-lg font-semibold">{profileName || 'User'}</span>
          <span className="truncate text-sm text-slate-500 dark:text-slate-400">{profileEmail}</span>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="my-4 border-t border-slate-200/80 dark:border-slate-800" />

      <nav className="flex-1 space-y-1 overflow-y-auto pr-1" role="navigation">
        {visibleMenuItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <React.Fragment key={item.id}>
              {item.id === 'Settings' && <motion.div variants={itemVariants} className="h-5" />}
              <motion.button
                type="button"
                variants={itemVariants}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  'group flex w-full items-center rounded-2xl px-3 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-900/80 dark:hover:text-slate-50'
                )}
              >
                <span className={cn('mr-3 h-5 w-5', !isActive && item.color)}>
                  <Icon className="h-full w-full" />
                </span>
                <span>{item.label}</span>
                <ChevronRight className="ml-auto h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </motion.button>
              {index === visibleMenuItems.length - 2 && item.id !== 'Settings' ? null : null}
            </React.Fragment>
          );
        })}
      </nav>

      <motion.div variants={itemVariants} className="mt-4 rounded-2xl border border-slate-200/80 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/70">
        <button
          type="button"
          onClick={() => setShowQuick((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <span>Quick Controls</span>
          {showQuick ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {showQuick && (
          <div className="mt-3 space-y-3">
            <div
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold',
                googleConnected
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
              )}
            >
              <span className={cn('inline-block h-2 w-2 rounded-full', googleConnected ? 'bg-emerald-500' : 'bg-slate-400')} />
              Google {googleConnected ? 'Connected' : 'Disconnected'}
            </div>

            {!googleConnected && (
              <button
                onClick={onGoogleConnect}
                disabled={!googleClientIdPresent}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                title={!googleClientIdPresent ? 'Set VITE_GOOGLE_CLIENT_ID to enable Google login' : 'Connect Google'}
              >
                <PlugZap className="h-4 w-4" />
                {googleClientIdPresent ? 'Connect Google' : 'Google ID Missing'}
              </button>
            )}

            <DatabaseSyncControl
              isConnected={dbConnected}
              isSyncing={isSyncing}
              lastSync={lastSync}
              isLiveMode={isLiveMode}
              onToggleLiveMode={onToggleLiveMode}
            />

            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
                <User className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-slate-700 dark:text-slate-200">{profileName || 'User'}</div>
                <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">API Connect</div>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      <motion.div variants={itemVariants} className="mt-4">
        <button
          onClick={onLogout}
          className="group flex w-full items-center rounded-2xl px-3 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-300"
        >
          <span className="mr-3 h-5 w-5">
            <LogOut className="h-full w-full" />
          </span>
          <span>Log out</span>
        </button>
      </motion.div>
    </motion.aside>
  );
};
