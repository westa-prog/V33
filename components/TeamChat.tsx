import React, { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send, Users } from 'lucide-react';
import { AuthUser, TeamMessage } from '../types';

interface TeamChatProps {
  currentUser: AuthUser | null;
  messages: TeamMessage[];
  onSend: (body: string) => Promise<void>;
}

export const TeamChat: React.FC<TeamChatProps> = ({ currentUser, messages, onSend }) => {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const currentUserId = currentUser?.uid || '';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextMessage = draft.trim();
    if (!nextMessage || sending) return;

    setSending(true);
    try {
      await onSend(nextMessage);
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 bg-white/90 p-4 dark:border-slate-800 dark:bg-slate-950/80">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-indigo-600 p-2 text-white shadow-lg shadow-indigo-500/20">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Team Chat</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Live workspace room for admins and employees.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-900">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center dark:border-slate-700 dark:bg-slate-950/50">
            <MessageSquare className="mb-3 h-10 w-10 text-slate-400" />
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Start the conversation</h3>
            <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
              Use this room for admin notes, fast questions, recognition posts, and team coordination.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const isOwn = message.senderUserId === currentUserId;
            return (
              <div key={message.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl border px-4 py-3 shadow-sm ${
                  isOwn
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                }`}>
                  <div className={`mb-1 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] ${
                    isOwn ? 'text-indigo-100' : 'text-slate-400'
                  }`}>
                    <span>{message.senderName}</span>
                    <span>{message.senderRole || 'user'}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                  <div className={`mt-2 text-[11px] font-medium ${isOwn ? 'text-indigo-100/90' : 'text-slate-400'}`}>
                    {new Date(message.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-end gap-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a live message to the team..."
            rows={3}
            className="min-h-[84px] flex-1 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
};
