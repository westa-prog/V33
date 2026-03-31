import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AuthUser, Driver, DutyStatus, ELDStatus, EmailLogEntry, EmailTemplateMap } from '../types';
import { supabase } from '../supabase';
import { LandingContent } from './LandingContent';

interface SettingsPanelProps {
  currentUser: AuthUser;
  isAdmin: boolean;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  emailLogs: EmailLogEntry[];
  drivers: Driver[];
}

type EmployeeRecord = {
  id: string;
  email: string;
  name?: string;
  assigned_boards?: string[];
  status?: 'pending' | 'active';
  claimed_user_id?: string | null;
  landing_html?: string;
  email_template?: string;
  email_templates?: EmailTemplateMap;
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildLandingMediaSnippet = (payload: { url: string; mediaType: 'image' | 'video'; label: string }) => {
  const safeUrl = escapeHtml(payload.url);
  const safeLabel = escapeHtml(payload.label || 'Media');
  if (payload.mediaType === 'video') {
    return [
      '<figure>',
      `  <video controls playsinline preload="metadata" src="${safeUrl}"></video>`,
      `  <figcaption>${safeLabel}</figcaption>`,
      '</figure>'
    ].join('\n');
  }

  return [
    '<figure>',
    `  <img src="${safeUrl}" alt="${safeLabel}" />`,
    `  <figcaption>${safeLabel}</figcaption>`,
    '</figure>'
  ].join('\n');
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ currentUser, isAdmin, theme, setTheme, emailLogs, drivers }) => {
  const rawApiBaseUrl = ((import.meta as any).env.VITE_API_URL || '').trim();
  const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '');
  const apiUrl = (path: string) => (apiBaseUrl ? `${apiBaseUrl}${path}` : path);

  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [emailTemplatesDraft, setEmailTemplatesDraft] = useState<EmailTemplateMap>({
    connection_driving: '',
    connection_onduty: '',
    pf_3_day: '',
    pf_5_day: ''
  });
  const [landingHtmlDraft, setLandingHtmlDraft] = useState('');
  const [activeTemplateKey, setActiveTemplateKey] = useState<keyof EmailTemplateMap>('connection_driving');
  const [saving, setSaving] = useState(false);
  const [uploadingLandingMedia, setUploadingLandingMedia] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [emailDiagnostics, setEmailDiagnostics] = useState<{
    emailMode?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpFrom?: string;
    error?: string;
    message?: string;
  } | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testingSend, setTestingSend] = useState(false);
  const [testRecipient, setTestRecipient] = useState(currentUser?.email || '');
  const getAuthHeaders = async (includeJson = false) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Your session expired. Please sign in again.');
    return {
      ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`
    };
  };
  const templateOptions: Array<{ key: keyof EmailTemplateMap; label: string }> = [
    { key: 'connection_driving', label: 'Connection: Driving + Disconnected' },
    { key: 'connection_onduty', label: 'Connection: On Duty + Disconnected' },
    { key: 'pf_3_day', label: 'Profile Form: 3-Day Stale' },
    { key: 'pf_5_day', label: 'Profile Form: 5-Day Stale' }
  ];

  const selectedEmployee = useMemo(
    () => employees.find((u) => u.id === selectedEmployeeId),
    [employees, selectedEmployeeId]
  );

  const scoreboard = useMemo(() => {
    const score = new Map<string, number>();
    emailLogs
      .filter((log) => log.type === 'activity' || log.sentVia === 'System')
      .forEach((log) => {
        const content = log.content || '';
        const match = content.match(/^\[ACTIVITY\]\s(.+?)\screated driver/i);
        const actor = match?.[1] || 'Unknown';
        score.set(actor, (score.get(actor) || 0) + 1);
      });
    return [...score.entries()].sort((a, b) => b[1] - a[1]);
  }, [emailLogs]);

  const reportSummary = useMemo(() => {
    const totalDrivers = drivers.length;
    const connectedDrivers = drivers.filter((d) => d.eldStatus === ELDStatus.CONNECTED).length;
    const disconnectedDrivers = drivers.filter((d) => d.eldStatus === ELDStatus.DISCONNECTED).length;
    const violations = drivers.filter(
      (d) =>
        d.eldStatus === ELDStatus.DISCONNECTED &&
        (d.dutyStatus === DutyStatus.DRIVING || d.dutyStatus === DutyStatus.ON_DUTY)
    ).length;

    const now = Date.now();
    const stale3 = drivers.filter((d) => {
      if (!d.lastPFUpdate) return false;
      const days = Math.floor((now - new Date(d.lastPFUpdate).getTime()) / (1000 * 60 * 60 * 24));
      return days >= 3;
    }).length;
    const stale5 = drivers.filter((d) => {
      if (!d.lastPFUpdate) return false;
      const days = Math.floor((now - new Date(d.lastPFUpdate).getTime()) / (1000 * 60 * 60 * 24));
      return days >= 5;
    }).length;
    const missingPfDate = drivers.filter((d) => !d.lastPFUpdate).length;

    return {
      totalDrivers,
      connectedDrivers,
      disconnectedDrivers,
      violations,
      stale3,
      stale5,
      missingPfDate
    };
  }, [drivers]);

  const downloadFleetReport = () => {
    const now = new Date();
    const fileStamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const nowIso = now.toISOString();

    const summaryRows = [
      { metric: 'Generated At (UTC)', value: nowIso },
      { metric: 'Generated By', value: currentUser.email || currentUser.name || 'Unknown' },
      { metric: 'Total Drivers', value: reportSummary.totalDrivers },
      { metric: 'Connected Drivers', value: reportSummary.connectedDrivers },
      { metric: 'Disconnected Drivers', value: reportSummary.disconnectedDrivers },
      { metric: 'Active Violations (Disconnected + Driving/On Duty)', value: reportSummary.violations },
      { metric: 'PF Stale >= 3 Days', value: reportSummary.stale3 },
      { metric: 'PF Stale >= 5 Days', value: reportSummary.stale5 },
      { metric: 'PF Date Missing', value: reportSummary.missingPfDate }
    ];

    const driverRows = drivers.map((driver) => {
      const staleDays = driver.lastPFUpdate
        ? Math.floor((Date.now() - new Date(driver.lastPFUpdate).getTime()) / (1000 * 60 * 60 * 24))
        : '';
      return {
        driver_name: driver.name,
        email: driver.email,
        company: driver.company,
        board: driver.board,
        connection: driver.eldStatus || '',
        duty_status: driver.dutyStatus || '',
        follow_up: driver.followUp || '',
        last_pf_update: driver.lastPFUpdate ? new Date(driver.lastPFUpdate).toISOString() : '',
        stale_days: staleDays,
        last_3_day_email: driver.last3DayEmail ? new Date(driver.last3DayEmail).toISOString() : '',
        last_5_day_email: driver.last5DayEmail ? new Date(driver.last5DayEmail).toISOString() : '',
        last_email_time: driver.lastEmailTime ? new Date(driver.lastEmailTime).toISOString() : '',
        last_sent_at: driver.lastSentAt ? new Date(driver.lastSentAt).toISOString() : ''
      };
    });

    const workbook = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    const driversSheet = XLSX.utils.json_to_sheet(driverRows);

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Dashboard Summary');
    XLSX.utils.book_append_sheet(workbook, driversSheet, 'Drivers');

    XLSX.writeFile(workbook, `fleet-report-${fileStamp}.xlsx`);
    setMessage('Fleet report downloaded successfully.');
  };

  const buildDonutImage = (labels: string[], values: number[], colors: string[]) => {
    const size = 240;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const total = values.reduce((sum, n) => sum + n, 0) || 1;
    const cx = size / 2;
    const cy = size / 2;
    const radius = 88;
    const innerRadius = 52;

    let start = -Math.PI / 2;
    values.forEach((value, idx) => {
      const angle = (value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = colors[idx] || '#6366f1';
      ctx.fill();
      start += angle;
    });

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(String(total), cx, cy + 6);

    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    labels.forEach((label, idx) => {
      const y = size - 50 + idx * 14;
      ctx.fillStyle = colors[idx] || '#6366f1';
      ctx.fillRect(18, y - 8, 8, 8);
      ctx.fillStyle = '#334155';
      ctx.fillText(`${label}: ${values[idx] ?? 0}`, 32, y);
    });

    return canvas.toDataURL('image/png');
  };

  const downloadFleetPdfReport = () => {
    const now = new Date();
    const fileStamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();

    pdf.setFontSize(18);
    pdf.text('Fleet Connectivity & Compliance Report', 40, 42);
    pdf.setFontSize(10);
    pdf.setTextColor(90, 90, 90);
    pdf.text(`Generated: ${now.toISOString()} | User: ${currentUser.email || currentUser.name || 'Unknown'}`, 40, 60);

    const connectionDonut = buildDonutImage(
      ['Connected', 'Disconnected'],
      [reportSummary.connectedDrivers, reportSummary.disconnectedDrivers],
      ['#16a34a', '#dc2626']
    );
    const staleDonut = buildDonutImage(
      ['Stale >= 3d', 'Stale >= 5d', 'PF Missing'],
      [reportSummary.stale3, reportSummary.stale5, reportSummary.missingPfDate],
      ['#f59e0b', '#ef4444', '#64748b']
    );

    if (connectionDonut) {
      pdf.addImage(connectionDonut, 'PNG', 40, 86, 220, 220);
    }
    if (staleDonut) {
      pdf.addImage(staleDonut, 'PNG', 300, 86, 220, 220);
    }

    autoTable(pdf, {
      startY: 86,
      margin: { left: 550, right: 40 },
      head: [['Indicator', 'Value']],
      body: [
        ['Total Drivers', String(reportSummary.totalDrivers)],
        ['Connected Drivers', String(reportSummary.connectedDrivers)],
        ['Disconnected Drivers', String(reportSummary.disconnectedDrivers)],
        ['Active Violations', String(reportSummary.violations)],
        ['PF Stale >= 3 Days', String(reportSummary.stale3)],
        ['PF Stale >= 5 Days', String(reportSummary.stale5)],
        ['PF Date Missing', String(reportSummary.missingPfDate)]
      ],
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    const boardMap = new Map<string, { total: number; connected: number; disconnected: number; stale3: number; stale5: number }>();
    for (const driver of drivers) {
      const key = driver.board || 'Unassigned';
      const row = boardMap.get(key) || { total: 0, connected: 0, disconnected: 0, stale3: 0, stale5: 0 };
      row.total += 1;
      if (driver.eldStatus === ELDStatus.CONNECTED) row.connected += 1;
      if (driver.eldStatus === ELDStatus.DISCONNECTED) row.disconnected += 1;
      if (driver.lastPFUpdate) {
        const days = Math.floor((Date.now() - new Date(driver.lastPFUpdate).getTime()) / (1000 * 60 * 60 * 24));
        if (days >= 3) row.stale3 += 1;
        if (days >= 5) row.stale5 += 1;
      }
      boardMap.set(key, row);
    }

    autoTable(pdf, {
      startY: 332,
      margin: { left: 40, right: 40 },
      head: [['Board', 'Total', 'Connected', 'Disconnected', 'PF >=3d', 'PF >=5d']],
      body: [...boardMap.entries()].map(([board, row]) => [
        board,
        String(row.total),
        String(row.connected),
        String(row.disconnected),
        String(row.stale3),
        String(row.stale5)
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [15, 23, 42] }
    });

    const driverRows = drivers.map((d) => {
      const staleDays = d.lastPFUpdate ? Math.floor((Date.now() - new Date(d.lastPFUpdate).getTime()) / (1000 * 60 * 60 * 24)) : '';
      return [
        d.name || '',
        d.company || '',
        d.board || '',
        d.eldStatus || '',
        d.dutyStatus || '',
        d.lastPFUpdate ? new Date(d.lastPFUpdate).toLocaleDateString() : 'N/A',
        staleDays === '' ? '' : String(staleDays)
      ];
    });

    autoTable(pdf, {
      startY: (pdf as any).lastAutoTable.finalY + 16,
      margin: { left: 40, right: 40 },
      head: [['Driver', 'Company', 'Board', 'Connection', 'Duty', 'Last PF Update', 'Stale Days']],
      body: driverRows,
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [30, 64, 175] },
      didDrawPage: (data) => {
        pdf.setFontSize(9);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`Page ${data.pageNumber}`, pageWidth - 70, pdf.internal.pageSize.getHeight() - 20);
      }
    });

    pdf.save(`fleet-report-${fileStamp}.pdf`);
    setMessage('PDF report downloaded successfully.');
  };

  const loadEmployees = async () => {
    if (!isAdmin || !currentUser.uid) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/assignments?admin_id=${encodeURIComponent(currentUser.uid)}`));
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      const users: EmployeeRecord[] = data?.assignments || [];
      setEmployees(users);
      if (!selectedEmployeeId && users.length > 0) {
        setSelectedEmployeeId(users[0].id);
      }
    } catch (e: any) {
      setMessage(e.message || 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, [isAdmin, currentUser.uid]);

  useEffect(() => {
    const metaTemplates = selectedEmployee?.email_templates || {};
    setEmailTemplatesDraft({
      connection_driving: metaTemplates.connection_driving || '',
      connection_onduty: metaTemplates.connection_onduty || selectedEmployee?.email_template || '',
      pf_3_day: metaTemplates.pf_3_day || '',
      pf_5_day: metaTemplates.pf_5_day || ''
    });
  }, [selectedEmployeeId, selectedEmployee?.email_template, selectedEmployee?.email_templates]);

  useEffect(() => {
    setLandingHtmlDraft(selectedEmployee?.landing_html || '');
  }, [selectedEmployeeId, selectedEmployee?.landing_html]);

  const uploadLandingMedia = async (file?: File | null) => {
    if (!file) return;
    if (!selectedEmployeeId) {
      setMessage('Select an employee before uploading landing media.');
      return;
    }
    if (!selectedEmployee?.claimed_user_id) {
      setMessage('This user must sign in once before landing media can be saved.');
      return;
    }

    setUploadingLandingMedia(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(apiUrl('/api/admin/landing-media'), {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);

      const snippet = buildLandingMediaSnippet({
        url: String(data?.url || ''),
        mediaType: data?.mediaType === 'video' ? 'video' : 'image',
        label: file.name.replace(/\.[^.]+$/, '')
      });

      setLandingHtmlDraft((prev) => prev.trim() ? `${prev.trim()}\n\n${snippet}` : snippet);
      setMessage(`${file.name} uploaded. Save personalization to publish it on the employee page.`);
    } catch (e: any) {
      setMessage(e.message || 'Failed to upload landing media.');
    } finally {
      setUploadingLandingMedia(false);
    }
  };

  const savePersonalization = async () => {
    if (!isAdmin || !currentUser.uid || !selectedEmployeeId) return;
    if (!selectedEmployee?.claimed_user_id) {
      setMessage('This user has not joined yet. Personalization becomes available after first sign-in.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(apiUrl(`/api/admin/assignments/${selectedEmployeeId}`), {
        method: 'PATCH',
        headers: await getAuthHeaders(true),
        body: JSON.stringify({
          admin_id: currentUser.uid,
          assigned_boards: selectedEmployee?.assigned_boards || [],
          assigned_companies: [],
          landing_html: landingHtmlDraft,
          email_template: emailTemplatesDraft.connection_onduty || selectedEmployee?.email_template || '',
          email_templates: emailTemplatesDraft
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      setMessage('Saved personalization settings.');
      await loadEmployees();
    } catch (e: any) {
      setMessage(e.message || 'Failed to save personalization');
    } finally {
      setSaving(false);
    }
  };

  const runEmailConnectionTest = async () => {
    setTestingConnection(true);
    setMessage('');
    try {
      const res = await fetch(apiUrl('/api/email/test-connection'), {
        method: 'POST',
        headers: await getAuthHeaders()
      });
      const data = await res.json().catch(() => ({}));
      setEmailDiagnostics(data);
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      setMessage(data?.message || 'SMTP connection verified successfully.');
    } catch (e: any) {
      setMessage(e.message || 'Failed to verify SMTP connection');
    } finally {
      setTestingConnection(false);
    }
  };

  const runEmailSendTest = async () => {
    setTestingSend(true);
    setMessage('');
    try {
      const res = await fetch(apiUrl('/api/email/test-send'), {
        method: 'POST',
        headers: await getAuthHeaders(true),
        body: JSON.stringify({ to: testRecipient })
      });
      const data = await res.json().catch(() => ({}));
      setEmailDiagnostics((prev) => ({ ...prev, ...data }));
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      setMessage(data?.message || `Test email sent to ${testRecipient}.`);
    } catch (e: any) {
      setMessage(e.message || 'Failed to send test email');
    } finally {
      setTestingSend(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Appearance</h3>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`px-4 py-2 rounded-lg border text-sm font-bold ${theme === 'light' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 dark:border-slate-700'}`}
          >
            Day Mode
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`px-4 py-2 rounded-lg border text-sm font-bold ${theme === 'dark' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-300 dark:border-slate-700'}`}
          >
            Night Mode
          </button>
          <button
            type="button"
            onClick={downloadFleetReport}
            className="px-4 py-2 rounded-lg border text-sm font-bold border-slate-300 dark:border-slate-700"
          >
            Download Fleet Report (.xlsx)
          </button>
          <button
            type="button"
            onClick={downloadFleetPdfReport}
            className="px-4 py-2 rounded-lg border text-sm font-bold border-slate-300 dark:border-slate-700"
          >
            Download Fleet Report (PDF)
          </button>
        </div>
      </div>

      {isAdmin && (
        <>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Email Diagnostics</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={runEmailConnectionTest}
                  disabled={testingConnection}
                  className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-bold disabled:opacity-50"
                >
                  {testingConnection ? 'Testing SMTP...' : 'Test SMTP Connection'}
                </button>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    placeholder="test@example.com"
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                  <button
                    type="button"
                    onClick={runEmailSendTest}
                    disabled={testingSend || !testRecipient}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50"
                  >
                    {testingSend ? 'Sending...' : 'Send Test Email'}
                  </button>
                </div>
              </div>

              {emailDiagnostics && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-sm">
                  <div><span className="font-bold">Mode:</span> {emailDiagnostics.emailMode || 'unknown'}</div>
                  <div><span className="font-bold">SMTP Host:</span> {emailDiagnostics.smtpHost || 'not set'}</div>
                  <div><span className="font-bold">SMTP Port:</span> {emailDiagnostics.smtpPort || 'not set'}</div>
                  <div><span className="font-bold">From:</span> {emailDiagnostics.smtpFrom || 'not set'}</div>
                  {emailDiagnostics.message && <div><span className="font-bold">Result:</span> {emailDiagnostics.message}</div>}
                  {emailDiagnostics.error && <div className="text-red-600 dark:text-red-400"><span className="font-bold">Error:</span> {emailDiagnostics.error}</div>}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Employee Personalization</h3>
            {loading ? (
              <p className="text-sm text-slate-500">Loading employees...</p>
            ) : (
              <div className="space-y-4">
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="">Select employee</option>
                  {employees.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.email} ({u.email}){u.status === 'pending' ? ' - Pending' : ''}
                    </option>
                  ))}
                </select>

                {selectedEmployee && !selectedEmployee.claimed_user_id && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    This assignment is still pending. The user must sign in once before landing pages and templates can be saved.
                  </p>
                )}

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Employee Landing Page</label>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Add notes, images, or videos for the employee dashboard. Uploaded media is inserted into the editor as HTML.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/webm,video/ogg,video/quicktime"
                      disabled={uploadingLandingMedia || !selectedEmployee?.claimed_user_id}
                      onChange={(e) => {
                        void uploadLandingMedia(e.target.files?.[0]);
                        e.currentTarget.value = '';
                      }}
                      className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:font-bold file:text-white hover:file:bg-indigo-700 disabled:opacity-50 dark:text-slate-300"
                    />
                    <button
                      type="button"
                      disabled={!selectedEmployee?.claimed_user_id}
                      onClick={() => setLandingHtmlDraft((prev) => prev.trim()
                        ? `${prev.trim()}\n\n<h3>Team Update</h3>\n<p>Add a note here for this employee.</p>`
                        : '<h3>Team Update</h3>\n<p>Add a note here for this employee.</p>')}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-white disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      Insert Text Block
                    </button>
                  </div>

                  {uploadingLandingMedia && (
                    <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-300">Uploading media...</p>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-slate-500">Landing HTML</label>
                    <textarea
                      value={landingHtmlDraft}
                      onChange={(e) => setLandingHtmlDraft(e.target.value)}
                      rows={10}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-900"
                      placeholder={'<h3>Welcome</h3>\n<p>Add text, images, or videos for this employee.</p>'}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Supported examples: {'<p>'}, {'<h3>'}, {'<img src=\"...\" />'}, {'<video controls src=\"...\"></video>'}
                    </p>
                  </div>

                  <LandingContent
                    html={landingHtmlDraft}
                    title="Preview"
                    subtitle="This is how the employee section will appear on the dashboard."
                    compact
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500">Email Template Menu</label>
                  <select
                    value={activeTemplateKey}
                    onChange={(e) => setActiveTemplateKey(e.target.value as keyof EmailTemplateMap)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  >
                    {templateOptions.map((opt) => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500">Template Body</label>
                  <textarea
                    value={emailTemplatesDraft[activeTemplateKey] || ''}
                    onChange={(e) => setEmailTemplatesDraft((prev) => ({ ...prev, [activeTemplateKey]: e.target.value }))}
                    rows={6}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    placeholder={`Hi {{driver_name}}, ...`}
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Variables: {'{{driver_name}}'}, {'{{driver_email}}'}, {'{{company}}'}, {'{{board}}'}, {'{{stale_days}}'}, {'{{last_pf_update}}'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={savePersonalization}
                  disabled={saving || !selectedEmployeeId || !selectedEmployee?.claimed_user_id}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Personalization'}
                </button>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">Activity Scoreboard</h3>
            {scoreboard.length === 0 ? (
              <p className="text-sm text-slate-500">No activity scored yet.</p>
            ) : (
              <div className="space-y-2">
                {scoreboard.map(([name, points], idx) => (
                  <div key={name} className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    <span className="text-sm font-semibold">{idx + 1}. {name}</span>
                    <span className="text-sm font-black text-indigo-600">{points}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {message && (
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{message}</div>
      )}
    </div>
  );
};
