import React, { useState } from 'react';
import { UserPlus, Shield, X, Check, Loader2 } from 'lucide-react';
import { AuthUser } from '../types';

interface AdminPanelProps {
  currentUser: AuthUser;
}

type AssignmentRecord = {
  id: string;
  email: string;
  name?: string;
  assigned_boards?: string[];
  assigned_companies?: string[];
  status: 'pending' | 'active';
  claimed_user_id?: string | null;
  joined_at?: string | null;
  invited_at?: string | null;
};

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser }) => {
  const rawApiBaseUrl = ((import.meta as any).env.VITE_API_URL || '').trim();
  const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '');
  const apiUrl = (path: string) => apiBaseUrl ? `${apiBaseUrl}${path}` : path;
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [selectedBoards, setSelectedBoards] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [savingAssignmentId, setSavingAssignmentId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [boardDrafts, setBoardDrafts] = useState<Record<string, string[]>>({});
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});

  const boardOptions = ['Board A', 'Board B', 'Board C'];

  const loadAssignments = async () => {
    if (!currentUser.uid) return;
    setAssignmentsLoading(true);
    try {
      const endpoint = apiUrl(`/api/admin/assignments?admin_id=${encodeURIComponent(currentUser.uid)}`);
      const res = await fetch(endpoint);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      const rows = data?.assignments || [];
      setAssignments(rows);

      const nextBoards: Record<string, string[]> = {};
      const nextNames: Record<string, string> = {};
      for (const row of rows) {
        nextBoards[row.id] = row.assigned_boards || [];
        nextNames[row.id] = row.name || '';
      }
      setBoardDrafts(nextBoards);
      setNameDrafts(nextNames);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load assigned users.' });
    } finally {
      setAssignmentsLoading(false);
    }
  };

  React.useEffect(() => {
    loadAssignments();
  }, [currentUser.uid]);

  const toggleBoard = (board: string) => {
    setSelectedBoards((prev) => prev.includes(board) ? prev.filter((b) => b !== board) : [...prev, board]);
  };

  const toggleAssignmentBoard = (assignmentId: string, board: string) => {
    const current = boardDrafts[assignmentId] || [];
    const next = current.includes(board) ? current.filter((b) => b !== board) : [...current, board];
    setBoardDrafts((prev) => ({ ...prev, [assignmentId]: next }));
  };

  const handleAssignUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Employee email is required.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const endpoint = apiUrl('/api/admin/assign-user');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name,
          admin_id: currentUser.uid,
          assigned_boards: selectedBoards,
          assigned_companies: []
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);

      setMessage({ type: 'success', text: data?.message || 'User access assigned successfully.' });
      setEmail('');
      setName('');
      setSelectedBoards([]);
      await loadAssignments();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to assign user access.' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAssignment = async (assignmentId: string) => {
    if (!currentUser.uid) return;
    setSavingAssignmentId(assignmentId);
    setMessage(null);

    try {
      const endpoint = apiUrl(`/api/admin/assignments/${assignmentId}`);
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: currentUser.uid,
          name: nameDrafts[assignmentId] || '',
          assigned_boards: boardDrafts[assignmentId] || [],
          assigned_companies: []
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      setMessage({ type: 'success', text: 'Access updated successfully.' });
      await loadAssignments();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update access.' });
    } finally {
      setSavingAssignmentId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto mt-8">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl">
            <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Assign Real User Access</h2>
            <p className="text-sm text-slate-500">Assign boards to a real email. Access is claimed automatically after the user signs in.</p>
          </div>
        </div>

        {message && (
          <div className={`p-4 mb-6 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        <form onSubmit={handleAssignUser} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Employee Email</label>
              <input
                type="email"
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@gmail.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Display Name</label>
              <input
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Assign Boards</label>
            <div className="grid grid-cols-3 gap-2">
              {boardOptions.map((board) => {
                const isSelected = selectedBoards.includes(board);
                return (
                  <button
                    key={board}
                    type="button"
                    onClick={() => toggleBoard(board)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-all ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {board}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-400">Leave all unselected to keep the user unrestricted until you tighten access later.</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
            {loading ? 'Saving Access...' : 'Assign Access'}
          </button>
        </form>

        <div className="mt-10 border-t border-slate-200 dark:border-slate-800 pt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Assigned Users</h3>
            <button
              type="button"
              onClick={loadAssignments}
              className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>

          {assignmentsLoading ? (
            <div className="text-sm text-slate-500">Loading assigned users...</div>
          ) : assignments.length === 0 ? (
            <div className="text-sm text-slate-500">No assigned users yet.</div>
          ) : (
            <div className="space-y-4">
              {assignments.map((assignment) => (
                <div key={assignment.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50 dark:bg-slate-800/40">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{assignment.name || assignment.email}</p>
                      <p className="text-xs text-slate-500">{assignment.email}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${assignment.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {assignment.status === 'active' ? 'Joined' : 'Pending'}
                    </span>
                  </div>

                  <div className="mb-3">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Display Name</label>
                    <input
                      type="text"
                      value={nameDrafts[assignment.id] || ''}
                      onChange={(e) => setNameDrafts((prev) => ({ ...prev, [assignment.id]: e.target.value }))}
                      placeholder="Optional"
                      className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>

                  <div className="mb-3">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Assigned Boards</p>
                    <div className="grid grid-cols-3 gap-2">
                      {boardOptions.map((board) => {
                        const isSelected = (boardDrafts[assignment.id] || []).includes(board);
                        return (
                          <button
                            key={`${assignment.id}-${board}`}
                            type="button"
                            onClick={() => toggleAssignmentBoard(assignment.id, board)}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold border ${isSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'}`}
                          >
                            {board}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mb-3 text-xs text-slate-500">
                    {assignment.status === 'active'
                      ? `Joined${assignment.joined_at ? ` on ${new Date(assignment.joined_at).toLocaleString()}` : ''}.`
                      : `Waiting for first sign-in${assignment.invited_at ? ` since ${new Date(assignment.invited_at).toLocaleString()}` : ''}.`}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUpdateAssignment(assignment.id)}
                    disabled={savingAssignmentId === assignment.id}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50"
                  >
                    {savingAssignmentId === assignment.id ? 'Saving...' : 'Save Access'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
