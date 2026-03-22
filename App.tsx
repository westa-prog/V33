
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Driver, DutyStatus, ELDStatus, FollowUpStatus, EmailLogEntry, GoogleUser, AuthUser, DriverReply, EmailTemplateMap, Company } from './types';
import { INITIAL_DRIVERS } from './constants';
import { DriverTable } from './components/DriverTable';
import { StatsCard } from './components/StatsCard';
import { Login } from './components/Login';
import { DriverReplies } from './components/DriverReplies';
import { AIAssistant } from './components/AIAssistant';
import { ProfileForm } from './components/ProfileForm';
import { Dashboard } from './components/Dashboard';
import { CustomEmail } from './components/CustomEmail';
import { EmailBroadcast } from './components/EmailBroadcast';
import { AdminPanel } from './components/AdminPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { generateComplianceEmail, generateDriverReply } from './services/geminiService';
import {
  initializeUserDatabase,
  fetchDrivers,
  fetchCompanies,
  fetchUserProfile,
  subscribeToUserProfile,
  subscribeToDrivers,
  subscribeToCompanies,
  subscribeToEmailLogs,
  subscribeToDriverReplies,
  addEmailLog
} from './services/supabaseService';
import { sendGmailMessage, fetchGmailReplies } from './services/gmailService';
import { Sidebar } from './components/Sidebar';
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
const normalizeBoard = (value?: string | null): string => {
  const raw = (value || '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (upper === 'A' || upper === 'BOARD A') return 'Board A';
  if (upper === 'B' || upper === 'BOARD B') return 'Board B';
  if (upper === 'C' || upper === 'BOARD C') return 'Board C';
  return raw;
};
const normalizeBoardList = (list?: (string | null | undefined)[]): string[] => {
  if (!Array.isArray(list)) return [];
  return list.map((item) => normalizeBoard(item || '')).filter(Boolean);
};
const normalizeCompanyLabel = (value?: string | null): string => {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
};
const LEGACY_PSEUDO_EMAIL_DOMAIN = 'v33.local';
const PSEUDO_EMAIL_DOMAIN = (((import.meta as any).env.VITE_PSEUDO_EMAIL_DOMAIN || 'dilshod.algo') as string)
  .trim()
  .toLowerCase()
  .replace(/^@+/, '') || 'dilshod.algo';
const isPseudoRecipientEmail = (email?: string | null): boolean => {
  const value = String(email || '').trim().toLowerCase();
  return value.endsWith(`@${PSEUDO_EMAIL_DOMAIN}`) || value.endsWith(`@${LEGACY_PSEUDO_EMAIL_DOMAIN}`);
};
const normalizeAuthRole = (value: unknown): AuthUser['role'] => {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'admin' || role === 'employee' || role === 'user') return role;
  return undefined;
};
const renderEmailTemplate = (
  template: string,
  driver: Driver,
  extras?: {
    staleDays?: number;
    lastPfUpdateLabel?: string;
    dutyStatus?: string;
    eldConnection?: string;
    followUpRequired?: string;
    profileFormStatus?: string;
    senderName?: string;
  }
) => {
  return template
    .replace(/{{\s*driver_name\s*}}/gi, driver.name || '')
    .replace(/{{\s*driver_email\s*}}/gi, driver.email || '')
    .replace(/{{\s*company\s*}}/gi, driver.company || '')
    .replace(/{{\s*board\s*}}/gi, driver.board || '')
    .replace(/{{\s*stale_days\s*}}/gi, String(extras?.staleDays ?? ''))
    .replace(/{{\s*last_pf_update\s*}}/gi, extras?.lastPfUpdateLabel || '')
    .replace(/{{\s*duty_status\s*}}/gi, extras?.dutyStatus || String(driver.dutyStatus || 'Not Set'))
    .replace(/{{\s*eld_connection\s*}}/gi, extras?.eldConnection || String(driver.eldStatus || 'Unknown'))
    .replace(/{{\s*follow_up_required\s*}}/gi, extras?.followUpRequired || String(driver.followUp || 'None'))
    .replace(/{{\s*profile_form_status\s*}}/gi, extras?.profileFormStatus || '')
    .replace(/{{\s*sender_name\s*}}/gi, extras?.senderName || '');
};

const buildFollowUpEmail = (driverName: string, senderName: string) => {
  const subject = `ELD Disconnected - Action Required`;
  const body =
    `Hi ${driverName},\n\n` +
    `Your ELD is showing as DISCONNECTED.\n` +
    `Please open the ELD app and reconnect as soon as possible.\n\n` +
    `If you need help, reply to this message.\n\n` +
    `Sent by: ${senderName}\n\n` +
    `Thanks.`;
  return { subject, body };
};
const buildConnectionAutomationEmail = (driver: Driver, senderName: string) => {
  return {
    subject: `Automatic ELD Alert - Reconnect Required`,
    body:
      `Hello ${driver.name},\n\n` +
      `This is an automatic alert regarding your ELD (Electronic Logging Device) status.\n\n` +
      `Current Status:\n` +
      `- Driver: ${driver.name}\n` +
      `- Status: ${driver.dutyStatus || 'Not Set'}\n` +
      `- ELD Connection: ${driver.eldStatus || 'Unknown'}\n` +
      `- Follow Up Required: Reconnect\n\n` +
      `Please reconnect your ELD device at your earliest convenience. A disconnected ELD while on duty or driving is a compliance violation.\n\n` +
      `If you have any questions or need assistance, please contact ELD team immediately.\n\n` +
      `Sent by: ${senderName}\n\n` +
      `Best regards,\n` +
      `ALGO Service Team`
  };
};

