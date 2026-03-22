import React, { useState } from 'react';
import { UserPlus, Shield, X, Check, Loader2 } from 'lucide-react';
import { AuthUser } from '../types';

interface AdminPanelProps {
  currentUser: AuthUser;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser }) => {
  const rawApiBaseUrl = ((import.meta as any).env.VITE_API_URL || '').trim();
  const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '');
  const apiUrl = (path: string) => apiBaseUrl ? `${apiBaseUrl}${path}` : path;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedBoards, setSelectedBoards] = useState<string[]>([]);
  const [employees, setEmployees] = useState<Array<{
    id: string;
    email: string;
    name?: string;
    assigned_boards?: string[];
    assigned_companies?: string[];
  }>>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);
  const [boardDrafts, setBoardDrafts] = useState<Record<string, string[]>>({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});

  const loadEmployees = async () => {
    if (!currentUser.uid) return;
    setEmployeesLoading(true);
    try {
      const endpoint = apiUrl(`/api/admin/users?admin_id=${encodeURIComponent(currentUser.uid)}`);
      const res = await fetch(endpoint);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      const users = data?.users || [];
      setEmployees(users);
      const nextBoards: Record<string, string[]> = {};
      const nextPasswords: Record<string, string> = {};
      for (const user of users) {
        nextBoards[user.id] = user.assigned_boards || [];
        nextPasswords[user.id] = '';
      }
      setBoardDrafts(nextBoards);
      setPasswordDrafts(nextPasswords);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load employees.' });
    } finally {
      setEmployeesLoading(false);
    }
  };

  React.useEffect(() => {
    loadEmployees();
  }, [currentUser.uid]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setMessage({ type: 'error', text: 'Username and password are required.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    const assigned_boards = selectedBoards;
    const assigned_companies: string[] = [];

    try {
      const payload = JSON.stringify({
        username,
        password,
        admin_id: currentUser.uid,
        admin_email: currentUser.email,
        assigned_boards,
        assigned_companies
      });

      const endpoint = apiUrl('/api/admin/create-user');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });

      const data = await res.json();
      if (!res.ok) {
        if (data?.userCreated) {
          throw new Error(`${data?.error} Login email: ${data?.loginEmail}`);
        }
        throw new Error(data?.error || `Request failed (${res.status})`);
      }
      
      setMessage({ type: 'success', text: `Successfully created ${username}. Credentials sent to ${currentUser.email}.` });
      setUsername('');
      setPassword('');
      setSelectedBoards([]);
      await loadEmployees();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const toggleBoard = (board: string) => {
    setSelectedBoards(prev => prev.includes(board) ? prev.filter(b => b !== board) : [...prev, board]);
  };

  const boardOptions = ['Board A', 'Board B', 'Board C'];

  const toggleEmployeeBoard = (userId: string, board: string) => {
    const current = boardDrafts[userId] || [];
    const next = current.includes(board) ? current.filter(b => b !== board) : [...current, board];
    setBoardDrafts(prev => ({ ...prev, [userId]: next }));
  };

  const handleUpdateEmployee = async (userId: string) => {
    if (!currentUser.uid) return;
    setSavingUserId(userId);
    setMessage(null);
    try {
      const endpoint = apiUrl(`/api/admin/users/${userId}`);
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: currentUser.uid,
          assigned_boards: boardDrafts[userId] || [],
          assigned_companies: [],
          password: (passwordDrafts[userId] || '').trim() || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      setPasswordDrafts(prev => ({ ...prev, [userId]: '' }));
      setMessage({ type: 'success', text: 'Employee updated successfully.' });
      await loadEmployees();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update employee.' });
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-8">
       <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-8">
           <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl">
                 <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-white">Create Employee Account</h2>
                  <p className="text-sm text-slate-500">Configure multi-tenant access parameters for a new team member.</p>
              </div>
           </div>

           {message && (
             <div className={`p-4 mb-6 rounded-lg flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                 {message.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                 <p className="text-sm font-medium">{message.text}</p>
             </div>
           )}

           <form onSubmit={handleCreateUser} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Employee Username</label>
                     <input 
                       className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                       value={username}
                       onChange={e => setUsername(e.target.value)}
                       placeholder="e.g. John Doe"
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Password</label>
                     <input 
                       type="text"
                       className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                       value={password}
                       onChange={e => setPassword(e.target.value)}
                       placeholder="Enter a secure password"
                     />
                  </div>
              </div>

              <div className="space-y-2">
                 <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Assign Boards</label>
                 <div className="grid grid-cols-3 gap-2">
                  {boardOptions.map(board => {
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
                 <p className="text-xs text-slate-400">Leave all unselected to grant access to all boards.</p>
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all disabled:opacity-50"
              >
                 {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                 {loading ? 'Provisioning Account...' : 'Generate Employee Credentials'}
              </button>
           </form>

           <div className="mt-10 border-t border-slate-200 dark:border-slate-800 pt-8">
             <div className="flex items-center justify-between mb-4">
               <h3 className="text-lg font-bold text-slate-800 dark:text-white">Existing Employees</h3>
               <button
                 type="button"
                 onClick={loadEmployees}
                 className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
               >
                 Refresh
               </button>
             </div>

             {employeesLoading ? (
               <div className="text-sm text-slate-500">Loading employees...</div>
             ) : employees.length === 0 ? (
               <div className="text-sm text-slate-500">No employees found for this admin.</div>
             ) : (
               <div className="space-y-4">
                 {employees.map(employee => (
                   <div key={employee.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50 dark:bg-slate-800/40">
                     <div className="mb-3">
                       <p className="font-semibold text-slate-900 dark:text-white">{employee.name || employee.email}</p>
                       <p className="text-xs text-slate-500">{employee.email}</p>
                     </div>

                     <div className="mb-3">
                       <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Assigned Boards</p>
                       <div className="grid grid-cols-3 gap-2">
                         {boardOptions.map(board => {
                           const isSelected = (boardDrafts[employee.id] || []).includes(board);
                           return (
                             <button
                               key={`${employee.id}-${board}`}
                               type="button"
                               onClick={() => toggleEmployeeBoard(employee.id, board)}
                               className={`px-3 py-2 rounded-lg text-xs font-semibold border ${isSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'}`}
                             >
                               {board}
                             </button>
                           );
                         })}
                       </div>
                     </div>

                     <div className="mb-3">
                       <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Update Password (optional)</label>
                       <input
                         type="text"
                         value={passwordDrafts[employee.id] || ''}
                         onChange={(e) => setPasswordDrafts(prev => ({ ...prev, [employee.id]: e.target.value }))}
                         placeholder="Min 8 chars to reset"
                         className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                       />
                     </div>

                     <button
                       type="button"
                       onClick={() => handleUpdateEmployee(employee.id)}
                       disabled={savingUserId === employee.id}
                       className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold disabled:opacity-50"
                     >
                       {savingUserId === employee.id ? 'Saving...' : 'Save Changes'}
                     </button>
                   </div>
                 ))}
               </div>
             )}
           </div>
       </div>
    </div>
  );
}
