
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
  sentVia?: 'Simulation' | 'Gmail API' | 'SMTP' | 'System';
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
  companyId?: string | null;
  boardId?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
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

export interface Company {
  id: string;
  name: string;
  boardId: string | null;
  createdBy?: string | null;
}

export interface EmailTemplateMap {
  connection_driving?: string;
  connection_onduty?: string;
  pf_3_day?: string;
  pf_5_day?: string;
}

export interface AuthUser {
  email: string;
  name: string;
  picture?: string;
  assignedBoard?: string;
  assignedBoards?: string[];
  uid?: string;
  role?: 'admin' | 'employee' | 'user';
  adminId?: string;
  assignedCompanies?: string[];
  landingHtml?: string;
  emailTemplate?: string;
  emailTemplates?: EmailTemplateMap;
}

export interface SheetConfig {
  sheetId: string;
  isAutoSync: boolean;
  lastSync?: string;
  isLiveMode: boolean;
  isBidirectional: boolean;
}