const buildProfileFormReminderEmail = (driver: Driver, days: 3 | 5, senderName: string) => {
  const profileFormStatus = days === 3 ? 'Incomplete (3 Days)' : 'Incomplete (5+ Days)';
  const followUpRequired = days === 3
    ? 'Update Profile & Send Documents'
    : 'Immediate Update & Document Submission';
  const subject = days === 3
    ? 'Automatic Profile Form Reminder - 3 Days Stale'
    : 'Urgent Profile Form Alert - 5+ Days Stale';
  const body = days === 3
    ? `Hello ${driver.name},\n\n` +
      `This is an automatic reminder regarding your profile form status.\n\n` +
      `Current Status:\n` +
      `- Driver: ${driver.name}\n` +
      `- Profile Form: ${profileFormStatus}\n` +
      `- Follow Up Required: ${followUpRequired}\n\n` +
      `Your profile form has not been updated for 3 days. Keeping your information current is required for compliance.\n\n` +
      `Action Required:\n` +
      `- Please complete or update your profile form as soon as possible\n` +
      `- Send your BOL (Bill of Lading) and all shipping documents via Telegram\n\n` +
      `Do NOT reply to this email.\n` +
      `All documents must be submitted through Telegram.\n\n` +
      `If you need assistance, please contact the dispatch team.\n\n` +
      `Sent by: ${senderName}\n\n` +
      `Best regards,\n` +
      `ALGO Service Team`
    : `Hello ${driver.name},\n\n` +
      `This is an urgent automatic alert regarding your profile form status.\n\n` +
      `Current Status:\n` +
      `- Driver: ${driver.name}\n` +
      `- Profile Form: ${profileFormStatus}\n` +
      `- Follow Up Required: ${followUpRequired}\n\n` +
      `Your profile form has been incomplete for over 5 days. This is now considered critical and may affect your ability to receive loads.\n\n` +
      `Immediate Action Required:\n` +
      `- Complete your profile form today\n` +
      `- Send your BOL (Bill of Lading) and all shipping documents via Telegram immediately\n\n` +
      `Do NOT reply to this email.\n` +
      `All documents must be sent through Telegram only.\n\n` +
      `Failure to comply may result in dispatch restrictions.\n\n` +
      `If you need assistance, contact the dispatch team immediately.\n\n` +
      `Sent by: ${senderName}\n\n` +
      `Best regards,\n` +
      `ALGO Service Team`;

  return { subject, body, profileFormStatus, followUpRequired };
};

const deriveDriverAlertState = (driver: Driver): Partial<Driver> => {
  const isDisconnected = driver.eldStatus === ELDStatus.DISCONNECTED;
  const isAtWork = [DutyStatus.DRIVING, DutyStatus.ON_DUTY].includes(driver.dutyStatus);
  const lastSentRaw = driver.lastSentAt || driver.lastEmailTime;
  const lastSent = lastSentRaw ? new Date(lastSentRaw).getTime() : 0;
  const oneHour = 60 * 60 * 1000;
  const canSendNow = !lastSent || (Date.now() - lastSent) >= oneHour;

  if (isDisconnected && isAtWork) {
    return { hasPendingAlert: canSendNow };
  }

  return {
    hasPendingAlert: false,
    emailSent: isDisconnected ? driver.emailSent : false
  };
};

const buildDriverResetUpdates = (): Partial<Driver> => ({
  eldStatus: ELDStatus.CONNECTED,
  dutyStatus: DutyStatus.NOT_SET,
  followUp: FollowUpStatus.NONE,
  emailSent: false,
  hasPendingAlert: false
});

const mergeDriversById = (currentDrivers: Driver[], nextDrivers: Driver[]) => {
  const nextById = new Map(nextDrivers.map((driver) => [driver.id, driver]));
  return currentDrivers.map((driver) => {
    const persisted = nextById.get(driver.id);
    return persisted ? { ...driver, ...persisted } : driver;
  });
};
import {
  ArrowLeftRight,
  MessageSquare,
  TrendingUp,
  Sparkles,
  Menu,
  ShieldCheck,
  AlertTriangle,
  RefreshCcw,
  Zap,
  RefreshCw,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGoogleLogin } from '@react-oauth/google';
import { Toaster, toast } from 'react-hot-toast';

