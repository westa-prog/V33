import React, { useEffect, useMemo, useState } from 'react';
import { AuthUser, EmailLogEntry } from '../types';

interface SettingsPanelProps {
  currentUser: AuthUser;
  isAdmin: boolean;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  emailLogs: EmailLogEntry[];
}

type EmployeeRecord = {
  id: string;
  email: string;
  name?: string;
  assigned_boards?: string[];
  landing_html?: string;
  email_template?: string;
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ currentUser, isAdmin, theme, setTheme, emailLogs }) => {
  const rawApiBaseUrl = ((import.meta as any).env.VITE_API_URL || '').trim();
  const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '');
  const apiUrl = (path: string) => (apiBaseUrl ? `${apiBaseUrl}${path}` : path);

  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [landingHtml, setLandingHtml] = useState('');
  const [emailTemplate, setEmailTemplate] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>('');

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

  const loadEmployees = async () => {
    if (!isAdmin || !currentUser.uid) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/users?admin_id=${encodeURIComponent(currentUser.uid)}`));
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      const users: EmployeeRecord[] = data?.users || [];
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
    setLandingHtml(selectedEmployee?.landing_html || '');
    setEmailTemplate(selectedEmployee?.email_template || '');
  }, [selectedEmployeeId, selectedEmployee?.landing_html, selectedEmployee?.email_template]);

  const savePersonalization = async () => {
    if (!isAdmin || !currentUser.uid || !selectedEmployeeId) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(apiUrl(`/api/admin/users/${selectedEmployeeId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: currentUser.uid,
          assigned_boards: selectedEmployee?.assigned_boards || [],
          assigned_companies: [],
          landing_html: landingHtml,
          email_template: emailTemplate
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
            onClick={() => window.print()}
            className="px-4 py-2 rounded-lg border text-sm font-bold border-slate-300 dark:border-slate-700"
          >
            Print Logs (PDF)
          </button>
        </div>
      </div>

      {isAdmin && (
        <>
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
                      {u.name || u.email} ({u.email})
                    </option>
                  ))}
                </select>

                <div>
                  <label className="text-xs font-semibold text-slate-500">Landing HTML</label>
                  <textarea
                    value={landingHtml}
                    onChange={(e) => setLandingHtml(e.target.value)}
                    rows={8}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                    placeholder="<html>...</html>"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500">Email Template</label>
                  <textarea
                    value={emailTemplate}
                    onChange={(e) => setEmailTemplate(e.target.value)}
                    rows={6}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    placeholder="Hi {{driver_name}}, ... "
                  />
                </div>

                <button
                  type="button"
                  onClick={savePersonalization}
                  disabled={saving || !selectedEmployeeId}
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

