
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Driver, DutyStatus, ELDStatus, FollowUpStatus, EmailLogEntry, GoogleUser, AuthUser, DriverReply } from './types';
import { INITIAL_DRIVERS } from './constants';
import { DriverTable } from './components/DriverTable';
import { StatsCard } from './components/StatsCard';
import { DatabaseSyncControl } from './components/DatabaseSyncControl';
import { Login } from './components/Login';
import { DriverReplies } from './components/DriverReplies';
import { AIAssistant } from './components/AIAssistant';
import { ProfileForm } from './components/ProfileForm';
import { Dashboard } from './components/Dashboard';
import { CustomEmail } from './components/CustomEmail';
import { EmailBroadcast } from './components/EmailBroadcast';
import { AdminPanel } from './components/AdminPanel';
import { generateComplianceEmail, generateDriverReply } from './services/geminiService';
import {
  initializeUserDatabase,
  fetchUserProfile,
  subscribeToDrivers,
  subscribeToEmailLogs,
  subscribeToDriverReplies,
  updateDriver as updateDriverInSupabase,
  deleteDriver as deleteDriverFromSupabase,
  addEmailLog
} from './services/supabaseService';
import { sendGmailMessage, fetchGmailReplies } from './services/gmailService';
import { Sidebar } from './components/Sidebar';
import { AnimatedText } from './components/ui/animated-text';
import { HeroBackground } from './components/ui/shape-landing-hero';
import { supabase } from './supabase';

const STORAGE_KEYS = {
  drivers: 'app_drivers',
  emailLogs: 'app_email_logs',
  driverReplies: 'app_driver_replies',
  liveMode: 'app_live_mode'
};

const readJsonStorage = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`[STORAGE] Invalid JSON in key "${key}". Resetting to fallback.`, error);
    localStorage.removeItem(key);
    return fallback;
  }
};

const buildFollowUpEmail = (driverName: string) => {
  const subject = `ELD Disconnected - Action Required`;
  const body =
    `Hi ${driverName},\n\n` +
    `Your ELD is showing as DISCONNECTED.\n` +
    `Please open the ELD app and reconnect as soon as possible.\n\n` +
    `If you need help, reply to this message.\n\n` +
    `Thanks.`;
  return { subject, body };
};
import {
  ArrowLeftRight,
  CheckCircle2,
  MessageSquare,
  TrendingUp,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Menu,
  Moon,
  Sun,
  ShieldCheck,
  AlertTriangle,
  RefreshCcw,
  User,
  LogIn,
  LogOut,
  Zap,
  RefreshCw,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGoogleLogin } from '@react-oauth/google';