const App: React.FC = () => {
  const [drivers, setDrivers] = useState<Driver[]>(() => readJsonStorage(STORAGE_KEYS.drivers, INITIAL_DRIVERS));
  const [emailLogs, setEmailLogs] = useState<EmailLogEntry[]>(() => readJsonStorage(STORAGE_KEYS.emailLogs, []));
  const [driverReplies, setDriverReplies] = useState<DriverReply[]>(() => readJsonStorage(STORAGE_KEYS.driverReplies, []));
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [isResetting, setIsResetting] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'GMAIL'>('ALL');

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
    if (parsed?.assignedBoard) return normalizeBoard(parsed.assignedBoard);
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
  const [companies, setCompanies] = useState<Company[]>([]);
  const hasUserInteractedRef = useRef(false);
  const activeUserId = authUser?.uid;
  const googleClientId = ((window as any).__GOOGLE_CLIENT_ID__ || '').trim();
  const isAdminUser = authUser?.role === 'admin' || authUser?.email === 'westa@algogroup.us';
  const senderDisplayName = authUser?.name || user?.name || authUser?.email || user?.email || 'Unknown sender';
  const driverOwnerUserId = authUser?.role === 'employee' && authUser?.adminId
    ? authUser.adminId
    : activeUserId;
  const allowedBoards = normalizeBoardList(authUser?.assignedBoards || (authUser?.assignedBoard ? [authUser.assignedBoard] : []));
  const fixedEmployeeBoard = !isAdminUser && allowedBoards.length === 1 ? allowedBoards[0] : undefined;
  const rawApiBaseUrl = ((import.meta as any).env.VITE_API_URL || '').trim();
  const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '');
  const apiUrl = (path: string) => apiBaseUrl ? `${apiBaseUrl}${path}` : path;

  const syncAuthMetadataFromCurrentUser = useCallback(async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return;
    const currentUser = data.user;
    setAuthUser(prev => prev ? ({
      ...prev,
      email: currentUser.email || prev.email,
      name: (currentUser.user_metadata?.full_name as string) || prev.name,
      role: normalizeAuthRole(currentUser.user_metadata?.role) || prev.role,
      adminId: (currentUser.user_metadata?.admin_id as string) || prev.adminId,
      assignedBoards: Array.isArray(currentUser.user_metadata?.assigned_boards)
        ? normalizeBoardList(currentUser.user_metadata.assigned_boards)
        : (currentUser.user_metadata?.assigned_board ? [normalizeBoard(currentUser.user_metadata.assigned_board)] : prev.assignedBoards),
      assignedBoard: Array.isArray(currentUser.user_metadata?.assigned_boards) && currentUser.user_metadata.assigned_boards.length > 0
        ? normalizeBoard(currentUser.user_metadata.assigned_boards[0])
        : normalizeBoard((currentUser.user_metadata?.assigned_board as string) || prev.assignedBoard),
      assignedCompanies: Array.isArray(currentUser.user_metadata?.assigned_companies)
        ? currentUser.user_metadata.assigned_companies
        : (currentUser.user_metadata?.assigned_company ? [currentUser.user_metadata.assigned_company] : prev.assignedCompanies),
      landingHtml: (currentUser.user_metadata?.landing_html as string) || prev.landingHtml,
      emailTemplate: (currentUser.user_metadata?.email_template as string) || prev.emailTemplate,
      emailTemplates: typeof currentUser.user_metadata?.email_templates === 'object' && currentUser.user_metadata?.email_templates
        ? (currentUser.user_metadata.email_templates as EmailTemplateMap)
        : prev.emailTemplates
    }) : prev);
  }, []);

  const persistDriverUpdate = useCallback(async (id: string, updates: Partial<Driver>) => {
    if (!activeUserId) return;
    const currentDriver = drivers.find((driver) => driver.id === id);
    const payload = {
      ...updates,
      company: updates.company ?? currentDriver?.company,
      companyId: updates.companyId ?? currentDriver?.companyId ?? null,
      board: updates.board ?? currentDriver?.board,
      boardId: updates.boardId ?? currentDriver?.boardId ?? null
    };

    const response = await fetch(apiUrl(`/api/drivers/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acting_user_id: activeUserId,
        ...payload,
        company_id: payload.companyId,
        board_id: payload.boardId
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || `Driver update failed (${response.status})`);
    }

    return data?.driver || null;
  }, [activeUserId, apiBaseUrl, drivers]);

  const persistDriverReset = useCallback(async (driverIds: string[]) => {
    if (!activeUserId || driverIds.length === 0) return [] as Driver[];

    const response = await fetch(apiUrl('/api/drivers/reset'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acting_user_id: activeUserId,
        driver_ids: driverIds
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || `Driver reset failed (${response.status})`);
    }

    return Array.isArray(data?.drivers) ? data.drivers as Driver[] : [];
  }, [activeUserId, apiBaseUrl]);

  const companyById = useMemo(() => {
    return new Map(companies.map((company) => [company.id, company]));
  }, [companies]);

  const hydratedDrivers = useMemo(() => {
    return drivers.map((driver) => {
      const companyRecord = driver.companyId ? companyById.get(driver.companyId) : undefined;
      const resolvedCompany = driver.company || companyRecord?.name || '';
      const resolvedBoard = normalizeBoard(driver.board || driver.boardId || companyRecord?.boardId || '');
      if (resolvedCompany === driver.company && resolvedBoard === normalizeBoard(driver.board)) {
        return driver;
      }
      return {
        ...driver,
        company: resolvedCompany,
        board: resolvedBoard || driver.board
      };
    });
  }, [companyById, drivers]);

  const sendLiveEmail = useCallback(async (
    recipient: string,
    subject: string,
    body: string
  ): Promise<{ sentVia: 'Simulation' | 'SMTP' | 'Gmail API'; skipped?: boolean }> => {
    if (isPseudoRecipientEmail(recipient)) {
      console.log(`Pseudo recipient skipped: ${recipient}`);
      return { sentVia: 'Simulation', skipped: true };
    }

    if (user?.accessToken && user.accessToken !== 'demo_token') {
      const gmailResult = await sendGmailMessage(user.accessToken, recipient, subject, body, []);
      if (!gmailResult.ok) throw new Error(gmailResult.error || 'Gmail API failed to send email.');
      return { sentVia: 'Gmail API' };
    }

    const formData = new FormData();
    formData.append('recipients', JSON.stringify([recipient]));
    formData.append('subject', subject);
    formData.append('message', body);
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionToken = sessionData.session?.access_token;
    if (!sessionToken) throw new Error('Your session expired. Please sign in again.');
    const res = await fetch(apiUrl('/api/broadcast'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Backend email send failed (${res.status}).`);
    return { sentVia: 'SMTP' };
  }, [apiUrl, user]);

  // Persist theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
    document.body.setAttribute('data-theme', theme);
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
        name: (sessionUser.user_metadata?.full_name as string) || prev?.name || sessionUser.email?.split('@')[0] || 'User',
        role: normalizeAuthRole(sessionUser.user_metadata?.role) || prev?.role,
        adminId: (sessionUser.user_metadata?.admin_id as string) || prev?.adminId,
        assignedBoards: Array.isArray(sessionUser.user_metadata?.assigned_boards)
          ? normalizeBoardList(sessionUser.user_metadata.assigned_boards)
          : (sessionUser.user_metadata?.assigned_board ? [normalizeBoard(sessionUser.user_metadata.assigned_board)] : normalizeBoardList(prev?.assignedBoards)),
        assignedBoard: Array.isArray(sessionUser.user_metadata?.assigned_boards) && sessionUser.user_metadata.assigned_boards.length > 0
          ? normalizeBoard(sessionUser.user_metadata.assigned_boards[0])
          : normalizeBoard((sessionUser.user_metadata?.assigned_board as string) || prev?.assignedBoard),
        assignedCompanies: Array.isArray(sessionUser.user_metadata?.assigned_companies)
          ? sessionUser.user_metadata.assigned_companies
          : (sessionUser.user_metadata?.assigned_company ? [sessionUser.user_metadata.assigned_company] : prev?.assignedCompanies),
        emailTemplate: (sessionUser.user_metadata?.email_template as string) || prev?.emailTemplate,
        emailTemplates: typeof sessionUser.user_metadata?.email_templates === 'object' && sessionUser.user_metadata?.email_templates
          ? (sessionUser.user_metadata.email_templates as EmailTemplateMap)
          : prev?.emailTemplates
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
        name: (sessionUser.user_metadata?.full_name as string) || prev?.name || sessionUser.email?.split('@')[0] || 'User',
        role: normalizeAuthRole(sessionUser.user_metadata?.role) || prev?.role,
        adminId: (sessionUser.user_metadata?.admin_id as string) || prev?.adminId,
        assignedBoards: Array.isArray(sessionUser.user_metadata?.assigned_boards)
          ? normalizeBoardList(sessionUser.user_metadata.assigned_boards)
          : (sessionUser.user_metadata?.assigned_board ? [normalizeBoard(sessionUser.user_metadata.assigned_board)] : normalizeBoardList(prev?.assignedBoards)),
        assignedBoard: Array.isArray(sessionUser.user_metadata?.assigned_boards) && sessionUser.user_metadata.assigned_boards.length > 0
          ? normalizeBoard(sessionUser.user_metadata.assigned_boards[0])
          : normalizeBoard((sessionUser.user_metadata?.assigned_board as string) || prev?.assignedBoard),
        assignedCompanies: Array.isArray(sessionUser.user_metadata?.assigned_companies)
          ? sessionUser.user_metadata.assigned_companies
          : (sessionUser.user_metadata?.assigned_company ? [sessionUser.user_metadata.assigned_company] : prev?.assignedCompanies),
        emailTemplate: (sessionUser.user_metadata?.email_template as string) || prev?.emailTemplate,
        emailTemplates: typeof sessionUser.user_metadata?.email_templates === 'object' && sessionUser.user_metadata?.email_templates
          ? (sessionUser.user_metadata.email_templates as EmailTemplateMap)
          : prev?.emailTemplates
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
    const markInteraction = () => { hasUserInteractedRef.current = true; };
    window.addEventListener('click', markInteraction, { once: true });
    return () => window.removeEventListener('click', markInteraction);
  }, []);

  useEffect(() => {
    if (!activeUserId) {
      setDbConnected(false);
      return;
    }

    let isDisposed = false;
    const driverScopeId = driverOwnerUserId || activeUserId;
    const ownBoardId = !isAdminUser && allowedBoards.length === 1
      ? normalizeBoard(allowedBoards[0]).replace('Board ', '')
      : undefined;

    const reconcileDrivers = async () => {
      try {
        const refreshed = await fetchDrivers(driverScopeId);
        if (!isDisposed) {
          setDrivers(refreshed);
          setLastSync(new Date().toISOString());
        }
      } catch (error) {
        console.warn('Driver reconciliation refresh failed:', error);
      }
    };

    const reconcileCompanies = async () => {
      try {
        const refreshed = await fetchCompanies(isAdminUser ? undefined : ownBoardId);
        if (!isDisposed) {
          setCompanies(refreshed);
        }
      } catch (error) {
        console.warn('Company reconciliation refresh failed:', error);
      }
    };

    const setupDatabase = async () => {
      try {
        const activeEmail = user?.email || authUser?.email || '';
        const activeName = user?.name || authUser?.name || '';
        await initializeUserDatabase(activeUserId, activeEmail, activeName);
        try {
          await fetch(apiUrl('/api/auth/ensure-profile'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: activeUserId })
          });
          await syncAuthMetadataFromCurrentUser();
        } catch (err) {
          console.warn('Failed to ensure user profile assignments:', err);
        }
        const profile = await fetchUserProfile(activeUserId);

        if (profile) {
          const profileBoards = normalizeBoardList(profile.assigned_boards ?? []);
          setAuthUser(prev => prev ? {
            ...prev,
            role: profile.role ?? prev.role,
            adminId: profile.admin_id ?? prev.adminId,
            // Prefer DB profile assignments (includes board_id fallback) to avoid stale metadata.
            assignedBoards: profileBoards.length > 0
              ? profileBoards
              : normalizeBoardList(prev.assignedBoards ?? []),
            assignedBoard: profileBoards.length > 0
              ? normalizeBoard(profileBoards[0])
              : (prev.assignedBoard ? normalizeBoard(prev.assignedBoard) : undefined),
            assignedCompanies: profile.assigned_companies ?? [],
            name: profile.name || prev.name,
            email: profile.email || prev.email
          } : prev);
        }

        setDbConnected(true);
        const refreshed = await fetchDrivers(driverScopeId);
        setDrivers(refreshed);
        console.log('Database connected for user:', activeEmail);
      } catch (err) {
        console.error('Database initialization error:', err);
        setDbConnected(false);
      }
    };

    setupDatabase();

    const unsubDrivers = subscribeToDrivers(
      driverScopeId,
      (driversSnapshot) => {
        setDrivers(driversSnapshot);
        setLastSync(new Date().toISOString());
      },
      (eventType, changedDriver) => {
        if (!changedDriver) return;
        const creator = changedDriver.createdByName || changedDriver.createdByEmail || 'Unknown user';
        if (eventType === 'INSERT') {
          toast.success(`${creator} added ${changedDriver.name}`);
        } else if (eventType === 'UPDATE') {
          toast(`Updated: ${changedDriver.name}`);
        } else if (eventType === 'DELETE') {
          toast.error(`Removed: ${changedDriver.name || 'Driver'}`);
        }
        if (hasUserInteractedRef.current && eventType === 'INSERT') {
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            gain.gain.setValueAtTime(0.03, ctx.currentTime);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.12);
          } catch (err) {
            console.warn('Notification sound blocked:', err);
          }
        }
      }
    );

    const unsubCompanies = subscribeToCompanies((companySnapshot) => {
      setCompanies(companySnapshot);
    }, isAdminUser ? undefined : ownBoardId);

    const unsubLogs = subscribeToEmailLogs(driverScopeId, (emailLogSnapshot) => {
      setEmailLogs(emailLogSnapshot);
    });

    const unsubReplies = subscribeToDriverReplies(driverScopeId, (driverReplySnapshot) => {
      setDriverReplies(driverReplySnapshot);
    });

    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') {
        reconcileDrivers().catch(() => undefined);
        reconcileCompanies().catch(() => undefined);
      }
    };

    const refreshOnFocus = () => {
      reconcileDrivers().catch(() => undefined);
      reconcileCompanies().catch(() => undefined);
    };

    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        reconcileDrivers().catch(() => undefined);
      }
    }, 10000);

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisibility);

    return () => {
      isDisposed = true;
      unsubDrivers();
      unsubCompanies();
      unsubLogs();
      unsubReplies();
      window.clearInterval(refreshInterval);
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, [activeUserId, driverOwnerUserId, authUser?.email, authUser?.name, allowedBoards.join('|'), isAdminUser, syncAuthMetadataFromCurrentUser, user?.accessToken, user?.email, user?.name]);

  useEffect(() => {
    if (!activeUserId) return;
    const unsubProfile = subscribeToUserProfile(activeUserId, (profile) => {
      if (!profile) return;
      const profileBoards = normalizeBoardList(profile.assigned_boards ?? []);
      setAuthUser(prev => prev ? {
        ...prev,
        role: profile.role ?? prev.role,
        adminId: profile.admin_id ?? prev.adminId,
        assignedBoards: profileBoards.length > 0 ? profileBoards : [],
        assignedBoard: profileBoards.length > 0 ? normalizeBoard(profileBoards[0]) : undefined,
        assignedCompanies: profile.assigned_companies ?? [],
        name: profile.name || prev.name,
        email: profile.email || prev.email
      } : prev);
      syncAuthMetadataFromCurrentUser().catch((error) => {
        console.warn('Failed to refresh auth metadata after profile update:', error);
      });
    });
    return () => {
      unsubProfile();
    };
  }, [activeUserId, syncAuthMetadataFromCurrentUser]);

  useEffect(() => {
    if (isAdminUser) {
      setBoardFilter('ALL');
      return;
    }
    if (allowedBoards.length === 1) {
      setBoardFilter(normalizeBoard(allowedBoards[0]));
      return;
    }
    setBoardFilter('ALL');
  }, [allowedBoards.join('|'), isAdminUser]);

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
    supabase.auth.signOut().catch((error) => console.error('Sign-out failed:', error));
    setBoardFilter('ALL');
    setCompanyFilter('ALL');
    setEldFilter('ALL');
    setDutyFilter('ALL');
    setSearchQuery('');
    setIsLiveMode(false);
    localStorage.removeItem('auth_user');
    localStorage.removeItem(STORAGE_KEYS.drivers);
    localStorage.removeItem(STORAGE_KEYS.emailLogs);
    localStorage.removeItem(STORAGE_KEYS.driverReplies);
    localStorage.removeItem(STORAGE_KEYS.liveMode);
  };

  const filteredDrivers = useMemo(() => {
    return hydratedDrivers.filter(driver => {
      const matchesName = driver.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesEld = eldFilter === 'ALL' || driver.eldStatus === eldFilter;
      const matchesDuty = dutyFilter === 'ALL' || driver.dutyStatus === dutyFilter;
      const matchesCompany = companyFilter === 'ALL' || normalizeCompanyLabel(driver.company) === normalizeCompanyLabel(companyFilter);

      if (isAdminUser) {
        const matchesBoard = boardFilter === 'ALL' || normalizeBoard(driver.board) === normalizeBoard(boardFilter);
        return matchesName && matchesEld && matchesDuty && matchesCompany && matchesBoard;
      }

      const allowedBoards = normalizeBoardList(authUser?.assignedBoards || (authUser?.assignedBoard ? [authUser.assignedBoard] : []));
      const allowedCompanies = (authUser?.assignedCompanies || []).map((company) => normalizeCompanyLabel(company));
      const matchesBoard = allowedBoards.length > 0
        ? allowedBoards.includes(normalizeBoard(driver.board))
        : (boardFilter === 'ALL' || normalizeBoard(driver.board) === normalizeBoard(boardFilter));
      const matchesAssignedCompany = allowedCompanies.length > 0
        ? allowedCompanies.includes(normalizeCompanyLabel(driver.company))
        : true;

      return matchesName && matchesEld && matchesDuty && matchesCompany && matchesBoard && matchesAssignedCompany;
    });
  }, [hydratedDrivers, searchQuery, eldFilter, dutyFilter, companyFilter, boardFilter, authUser, isAdminUser]);

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
    const derived = deriveDriverAlertState(driver);
    if (driver.hasPendingAlert !== derived.hasPendingAlert || driver.emailSent !== derived.emailSent) {
      setDrivers(prev => prev.map(d => d.id === driver.id ? { ...d, ...derived } : d));
    }
  }, []);

  const handleManualSendEmail = async (
    driverId: string,
    options?: { silent?: boolean; automationType?: 'driving_disconnected' | 'onduty_disconnected' }
  ): Promise<{ sentAt: string }> => {
    const driver = hydratedDrivers.find(d => d.id === driverId);
    if (!driver) throw new Error('Driver not found');

    if (driver.lastEmailTime) {
      const lastSent = new Date(driver.lastEmailTime).getTime();
      const now = new Date().getTime();
      const oneHour = 60 * 60 * 1000;
      if (now - lastSent < oneHour) {
        throw new Error("Spam protection active. Wait before sending again.");
      }
    }

    const isConnectionAutomation = options?.automationType === 'driving_disconnected' || options?.automationType === 'onduty_disconnected';
    const { subject, body } = isConnectionAutomation
      ? buildConnectionAutomationEmail(driver, senderDisplayName)
      : buildFollowUpEmail(driver.name, senderDisplayName);
    const selectedTemplate = options?.automationType === 'driving_disconnected'
      ? authUser?.emailTemplates?.connection_driving
      : options?.automationType === 'onduty_disconnected'
        ? authUser?.emailTemplates?.connection_onduty
        : authUser?.emailTemplate;
    const templatedBody = selectedTemplate
      ? renderEmailTemplate(selectedTemplate, driver, {
          dutyStatus: String(driver.dutyStatus || 'Not Set'),
          eldConnection: String(driver.eldStatus || 'Unknown'),
          followUpRequired: 'Reconnect',
          senderName: senderDisplayName
        })
      : body;
    let sentVia: 'Simulation' | 'SMTP' | 'Gmail API' = 'Simulation';

    console.log(`Email Sending Mode: ${isLiveMode ? 'LIVE' : 'SIMULATION'}`);

    if (isLiveMode) {
      const result = await sendLiveEmail(driver.email, subject, templatedBody);
      sentVia = result.sentVia;
    } else {
      console.log("Simulation mode: No real email sent.");
      if (!options?.silent) {
        alert("Note: App is in SIMULATION MODE. No real email was sent. Toggle Live Mode ON.");
      }
    }

    const sentAt = new Date().toISOString();

    const logEntry: EmailLogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      driverId: driver.id,
      driverName: driver.name,
      timestamp: sentAt,
      statusAtTime: driver.dutyStatus,
      content: templatedBody,
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
    const logOwnerId = driverOwnerUserId || activeUserId;
    if (activeUserId && logOwnerId) {
      await persistDriverUpdate(driver.id, updatedDriver);
      await addEmailLog(logOwnerId, logEntry);
    }

    return { sentAt };
  };

  const handleProfileFormReminder = async (driverId: string, days: 3 | 5) => {
    const driver = hydratedDrivers.find(d => d.id === driverId);
    if (!driver) throw new Error('Driver not found');

    const { subject, body, profileFormStatus, followUpRequired } = buildProfileFormReminderEmail(driver, days, senderDisplayName);
    const lastPfLabel = driver.lastPFUpdate
      ? new Date(driver.lastPFUpdate).toLocaleString()
      : 'No PF update date recorded';
    const staleDays = driver.lastPFUpdate
      ? Math.floor((Date.now() - new Date(driver.lastPFUpdate).getTime()) / (1000 * 60 * 60 * 24))
      : days;
    const selectedTemplate = days === 3
      ? authUser?.emailTemplates?.pf_3_day
      : authUser?.emailTemplates?.pf_5_day;
    const finalBody = selectedTemplate
      ? renderEmailTemplate(selectedTemplate, driver, {
          staleDays,
          lastPfUpdateLabel: lastPfLabel,
          profileFormStatus,
          followUpRequired,
          senderName: senderDisplayName
        })
      : body;

    let sentVia: 'Simulation' | 'SMTP' | 'Gmail API' = 'Simulation';

    if (isLiveMode) {
      const result = await sendLiveEmail(driver.email, subject, finalBody);
      sentVia = result.sentVia;
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
      content: finalBody,
      sentVia
    };

    setEmailLogs(prev => [logEntry, ...prev]);

    const logOwnerId = driverOwnerUserId || activeUserId;
    if (activeUserId && logOwnerId) {
      await persistDriverUpdate(driver.id, updatePayload);
      await addEmailLog(logOwnerId, logEntry);
    }
  };

  const handleUpdatePFDate = async (driverId: string, dateStr: string) => {
    const driver = hydratedDrivers.find(d => d.id === driverId);
    if (!driver) return;

    const updatePayload = { lastPFUpdate: dateStr };
    setDrivers(prev => prev.map(d => d.id === driverId ? { ...d, ...updatePayload } : d));

    if (activeUserId && (driverOwnerUserId || activeUserId)) {
      await persistDriverUpdate(driverId, updatePayload);
    }
  };

  const handleCustomEmail = async (driverId: string, subject: string, body: string, attachments: { name: string; type: string; base64: string }[]) => {
    const driver = hydratedDrivers.find(d => d.id === driverId);
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

    const logOwnerId = driverOwnerUserId || activeUserId;
    if (activeUserId && logOwnerId) {
      await addEmailLog(logOwnerId, logEntry);
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

  useEffect(() => {
    drivers.forEach((driver) => {
      processAlertLogic(driver).catch((error) => console.error('Failed to process alert logic:', error));
    });
  }, [drivers, processAlertLogic]);

  // Keep alert sending user-controlled from "Send Alert" button.
  // This avoids immediate auto-send and keeps escalation visible in the table.

  const handleUpdateDriver = async (id: string, updates: Partial<Driver>) => {
    let previousDriver: Driver | undefined;
    let updatedDriver: Driver | undefined;
    let persistencePayload: Partial<Driver> | undefined;

    setDrivers(prev => {
      previousDriver = prev.find(d => d.id === id);
      const newDrivers = prev.map(d => {
        if (d.id !== id) return d;
        const merged = { ...d, ...updates };
        const derived = deriveDriverAlertState(merged);
        persistencePayload = { ...updates, ...derived };
        return { ...merged, ...derived };
      });
      updatedDriver = newDrivers.find(d => d.id === id);
      return newDrivers;
    });

    if (updatedDriver && activeUserId && persistencePayload) {
      try {
        const persistedDriver = await persistDriverUpdate(id, persistencePayload);
        if (persistedDriver) {
          setDrivers(prev => prev.map(d => d.id === id ? { ...d, ...persistedDriver } : d));
        }
      } catch (error: any) {
        if (previousDriver) {
          setDrivers(prev => prev.map(d => d.id === id ? previousDriver! : d));
        }
        alert(error?.message || 'Failed to save driver update.');
        throw error;
      }
    }
  };

  const handleAddDriver = async (data: Omit<Driver, 'id' | 'emailSent'>) => {
    if (!activeUserId) return;
    try {
      const endpoint = apiUrl('/api/drivers/create');
      const selectedCompany = companies.find((c) => c.name === data.company);
      const requestedBoard = normalizeBoard(data.board);
      const payload = {
        acting_user_id: activeUserId,
        name: data.name,
        email: data.email,
        company: data.company,
        company_id: selectedCompany?.id || null,
        board: isAdminUser
          ? requestedBoard
          : (allowedBoards.includes(requestedBoard) ? requestedBoard : (allowedBoards[0] || requestedBoard)),
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

  const handleAddCompany = async (payload: { name: string; board?: string }) => {
    if (!activeUserId) return;
    try {
      const endpoint = apiUrl('/api/companies/create');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acting_user_id: activeUserId,
          name: payload.name,
          board: isAdminUser
            ? payload.board
            : (allowedBoards.includes(normalizeBoard(payload.board || ''))
                ? normalizeBoard(payload.board || '')
                : allowedBoards[0])
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
      if (data?.company?.id && data?.company?.name) {
        const inserted = {
          id: data.company.id as string,
          name: data.company.name as string,
          boardId: (data.company.board_id as string | null) ?? null,
          createdBy: activeUserId
        };
        setCompanies((prev) => {
          const withoutDup = prev.filter((c) => c.id !== inserted.id && c.name !== inserted.name);
          return [...withoutDup, inserted].sort((a, b) => a.name.localeCompare(b.name));
        });
      }
      toast.success(data?.existed ? 'Company already exists.' : 'Company created.');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create company.');
    }
  };

  const handleUpdateCompany = async (companyId: string, payload: { name: string; board?: string }) => {
    if (!activeUserId) return;
    const response = await fetch(apiUrl(`/api/companies/${companyId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        acting_user_id: activeUserId,
        name: payload.name,
        board: payload.board
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);

    const nextBoardId = (data?.company?.board_id as string | null) ?? null;
    const nextBoardLabel = nextBoardId ? `Board ${nextBoardId}` : payload.board;

    setCompanies((prev) => prev.map((company) => (
      company.id === companyId
        ? { ...company, name: data.company.name as string, boardId: nextBoardId }
        : company
    )).sort((a, b) => a.name.localeCompare(b.name)));

    setDrivers((prev) => prev.map((driver) => (
      driver.companyId === companyId
        ? { ...driver, company: data.company.name as string, board: nextBoardLabel || driver.board, boardId: nextBoardId }
        : driver
    )));
  };

  const handleDeleteCompany = async (companyId: string) => {
    if (!activeUserId) return;
    const targetCompany = companies.find((c) => c.id === companyId);
    if (!targetCompany) return;

    setCompanies((prev) => prev.filter((company) => company.id !== companyId));
    try {
      const response = await fetch(apiUrl(`/api/companies/${companyId}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acting_user_id: activeUserId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
    } catch (error: any) {
      setCompanies((prev) => [...prev, targetCompany].sort((a, b) => a.name.localeCompare(b.name)));
      throw error;
    }
  };

  const handleDeleteDriver = async (id: string) => {
    const targetDriver = drivers.find((d) => d.id === id);
    const canDelete = isAdminUser || (targetDriver?.createdBy && targetDriver.createdBy === activeUserId);
    if (!canDelete || !activeUserId) return;
    setDrivers(prev => prev.filter(d => d.id !== id));

    try {
      const response = await fetch(apiUrl(`/api/drivers/${id}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acting_user_id: activeUserId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
    } catch (error: any) {
      setDrivers(prev => targetDriver ? [targetDriver, ...prev] : prev);
      alert(error?.message || 'Failed to delete driver.');
    }
  };

  const handleResetDriver = async (id: string) => {
    if (!window.confirm("Reset this driver to Connected/Not Set?")) return;

    const previousDrivers = drivers;
    const resetUpdates = buildDriverResetUpdates();
    setDrivers(prev => prev.map((driver) => driver.id === id ? { ...driver, ...resetUpdates } : driver));

    try {
      const persistedDrivers = await persistDriverReset([id]);
      if (persistedDrivers.length > 0) {
        setDrivers(prev => mergeDriversById(prev, persistedDrivers));
      }
      setLastSync(new Date().toISOString());
    } catch (error: any) {
      setDrivers(previousDrivers);
      alert(error?.message || 'Failed to reset driver.');
    }
  };

  const handleGlobalReset = async () => {
    if (!window.confirm("Reset ALL drivers to Connected status?")) return;

    const targetDriverIds = drivers.map((driver) => driver.id);
    if (targetDriverIds.length === 0) return;

    const previousDrivers = drivers;
    const resetUpdates = buildDriverResetUpdates();
    setDrivers(prev => prev.map((driver) => ({ ...driver, ...resetUpdates })));

    try {
      const persistedDrivers = await persistDriverReset(targetDriverIds);
      if (persistedDrivers.length > 0) {
        setDrivers(prev => mergeDriversById(prev, persistedDrivers));
      }
      setLastSync(new Date().toISOString());
    } catch (error: any) {
      setDrivers(previousDrivers);
      alert(error?.message || 'Failed to reset drivers.');
    }
  };

  const toggleTheme = () => setTheme(v => v === 'light' ? 'dark' : 'light');

  if (!authUser) return (
    <Login onLogin={(u) => {
      setAuthUser(u);
      if (u.assignedBoard) {
        setBoardFilter(normalizeBoard(u.assignedBoard));
      }
    }} />
  );

  return (
    <div className={`app-shell theme-${theme} flex h-screen bg-transparent overflow-hidden transition-colors relative`}>
      <div className="absolute inset-0 -z-20 pointer-events-none overflow-hidden">
        <HeroBackground className={theme === 'dark' ? 'opacity-100' : 'opacity-70'} />
      </div>

      {authUser && (
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={setActiveTab} 
          isAdmin={isAdminUser}
          onLogout={handleLogout}
          googleConnected={!!user}
          googleClientIdPresent={!!googleClientId}
          onGoogleConnect={handleGoogleLogin}
          dbConnected={dbConnected}
          isSyncing={isSyncing}
          lastSync={lastSync}
          isLiveMode={isLiveMode}
          onToggleLiveMode={setIsLiveMode}
          profileName={user?.name || authUser?.name}
          profilePicture={user?.picture || authUser?.picture}
        />
      )}
      
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
      <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-32">
        <header className="flex items-center justify-between mb-8 pl-2">
          <div className="flex flex-col items-start gap-1">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white">Leader Control</h2>
            <p className="text-slate-500 text-sm mt-3">Welcome back, {authUser?.name || 'Guest'}</p>
          </div>
          {isAdminUser && (
            <button onClick={handleGlobalReset} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700">
              <Zap className="w-4 h-4" /> Reset All
            </button>
          )}
        </header>

        {activeTab === 'Dashboard' && <Dashboard drivers={filteredDrivers} assignedBoard={fixedEmployeeBoard} employeeName={isAdminUser ? undefined : authUser?.name} />}

        {activeTab === 'Connection' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatsCard title="Drivers" value={stats.total} icon={<ShieldCheck className="w-6 h-6 text-blue-500" />} color="bg-blue-50 dark:bg-blue-900/20" />
              <StatsCard title="Violations" value={stats.violations} icon={<AlertTriangle className="w-6 h-6 text-red-500" />} color="bg-red-50 dark:bg-red-900/20" />
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
              <DriverTable
                drivers={hydratedDrivers}
                companies={companies}
                filteredDrivers={filteredDrivers}
                filters={{ searchQuery, eldFilter, dutyFilter, companyFilter, boardFilter }}
                setFilters={{ setSearchQuery, setEldFilter, setDutyFilter, setCompanyFilter, setBoardFilter }}
                onUpdateDriver={handleUpdateDriver}
                onAddDriver={handleAddDriver}
                onAddCompany={handleAddCompany}
                onUpdateCompany={handleUpdateCompany}
                onDeleteCompany={handleDeleteCompany}
                onDeleteDriver={handleDeleteDriver}
                onManualSendEmail={handleManualSendEmail}
                onResetDriver={handleResetDriver}
                isAdmin={isAdminUser}
                currentUserId={activeUserId}
                fixedBoard={fixedEmployeeBoard}
                allowedBoards={isAdminUser ? undefined : allowedBoards}
              />
            </div>
          </div>
        )}

        {activeTab === 'Profile Form' && <ProfileForm drivers={filteredDrivers} emailLogs={emailLogs} onSendReminder={handleProfileFormReminder} onUpdatePFDate={handleUpdatePFDate} />}
        {activeTab === 'AI Assistant' && <AIAssistant userId={authUser?.uid} />}
        {activeTab === 'Broadcast' && <EmailBroadcast drivers={filteredDrivers} assignedBoard={fixedEmployeeBoard} userId={activeUserId} userAccessToken={user?.accessToken} />}
        {activeTab === 'History' && (
          <div className="space-y-4">
            {isAdminUser && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Activity</h3>
                </div>
                {emailLogs
                  .filter(log => log.type === 'activity' || log.sentVia === 'System')
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map(log => (
                    <div key={log.id} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{log.content}</p>
                      <p className="text-xs text-slate-500 mt-2">{new Date(log.timestamp).toLocaleString()}</p>
                    </div>
                  ))}
                {emailLogs.filter(log => log.type === 'activity' || log.sentVia === 'System').length === 0 && (
                  <div className="p-6 text-sm text-slate-500 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    No activity yet.
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Email History</h3>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setHistoryFilter('ALL')}
                className={`px-3 py-2 rounded-lg text-sm font-bold border ${historyFilter === 'ALL' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'}`}
              >
                All History
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter('GMAIL')}
                className={`px-3 py-2 rounded-lg text-sm font-bold border ${historyFilter === 'GMAIL' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'}`}
              >
                Gmail API
              </button>
            </div>

            {emailLogs
              .filter((log) => historyFilter === 'ALL' || log.sentVia === 'Gmail API')
              .map(log => (
                <div key={log.id} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex justify-between items-start gap-4">
                  <div>
                    <p className="font-bold dark:text-white">{log.driverName}</p>
                    <p className="text-xs text-slate-500">{new Date(log.timestamp).toLocaleString()}</p>
                    {log.content && (
                      <p className="text-xs text-slate-500 mt-2 whitespace-pre-wrap line-clamp-2">{log.content}</p>
                    )}
                  </div>
                  <div className={`text-xs font-mono px-2 py-1 rounded-full border ${
                    log.sentVia === 'Gmail API'
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800'
                      : 'text-indigo-500 bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800'
                  }`}>
                    SENT VIA {log.sentVia}
                  </div>
                </div>
              ))}
          </div>
        )}
        {activeTab === 'Admin Panel' && <AdminPanel currentUser={authUser} />}
        {activeTab === 'Settings' && (
          <SettingsPanel
            currentUser={authUser}
            isAdmin={isAdminUser}
            theme={theme}
            setTheme={setTheme}
            emailLogs={emailLogs}
            drivers={filteredDrivers}
          />
        )}
      </main>
     </div>
      <Toaster position="top-right" />
    </div>
  );
};

export default App;




