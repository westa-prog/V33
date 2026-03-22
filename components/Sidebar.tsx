import React, { useState } from 'react';
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
} from 'lucide-react';
import { motion } from 'framer-motion';
import { DatabaseSyncControl } from './DatabaseSyncControl';

export const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", id: 'Dashboard', color: "text-blue-500" },
  { icon: Wifi, label: "Connection", id: 'Connection', color: "text-green-500" },
  { icon: FileText, label: "Profile Form", id: 'Profile Form', color: "text-orange-500" },
  { icon: Sparkles, label: "AI Assistant", id: 'AI Assistant', color: "text-purple-500" },
  { icon: TrendingUp, label: "Activity", id: 'Activity', color: "text-emerald-500", adminOnly: true },
  { icon: TrendingUp, label: "History", id: 'History', color: "text-red-500" },
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

  return (
    <div className="w-64 h-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-r border-slate-200 dark:border-slate-800/60 flex flex-col z-40 relative">
      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-2 mt-4">
        <h3 className="px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Navigation</h3>
        {menuItems.map(item => {
          if (item.adminOnly && !isAdmin) return null;
          
          const isActive = activeTab === item.id;
          const Icon = item.icon;
          
          return (
            <button
               key={item.id}
               onClick={() => setActiveTab(item.id)}
               className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all relative overflow-hidden ${
                 isActive 
                   ? 'bg-slate-100 dark:bg-slate-800 shadow-sm' 
                   : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
               }`}
            >
              <Icon className={`w-5 h-5 ${item.color} ${isActive ? 'opacity-100' : 'opacity-70'} z-10`} />
              <span className={`font-semibold z-10 ${isActive ? 'text-slate-900 dark:text-white' : ''}`}>
                {item.label}
              </span>
              {isActive && (
                <motion.div layoutId="sidebar-active" className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-r-full z-20" />
              )}
            </button>
          )
        })}

        <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowQuick((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <span>Quick Controls</span>
            {showQuick ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {showQuick && (
            <div className="mt-3 space-y-3 px-1">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold ${
                googleConnected
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}>
                <span className={`inline-block w-2 h-2 rounded-full ${googleConnected ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                Google {googleConnected ? 'Connected' : 'Disconnected'}
              </div>

              {!googleConnected && (
                <button
                  onClick={onGoogleConnect}
                  disabled={!googleClientIdPresent}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-white text-xs font-bold border border-indigo-200 dark:border-slate-700 hover:bg-indigo-100 disabled:opacity-60 disabled:cursor-not-allowed"
                  title={!googleClientIdPresent ? 'Set VITE_GOOGLE_CLIENT_ID to enable Google login' : 'Connect Google'}
                >
                  <PlugZap className="w-4 h-4" />
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

              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                {profilePicture ? (
                  <img src={profilePicture} alt="Profile" className="w-7 h-7 rounded-full border border-slate-300 dark:border-slate-600" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                    <User className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{profileName || 'User'}</div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">API Connect</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="p-4 border-t border-slate-200 dark:border-slate-800/70">
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 font-semibold transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>
      </div>
    </div>
  );
};
