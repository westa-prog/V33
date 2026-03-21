import React, { useState } from 'react';
import { UserPlus, Shield, X, Check, Loader2 } from 'lucide-react';
import { AuthUser } from '../types';

interface AdminPanelProps {
  currentUser: AuthUser;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser }) => {
  const rawApiBaseUrl = ((import.meta as any).env.VITE_API_URL || '').trim();
  const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // They can type comma separated boards/companies
  const [boardsInput, setBoardsInput] = useState('');
  const [companiesInput, setCompaniesInput] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setMessage({ type: 'error', text: 'Username and password are required.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    const assigned_boards = boardsInput.split(',').map(s => s.trim()).filter(Boolean);
    const assigned_companies = companiesInput.split(',').map(s => s.trim()).filter(Boolean);

    try {
      const payload = JSON.stringify({
        username,
        password,
        admin_id: currentUser.uid,
        admin_email: currentUser.email,
        assigned_boards,
        assigned_companies
      });

      const endpoints = [
        apiBaseUrl ? `${apiBaseUrl}/api/admin/create-user` : '',
        apiBaseUrl ? `${apiBaseUrl}/api/admin-create-user` : '',
        '/api/admin-create-user'
      ].filter(Boolean);

      let data: any = null;
      let lastError = 'Failed to create user';

      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
          });
          data = await res.json();
          if (res.ok) break;
          lastError = data?.error || `Request failed (${res.status})`;
        } catch (err: any) {
          lastError = err?.message || 'Network request failed';
        }
      }

      if (!data?.success) throw new Error(lastError);
      
      setMessage({ type: 'success', text: `Successfully created ${username}. Credentials emailed to ${currentUser.email}.` });
      setUsername('');
      setPassword('');
      setBoardsInput('');
      setCompaniesInput('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
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
                 <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Assigned Boards (Comma Separated)</label>
                 <input 
                   className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                   value={boardsInput}
                   onChange={e => setBoardsInput(e.target.value)}
                   placeholder="e.g. Board A, Night Shift"
                 />
                 <p className="text-xs text-slate-400">Leave blank to grant access to all boards.</p>
              </div>

              <div className="space-y-2">
                 <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Assigned Companies (Comma Separated)</label>
                 <input 
                   className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                   value={companiesInput}
                   onChange={e => setCompaniesInput(e.target.value)}
                   placeholder="e.g. Amazon, FedEx"
                 />
                 <p className="text-xs text-slate-400">Leave blank to grant access to all companies.</p>
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
       </div>
    </div>
  );
}
