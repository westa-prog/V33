
export enum DutyStatus {
  DRIVING = 'Driving',
  ON_DUTY = 'On Duty',
  OFF_DUTY = 'Off Duty',
  SLEEPER = 'Sleep',
  NOT_SET = 'Not Set'
}

export enum ELDStatus {
  CONNECTED = 'Connected',
  DISCONNECTED = 'Disconnected'
}

export enum FollowUpStatus {
  ACTION_REQUIRED = 'Action required',
  CONNECT = 'Connect',
  NONE = 'None'
}

export interface EmailLogEntry {
  id: string;
  driverId: string;
  driverName: string;
  timestamp: string;
  statusAtTime: DutyStatus;
  content: string;
  type?: '3_day_reminder' | '5_day_reminder' | 'custom' | string;
  sentVia?: 'Simulation' | 'Gmail API' | 'System';
}

export interface DriverReply {
  id: string;
  driverId: string;
  driverName: string;
  timestamp: string;
  message: string;
  isRead: boolean;
  sentiment?: 'frustrated' | 'cooperative' | 'urgent';
}

export interface Driver {
  id: string;
  name: string;
  email: string;
  company: string;
  board: string;
  deviceType: string;
  appVersion: string; // New field for Leader ELD App Version
  eldStatus: ELDStatus | null;
  dutyStatus: DutyStatus | null;
  followUp: FollowUpStatus | null;
  emailSent: boolean;
  lastEmailTime?: string;
  lastSentAt?: string | null;
  hasPendingAlert?: boolean;
  sheetRowIndex?: number;
  lastProfileReminderAt?: string;
  lastPFUpdate?: string | null;
  last3DayEmail?: string | null;
  last5DayEmail?: string | null;
}

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
  accessToken: string;
  expiry: number;
}

export interface AuthUser {
  email: string;
  name: string;
  picture?: string;
  assignedBoard?: string;
  assignedBoards?: string[];
  uid?: string;
  role?: string;
  adminId?: string;
  assignedCompanies?: string[];
  landingHtml?: string;
  emailTemplate?: string;
}

export interface SheetConfig {
  sheetId: string;
  isAutoSync: boolean;
  lastSync?: string;
  isLiveMode: boolean;
  isBidirectional: boolean;
}