const BrandLogo = ({ open, onToggle, theme, onToggleTheme }: { open: boolean, onToggle: () => void, theme: 'light' | 'dark', onToggleTheme: () => void }) => (
  <div className="flex items-center justify-between gap-3 mb-8 px-2 relative">
    <div className="flex items-center gap-3 overflow-hidden">
      <div className="relative flex items-center justify-center w-10 h-10 shrink-0">
        <div className="absolute inset-0 rounded-full border-[1.5px] border-purple-400 opacity-60"></div>
        <div className="absolute inset-1 rounded-full border-[1px] border-purple-500 opacity-40 animate-pulse"></div>
        <svg viewBox="0 0 100 100" className="w-6 h-6 z-10">
          <defs>
            <linearGradient id="logoGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#a855f7', stopOpacity: 1 }} />
              <stop offset="100%" style={{ stopColor: '#6b21a8', stopOpacity: 1 }} />
            </linearGradient>
          </defs>
          <path
            d="M35 25 L35 75 L75 75 L75 62 L48 62 L48 25 Z"
            fill="url(#logoGrad)"
            stroke="none"
          />
        </svg>
      </div>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="whitespace-nowrap"
        >
          <h1 className="text-xl font-bold tracking-tight text-white leading-none">Leader A1</h1>
          <p className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Fleet Monitor</p>
        </motion.div>
      )}
    </div>

    <div className="flex items-center gap-1">
      <button
        onClick={onToggleTheme}
        className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all border border-transparent hover:border-slate-700"
        title={theme === 'light' ? "Night Mode" : "Day Mode"}
      >
        {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-yellow-400" />}
      </button>
      <button
        onClick={onToggle}
        className="hidden md:flex p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all border border-transparent hover:border-slate-700"
        title={open ? "Collapse Sidebar" : "Expand Sidebar"}
      >
        {open ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
      </button>
    </div>
  </div>
);

const App: React.FC = () => {
  const [drivers, setDrivers] = useState<Driver[]>(() => readJsonStorage(STORAGE_KEYS.drivers, INITIAL_DRIVERS));
  const [emailLogs, setEmailLogs] = useState<EmailLogEntry[]>(() => readJsonStorage(STORAGE_KEYS.emailLogs, []));
  const [driverReplies, setDriverReplies] = useState<DriverReply[]>(() => readJsonStorage(STORAGE_KEYS.driverReplies, []));
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isResetting, setIsResetting] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('app-theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [eldFilter, setEldFilter] = useState<ELDStatus | 'ALL'>('ALL');
  const [dutyFilter, setDutyFilter] = useState<DutyStatus | 'ALL'>('ALL');
  const [companyFilter, setCompanyFilter] = useState<string | 'ALL'>('ALL');
  const [boardFilter, setBoardFilter] = useState<string | 'ALL'>(() => {
    // On initial load, respect the stored authUser's assigned board if present.
    const parsed = readJsonStorage<AuthUser | null>('auth_user', null);
    if (parsed?.assignedBoard) return parsed.assignedBoard;
    return 'ALL';
  });

  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    return readJsonStorage<AuthUser | null>('auth_user', null);
  });


  const [user, setUser] = useState<GoogleUser | null>(() => {
    const parsed = readJsonStorage<GoogleUser | null>('google_user', null);
    if (!parsed) return null;
    if (Date.now() > parsed.expiry) return null;
    return parsed;
  });

  // Database and sync state
  const [isLiveMode, setIsLiveMode] = useState<boolean>(() => {
    return readJsonStorage(STORAGE_KEYS.liveMode, false);
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | undefined>();
  const [dbConnected, setDbConnected] = useState(false);
  const activeUserId = authUser?.uid;
  const googleClientId = ((window as any).__GOOGLE_CLIENT_ID__ || '').trim();
  const isAdminUser = authUser?.role === 'admin' || authUser?.email === 'westa@algogroup.us';
  const driverOwnerUserId = authUser?.role === 'employee' && authUser?.adminId
    ? authUser.adminId
    : activeUserId;
  const rawApiBaseUrl = ((import.meta as any).env.VITE_API_URL || '').trim();
  const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '');
  const apiUrl = (path: string) => apiBaseUrl ? `${apiBaseUrl}${path}` : path;

  // Persist theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  // Persist authUser so board restrictions survive page reloads
  useEffect(() => {
    if (authUser) {
      localStorage.setItem('auth_user', JSON.stringify(authUser));
    } else {
      localStorage.removeItem('auth_user');
    }
  }, [authUser]);

  // Persist Google OAuth session to survive refresh
  useEffect(() => {
    if (user) {
      localStorage.setItem('google_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('google_user');
    }
  }, [user]);

  useEffect(() => {
    const syncAuthUser = async () => {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user;

      if (!sessionUser) {
        setAuthUser(null);
        return;
      }

      setAuthUser(prev => ({
        ...prev,
        uid: sessionUser.id,
        email: sessionUser.email || prev?.email || '',
        name: (sessionUser.user_metadata?.full_name as string) || prev?.name || sessionUser.email?.split('@')[0] || 'User'
      }));
    };

    syncAuthUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user;
      if (!sessionUser) {
        setAuthUser(null);
        return;
      }

      setAuthUser(prev => ({
        ...prev,
        uid: sessionUser.id,
        email: sessionUser.email || prev?.email || '',
        name: (sessionUser.user_metadata?.full_name as string) || prev?.name || sessionUser.email?.split('@')[0] || 'User'
      }));
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  // Persist drivers and logs to localStorage on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.drivers, JSON.stringify(drivers));
  }, [drivers]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.emailLogs, JSON.stringify(emailLogs));
  }, [emailLogs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.driverReplies, JSON.stringify(driverReplies));
  }, [driverReplies]);

  // Persist live mode setting
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.liveMode, JSON.stringify(isLiveMode));
  }, [isLiveMode]);

  // Initialize user profile and set up Supabase listeners
  useEffect(() => {
    if (!activeUserId) {
      setDbConnected(false);
      return;
    }

    const setupDatabase = async () => {
      try {
        const activeEmail = user?.email || authUser?.email || '';
        const activeName = user?.name || authUser?.name || '';
        await initializeUserDatabase(activeUserId, activeEmail, activeName);
        const profile = await fetchUserProfile(activeUserId);

        if (profile) {
          setAuthUser(prev => prev ? {
            ...prev,
            role: profile.role || prev.role,
            adminId: profile.admin_id || prev.adminId,
            assignedBoards: profile.assigned_boards || prev.assignedBoards,
            assignedBoard: profile.assigned_boards?.[0] || prev.assignedBoard,
            assignedCompanies: profile.assigned_companies || prev.assignedCompanies,
            name: profile.name || prev.name,
            email: profile.email || prev.email
          } : prev);
        }

        setDbConnected(true);
        console.log('Database connected for user:', activeEmail);
      } catch (err) {
        console.error('Database initialization error:', err);
        setDbConnected(false);
      }
    };

    setupDatabase();

    const unsubDrivers = subscribeToDrivers(driverOwnerUserId || activeUserId, (driversSnapshot) => {
      setDrivers(driversSnapshot);
      setLastSync(new Date().toISOString());
    });

    const unsubLogs = subscribeToEmailLogs(activeUserId, (emailLogSnapshot) => {
      setEmailLogs(emailLogSnapshot);
    });

    const unsubReplies = subscribeToDriverReplies(activeUserId, (driverReplySnapshot) => {
      setDriverReplies(driverReplySnapshot);
    });

    return () => {
      unsubDrivers();
      unsubLogs();
      unsubReplies();
    };
  }, [activeUserId, driverOwnerUserId, authUser?.email, authUser?.name, user?.accessToken, user?.email, user?.name]);

  // DEBUG CLI: Access via Browser Console
  useEffect(() => {
    (window as any).debug_env = () => {
      const clientId = (window as any).__GOOGLE_CLIENT_ID__;
      alert(
        `--- APP DEBUG ---\n` +
        `ID: ${clientId ? 'Valid' : 'MISSING'}\n` +
        `Origin: ${window.location.origin}\n` +
        `Live: ${isLiveMode ? 'ON' : 'OFF'}\n` +
        `DB: ${dbConnected ? 'Connected' : 'Disconnected'}`
      );
    };
  }, [isLiveMode, dbConnected]);

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const data = await res.json();

        const googleUser = {
          email: data.email,
          name: data.name,
          picture: data.picture,
          accessToken: tokenResponse.access_token,
          expiry: Date.now() + 3500 * 1000
        };

        setUser(googleUser);
        setAuthUser(prev => ({ ...prev, email: data.email, name: data.name, picture: data.picture }));
        setIsLiveMode(true);
        alert("Success: Google API Connected and Live Mode Enabled!");
      } catch (error) {
        console.error("Failed to fetch user info", error);
        alert("Error fetching user info: " + (error instanceof Error ? error.message : "Unknown error"));
      }
    },
    onError: (error) => {
      console.error("Google Login Failed", error);
      alert("Google Login Failed: Check Console Origins.");
    },
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/gmail.send',
  });

  const handleLogout = () => {
    setAuthUser(null);
    setUser(null);
    supabase.auth.signOut().catch((error) => console.error('Sign-out failed:', error));
    setBoardFilter('ALL');
    setCompanyFilter('ALL');
    setEldFilter('ALL');
    setDutyFilter('ALL');
    setSearchQuery('');
    setIsLiveMode(false);
    localStorage.removeItem('auth_user');
    localStorage.removeItem('google_user');
    localStorage.removeItem(STORAGE_KEYS.drivers);
    localStorage.removeItem(STORAGE_KEYS.emailLogs);
    localStorage.removeItem(STORAGE_KEYS.driverReplies);
    localStorage.removeItem(STORAGE_KEYS.liveMode);
  };

  const filteredDrivers = useMemo(() => {
    return drivers.filter(driver => {
      const matchesName = driver.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesEld = eldFilter === 'ALL' || driver.eldStatus === eldFilter;
      const matchesDuty = dutyFilter === 'ALL' || driver.dutyStatus === dutyFilter;
      const matchesCompany = companyFilter === 'ALL' || driver.company === companyFilter;
      
      const allowedBoards = authUser?.assignedBoards || (authUser?.assignedBoard ? [authUser.assignedBoard] : []);
      const allowedCompanies = authUser?.assignedCompanies || [];
      const matchesBoard = allowedBoards.length > 0
        ? allowedBoards.includes(driver.board)
        : (boardFilter === 'ALL' || driver.board === boardFilter);
      const matchesAssignedCompany = allowedCompanies.length > 0
        ? allowedCompanies.includes(driver.company)
        : true;

      return matchesName && matchesEld && matchesDuty && matchesCompany && matchesBoard && matchesAssignedCompany;
    });
  }, [drivers, searchQuery, eldFilter, dutyFilter, companyFilter, boardFilter, authUser]);

  const stats = useMemo(() => {
    const violations = filteredDrivers.filter(d => d.eldStatus === ELDStatus.DISCONNECTED && [DutyStatus.DRIVING, DutyStatus.ON_DUTY].includes(d.dutyStatus)).length;
    return {
      total: filteredDrivers.length,
      violations,
      alertsSent: emailLogs.filter(log => filteredDrivers.some(d => d.id === log.driverId)).length,
      unreadReplies: driverReplies.filter(r => !r.isRead && filteredDrivers.some(d => d.id === r.driverId)).length
    };
  }, [filteredDrivers, emailLogs, driverReplies]);

  const processAlertLogic = useCallback(async (driver: Driver) => {
    const isDisconnected = driver.eldStatus === ELDStatus.DISCONNECTED;
    const isAtWork = [DutyStatus.DRIVING, DutyStatus.ON_DUTY, DutyStatus.OFF_DUTY, DutyStatus.SLEEPER].includes(driver.dutyStatus);

    if (isDisconnected && isAtWork && !driver.emailSent && !driver.hasPendingAlert) {
      if (driver.lastEmailTime) {
        const lastSent = new Date(driver.lastEmailTime).getTime();
        const now = new Date().getTime();
        if (now - lastSent < 60 * 60 * 1000) return;
      }
      setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, hasPendingAlert: true } : d));
    } else if (!isDisconnected && driver.hasPendingAlert) {
      setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, hasPendingAlert: false } : d));
    } else if (!isDisconnected && driver.emailSent) {
      setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, emailSent: false } : d));
    }
  }, []);

  const handleManualSendEmail = async (driverId: string): Promise<{ sentAt: string }> => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) throw new Error('Driver not found');

    if (driver.lastEmailTime) {
      const lastSent = new Date(driver.lastEmailTime).getTime();
      const now = new Date().getTime();
      const oneHour = 60 * 60 * 1000;
      if (now - lastSent < oneHour) {
        throw new Error("Spam protection active. Wait before sending again.");
      }
    }

    const { subject, body } = buildFollowUpEmail(driver.name);
    let sentSuccess = true;
    let sentVia: 'Simulation' | 'Gmail API' = 'Simulation';

    console.log(`Email Sending Mode: ${isLiveMode ? 'LIVE' : 'SIMULATION'}`);

    if (isLiveMode && user?.accessToken && user.accessToken !== 'demo_token') {
      console.log("Triggering Gmail API message to:", driver.email);
      const res = await sendGmailMessage(user.accessToken, driver.email, subject, body);
      sentSuccess = res.ok;
      sentVia = 'Gmail API';
      if (!sentSuccess) throw new Error(res.error || "Gmail API failed to send message.");
    } else {
      console.log("Simulation mode: No real email sent.");
      alert("Note: App is in SIMULATION MODE. No real email was sent. Connect your Google account or toggle Live Mode ON in the Database panel.");
    }

    const sentAt = new Date().toISOString();

    const logEntry: EmailLogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      driverId: driver.id,
      driverName: driver.name,
      timestamp: sentAt,
      statusAtTime: driver.dutyStatus,
      content: body,
      sentVia
    };

    const updatedDriver = {
      ...driver,
      emailSent: true,
      hasPendingAlert: false,
      followUp: FollowUpStatus.ACTION_REQUIRED,
      lastEmailTime: sentAt,
      lastSentAt: sentAt
    };

    setDrivers(prev => prev.map(d => d.id === driver.id ? updatedDriver : d));
    setEmailLogs(prev => [logEntry, ...prev]);

    // Persist to Supabase
    if (activeUserId) {
      await updateDriverInSupabase(activeUserId, driver.id, updatedDriver);
      await addEmailLog(activeUserId, logEntry);
    }

    return { sentAt };
  };

  const handleProfileFormReminder = async (driverId: string, days: 3 | 5) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) throw new Error('Driver not found');

    const subject = `Profile Form Update Required - ${days} Days Pending`;
    const body =
      `Hi ${driver.name},\n\n` +
      `This is a reminder that your profile form has not been updated for ${days} days.\n` +
      `Please log in to the portal and update your profile form as soon as possible.\n\n` +
      `Thank you.`;

    let sentSuccess = true;
    let sentVia: 'Simulation' | 'Gmail API' = 'Simulation';

    if (isLiveMode && user?.accessToken && user.accessToken !== 'demo_token') {
      const res = await sendGmailMessage(user.accessToken, driver.email, subject, body);
      sentSuccess = res.ok;
      sentVia = 'Gmail API';
      if (!sentSuccess) throw new Error(res.error || "Gmail API failed to send message.");
    } else {
      alert("Note: App is in SIMULATION MODE. No real email was sent. Toggle Live Mode ON.");
    }

    const sentAt = new Date().toISOString();

    // Update Driver State explicitly with particular email 
    const updatePayload: Partial<Driver> = {
      lastProfileReminderAt: sentAt
    };
    if (days === 3) updatePayload.last3DayEmail = sentAt;
    if (days === 5) updatePayload.last5DayEmail = sentAt;

    const updatedDriver = { ...driver, ...updatePayload };
    setDrivers(prev => prev.map(d => d.id === driver.id ? updatedDriver : d));

    // Add logs
    const logEntry: EmailLogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      driverId: driver.id,
      driverName: driver.name,
      timestamp: sentAt,
      statusAtTime: driver.dutyStatus || DutyStatus.NOT_SET,
      content: body,
      sentVia
    };

    setEmailLogs(prev => [logEntry, ...prev]);

    if (activeUserId) {
      await updateDriverInSupabase(activeUserId, driver.id, updatePayload);
      await addEmailLog(activeUserId, logEntry);
    }
  };

  const handleUpdatePFDate = async (driverId: string, dateStr: string) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) return;

    const updatePayload = { lastPFUpdate: dateStr };
    setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, ...updatePayload } : d));

    if (activeUserId) {
      await updateDriverInSupabase(activeUserId, driverId, updatePayload);
    }
  };

  const handleCustomEmail = async (driverId: string, subject: string, body: string, attachments: { name: string; type: string; base64: string }[]) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver || !driver.email) throw new Error("Driver not found or missing email.");

    let sentSuccess = false;
    let sentVia: 'Simulation' | 'Gmail API' = 'Simulation';

    if (isLiveMode && user?.accessToken && user.accessToken !== 'demo_token') {
      const res = await sendGmailMessage(user.accessToken, driver.email, subject, body, attachments);
      sentSuccess = res.ok;
      sentVia = 'Gmail API';
      if (!sentSuccess) throw new Error(res.error || "Gmail API failed to send custom email.");
    } else {
      console.log(`Simulated Email w/ ${attachments.length} attachments to ${driver.email}`);
    }

    const logEntry: EmailLogEntry = {
      id: crypto.randomUUID(),
      driverId: driver.id,
      driverName: driver.name,
      timestamp: new Date().toISOString(),
      statusAtTime: driver.dutyStatus || DutyStatus.NOT_SET,
      content: `SUBJECT: ${subject}\n\n${body}`,
      type: 'custom',
      sentVia
    };

    setEmailLogs(prev => [logEntry, ...prev]);

    if (activeUserId) {
      await addEmailLog(activeUserId, logEntry);
    }
  };

  const handleRefreshReplies = async () => {
    if (!user?.accessToken || user.accessToken === 'demo_token') return;

    try {
      const driverEmails = drivers.map(d => d.email).filter(Boolean);
      const gmailReplies = await fetchGmailReplies(user.accessToken, driverEmails);

      if (gmailReplies.length > 0) {
        setDriverReplies(prev => {
          const merged = [...prev];
          gmailReplies.forEach(reply => {
            const exists = merged.some(r => r.id === reply.id);
            if (!exists) merged.unshift(reply);
          });
          return merged;
        });
      }
    } catch (e) {
      console.error("Failed to refresh Gmail replies:", e);
    }
  };

  const handleSync = useCallback(async () => {
    // Sync Gmail Replies if in Live Mode
    if (isLiveMode) {
      await handleRefreshReplies();
    }
    setLastSync(new Date().toISOString());
  }, [isLiveMode, drivers]);

  const handleUpdateDriver = async (id: string, updates: Partial<Driver>) => {
    if (!isAdminUser) return;
    let updatedDriver: Driver | undefined;

    setDrivers(prev => {
      const newDrivers = prev.map(d => d.id === id ? { ...d, ...updates } : d);
      updatedDriver = newDrivers.find(d => d.id === id);
      return newDrivers;
    });

    // Persist to Supabase
    if (updatedDriver && activeUserId) {
      await updateDriverInSupabase(activeUserId, id, updates, driverOwnerUserId);
    }
  };

  const handleAddDriver = async (data: Omit<Driver, 'id' | 'emailSent'>) => {
    if (!activeUserId) return;
    try {
      const endpoint = apiUrl('/api/drivers/create');
      const payload = {
        acting_user_id: activeUserId,
        name: data.name,
        email: data.email,
        company: data.company,
        board: isAdminUser ? data.board : (authUser?.assignedBoard || data.board),
        deviceType: data.deviceType,
        appVersion: data.appVersion,
        eldStatus: data.eldStatus,
        dutyStatus: data.dutyStatus,
        followUp: data.followUp
      };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData?.error || `Request failed (${res.status})`);
    } catch (error: any) {
      alert(error?.message || 'Failed to create driver.');
    }
  };

  const handleDeleteDriver = async (id: string) => {
    if (!isAdminUser) return;
    setDrivers(prev => prev.filter(d => d.id !== id));

    // Persist deletion to Supabase
    if (activeUserId) {
      await deleteDriverFromSupabase(activeUserId, id, driverOwnerUserId);
    }
  };

  const handleResetDriver = (id: string) => {
    if (window.confirm("Reset this driver to Connected/Not Set?")) {
      setDrivers(prev => prev.map(d => d.id === id ? {
        ...d,
        eldStatus: ELDStatus.CONNECTED,
        dutyStatus: DutyStatus.NOT_SET,
        followUp: FollowUpStatus.NONE,
        emailSent: false,
        hasPendingAlert: false
      } : d));
    }
  };

  const handleGlobalReset = () => {
    if (window.confirm("Reset ALL drivers to Connected status?")) {
      setDrivers(prev => prev.map(d => ({
        ...d,
        eldStatus: ELDStatus.CONNECTED,
        dutyStatus: DutyStatus.NOT_SET,
        followUp: FollowUpStatus.NONE,
        emailSent: false,
        hasPendingAlert: false
      })));
    }
  };

  const toggleTheme = () => setTheme(v => v === 'light' ? 'dark' : 'light');

  if (!authUser) return (
    <Login onLogin={(u) => {
      setAuthUser(u);
      if (u.assignedBoard) {
        setBoardFilter(u.assignedBoard);
      }
    }} />
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-transparent overflow-hidden transition-colors relative">
      <div className="hidden dark:block absolute inset-0 -z-20 pointer-events-none overflow-hidden">
        <HeroBackground />
      </div>

      {authUser && (
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          isAdmin={isAdminUser}
        />
      )}
      
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="flex-none flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900/60 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/60 z-30 shadow-sm relative">
        <div className="flex items-center gap-6">
          <BrandLogo open={true} onToggle={() => {}} theme={theme} onToggleTheme={toggleTheme} />
        </div>

        <div className="flex items-center gap-4">
           {!user ? (
            <button
              onClick={handleGoogleLogin}
              disabled={!googleClientId}
              title={!googleClientId ? 'Set VITE_GOOGLE_CLIENT_ID to enable Google login' : 'Connect Google'}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-white rounded-xl font-bold text-xs hover:bg-indigo-100 transition-all shadow-sm active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <LogIn className="w-4 h-4 text-indigo-600" />
              {googleClientId ? 'Connect Google' : 'Google ID Missing'}
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <div className="hidden md:flex flex-col items-end pt-1">
                <AnimatedText text={user.name} textClassName="text-sm tracking-tight text-slate-800 dark:text-white" underlineGradient="from-indigo-400 via-purple-400 to-pink-400" underlineHeight="h-0.5" underlineOffset="-bottom-1" />
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 mt-1">
                  <CheckCircle2 className="w-3 h-3" /> API Connect
                </p>
              </div>
              {user.picture ? (
                <img src={user.picture} alt="Profile" className="w-10 h-10 rounded-full border-2 border-slate-200 dark:border-slate-700" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center border-2 border-indigo-200 dark:border-indigo-800">
                  <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
              )}
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 rounded-lg transition-colors bg-slate-100 dark:bg-slate-800/50 hover:bg-red-50 dark:hover:bg-red-900/20" title="Sign Out">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-32">
        <header className="flex items-center justify-between mb-8 pl-2">
          <div className="flex flex-col items-start gap-1">
            <AnimatedText text="Leader Control" as="h2" textClassName="text-3xl text-slate-900 dark:text-white" underlineGradient="from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400" underlineHeight="h-[3px]" underlineOffset="-bottom-2" className="items-start" />
            <p className="text-slate-500 text-sm mt-3">Welcome back, {authUser?.name || 'Guest'}</p>
          </div>
          {isAdminUser && (
            <button onClick={handleGlobalReset} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700">
              <Zap className="w-4 h-4" /> Reset All
            </button>
          )}
        </header>

        {activeTab === 'Dashboard' && <Dashboard drivers={filteredDrivers} assignedBoard={authUser?.assignedBoard} />}

        {activeTab === 'Connection' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatsCard title="Drivers" value={stats.total} icon={<ShieldCheck className="w-6 h-6 text-blue-500" />} color="bg-blue-50 dark:bg-blue-900/20" />
              <StatsCard title="Violations" value={stats.violations} icon={<AlertTriangle className="w-6 h-6 text-red-500" />} color="bg-red-50 dark:bg-red-900/20" />
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
              <DriverTable
                drivers={drivers}
                filteredDrivers={filteredDrivers}
                filters={{ searchQuery, eldFilter, dutyFilter, companyFilter, boardFilter }}
                setFilters={{ setSearchQuery, setEldFilter, setDutyFilter, setCompanyFilter, setBoardFilter }}
                onUpdateDriver={handleUpdateDriver}
                onAddDriver={handleAddDriver}
                onDeleteDriver={handleDeleteDriver}
                onManualSendEmail={handleManualSendEmail}
                onResetDriver={handleResetDriver}
                isAdmin={isAdminUser}
                fixedBoard={authUser?.assignedBoard}
              />
            </div>
          </div>
        )}

        {activeTab === 'Profile Form' && <ProfileForm drivers={drivers} emailLogs={emailLogs} onSendReminder={handleProfileFormReminder} onUpdatePFDate={handleUpdatePFDate} />}
        {activeTab === 'AI Assistant' && <AIAssistant userId={authUser?.uid} />}
        {activeTab === 'Broadcast' && <EmailBroadcast drivers={filteredDrivers} assignedBoard={authUser?.assignedBoard} userId={activeUserId} userAccessToken={user?.accessToken} />}
        {activeTab === 'History' && (
          <div className="space-y-4">
            {emailLogs.map(log => (
              <div key={log.id} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between">
                <div>
                  <p className="font-bold dark:text-white">{log.driverName}</p>
                  <p className="text-xs text-slate-500">{new Date(log.timestamp).toLocaleString()}</p>
                </div>
                <div className="text-xs text-indigo-500 font-mono">SENT VIA {log.sentVia}</div>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'Admin Panel' && <AdminPanel currentUser={authUser} />}
      </main>
     </div>
    </div>
  );
};

export default App;




