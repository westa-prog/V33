import React from 'react';
import { 
  LayoutDashboard, 
  Wifi, 
  FileText, 
  Sparkles, 
  TrendingUp, 
  Mail,
  UserPlus
} from 'lucide-react';
import { motion } from 'framer-motion';

export const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", id: 'Dashboard', color: "text-blue-500" },
  { icon: Wifi, label: "Connection", id: 'Connection', color: "text-green-500" },
  { icon: FileText, label: "Profile Form", id: 'Profile Form', color: "text-orange-500" },
  { icon: Sparkles, label: "AI Assistant", id: 'AI Assistant', color: "text-purple-500" },
  { icon: TrendingUp, label: "History", id: 'History', color: "text-red-500" },
  { icon: Mail, label: "Broadcast", id: 'Broadcast', color: "text-rose-500" },
  { icon: UserPlus, label: "Admin Panel", id: 'Admin Panel', color: "text-indigo-500", adminOnly: true }
];

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isAdmin: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isAdmin }) => {
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
      </div>
    </div>
  );
};
