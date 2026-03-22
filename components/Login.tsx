import React, { useMemo, useState } from 'react';
import { AuthUser } from '../types';
import { ArrowLeft, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { Card } from './ui/card';
import { motion } from 'framer-motion';
import { supabase } from '../supabase';
import Hero from './ui/animated-shader-hero';

const normalizeAuthRole = (value: unknown): AuthUser['role'] => {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'admin' || role === 'employee' || role === 'user') return role;
  return undefined;
};

interface LoginProps {
  onLogin: (user: AuthUser) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [view, setView] = useState<'landing' | 'auth'>('landing');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const buildAuthUser = useMemo(
    () => (signedInUser: any): AuthUser => ({
      uid: signedInUser.id,
      email: signedInUser.email || email,
      name: (signedInUser.user_metadata?.full_name as string) || email.split('@')[0],
      role: normalizeAuthRole(signedInUser.user_metadata?.role),
      adminId: (signedInUser.user_metadata?.admin_id as string) || undefined,
      assignedBoards: Array.isArray(signedInUser.user_metadata?.assigned_boards)
        ? signedInUser.user_metadata.assigned_boards
        : (signedInUser.user_metadata?.assigned_board ? [signedInUser.user_metadata.assigned_board] : []),
      assignedBoard: Array.isArray(signedInUser.user_metadata?.assigned_boards) && signedInUser.user_metadata.assigned_boards.length > 0
        ? signedInUser.user_metadata.assigned_boards[0]
        : (signedInUser.user_metadata?.assigned_board as string) || undefined,
      assignedCompanies: Array.isArray(signedInUser.user_metadata?.assigned_companies)
        ? signedInUser.user_metadata.assigned_companies
        : (signedInUser.user_metadata?.assigned_company ? [signedInUser.user_metadata.assigned_company] : []),
      landingHtml: (signedInUser.user_metadata?.landing_html as string) || '',
      emailTemplate: (signedInUser.user_metadata?.email_template as string) || '',
      emailTemplates: typeof signedInUser.user_metadata?.email_templates === 'object' && signedInUser.user_metadata?.email_templates
        ? signedInUser.user_metadata.email_templates
        : undefined
    }),
    [email]
  );

  const openAuth = (nextMode: 'signin' | 'signup' = 'signin') => {
    setMode(nextMode);
    setView('auth');
  };

  const handleGoogleAppLogin = async () => {
    try {
      setIsSubmitting(true);
      setMessage('');
      const redirectTo = window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo }
      });
      if (error) throw error;
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Google login failed.');
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage('');

    try {
      if (mode === 'signup') {
        const signUpResult = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim() || email.split('@')[0]
            }
          }
        });
        if (signUpResult.error) throw signUpResult.error;

        if (signUpResult.data.session?.user) {
          onLogin(buildAuthUser(signUpResult.data.session.user));
          return;
        }

        setMessage('Account created. Check your email to verify, then sign in with the same assigned address.');
        setMode('signin');
        return;
      }

      const signInResult = await supabase.auth.signInWithPassword({ email, password });
      if (signInResult.error) throw signInResult.error;
      onLogin(buildAuthUser(signInResult.data.user));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-black">
      {view === 'landing' ? (
        <Hero
          trustBadge={{ text: 'Trusted fleet operations workspace for assigned teams.' }}
          headline={{ line1: 'Run Your Board', line2: 'From One Place' }}
          subtitle="Track drivers, manage follow-up, send broadcasts, and enter with the email your admin assigned to you."
          buttons={{
            primary: { text: 'Get Started', onClick: () => openAuth('signin') },
            secondary: { text: 'Login', onClick: () => openAuth('signin') }
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
          >
            <Card className="border-neutral-800 bg-neutral-950/55 shadow-2xl backdrop-blur-xl">
              <div className="p-6 md:p-8">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-amber-100">
                  <ShieldCheck className="h-4 w-4 text-amber-300" />
                  Fleet Access
                </div>
                <h2 className="text-2xl font-black tracking-tight text-white md:text-3xl">One link. One login. Full board access.</h2>
                <p className="mt-3 text-sm leading-6 text-neutral-400 md:text-base">
                  Start from the landing page, then continue to the secure login screen. After sign-in, assigned users automatically receive their boards and role access.
                </p>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500">Step 1</p>
                    <p className="mt-2 text-sm font-semibold text-white">Open the app link</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500">Step 2</p>
                    <p className="mt-2 text-sm font-semibold text-white">Press Login or Get Started</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-500">Step 3</p>
                    <p className="mt-2 text-sm font-semibold text-white">Sign in with your assigned email</p>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </Hero>
      ) : (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(251,146,60,0.14),transparent_28%),linear-gradient(180deg,#020617,#000000)] px-4 py-8 md:px-8">
          <div className="mx-auto max-w-6xl">
            <button
              type="button"
              onClick={() => setView('landing')}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-bold text-white transition hover:bg-white/[0.1]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Landing
            </button>

            <div className="grid items-start gap-8 lg:grid-cols-[1fr_0.9fr]">
              <div className="pt-6">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-amber-100">
                  <ShieldCheck className="h-4 w-4 text-amber-300" />
                  Secure Access
                </div>
                <h1 className="text-4xl font-black tracking-[-0.05em] text-white md:text-6xl">Login to continue</h1>
                <p className="mt-4 max-w-xl text-base leading-7 text-neutral-400 md:text-lg">
                  Use the email your admin assigned to you. After the first successful sign-in, your role and board access will be applied automatically.
                </p>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
              >
                <Card className="border-neutral-800 bg-neutral-950/70 shadow-2xl backdrop-blur-xl">
                  <div className="p-6 md:p-8">
                    <div className="mb-6">
                      <div className="mb-3 inline-flex items-center justify-center rounded-2xl bg-amber-500/15 p-3 shadow-lg shadow-amber-500/10">
                        <ShieldCheck className="h-6 w-6 text-amber-200" />
                      </div>
                      <h2 className="text-2xl font-black tracking-tight text-white">{mode === 'signin' ? 'Secure Sign In' : 'Create Your Access'}</h2>
                      <p className="mt-2 text-sm text-neutral-400">
                        {mode === 'signin'
                          ? 'Use the email assigned by your admin or continue with Google.'
                          : 'Create your account with the assigned email so your board access can be claimed automatically.'}
                      </p>
                    </div>

                    <div className="mb-6 grid grid-cols-2 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-1">
                      <button
                        type="button"
                        onClick={() => setMode('signin')}
                        className={`rounded-xl px-4 py-3 text-sm font-black transition ${mode === 'signin' ? 'bg-amber-400 text-slate-950' : 'text-neutral-400 hover:text-white'}`}
                      >
                        Sign In
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode('signup')}
                        className={`rounded-xl px-4 py-3 text-sm font-black transition ${mode === 'signup' ? 'bg-amber-400 text-slate-950' : 'text-neutral-400 hover:text-white'}`}
                      >
                        Sign Up
                      </button>
                    </div>

                    {message && (
                      <div className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                        {message}
                      </div>
                    )}

                    <button
                      onClick={handleGoogleAppLogin}
                      disabled={isSubmitting}
                      className="mb-5 w-full rounded-xl border border-neutral-300 bg-white py-3 font-bold text-slate-900 transition-all hover:bg-neutral-100 disabled:opacity-60"
                    >
                      Sign in with Google
                    </button>

                    <form onSubmit={handleSubmit} className="space-y-5">
                      {mode === 'signup' && (
                        <div>
                          <label className="mb-2 ml-1 block text-xs font-bold uppercase text-neutral-500">Full Name</label>
                          <div className="relative">
                            <User className="absolute left-3 top-3 h-5 w-5 text-neutral-500" />
                            <input
                              type="text"
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              required={mode === 'signup'}
                              className="w-full rounded-xl border border-neutral-800 bg-neutral-900/50 py-3 pl-10 pr-4 text-white outline-none transition-all placeholder-neutral-600 focus:ring-2 focus:ring-amber-500"
                              placeholder="Enter your full name"
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="mb-2 ml-1 block text-xs font-bold uppercase text-neutral-500">Email Address</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-5 w-5 text-neutral-500" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full rounded-xl border border-neutral-800 bg-neutral-900/50 py-3 pl-10 pr-4 text-white outline-none transition-all placeholder-neutral-600 focus:ring-2 focus:ring-amber-500"
                            placeholder="you@company.com"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 ml-1 block text-xs font-bold uppercase text-neutral-500">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 h-5 w-5 text-neutral-500" />
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full rounded-xl border border-neutral-800 bg-neutral-900/50 py-3 pl-10 pr-4 text-white outline-none transition-all placeholder-neutral-600 focus:ring-2 focus:ring-amber-500"
                            placeholder={mode === 'signin' ? 'Enter your password' : 'Create a password'}
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full rounded-2xl bg-gradient-to-r from-orange-500 to-yellow-400 py-4 font-black text-slate-950 transition-all hover:brightness-105 disabled:opacity-60"
                      >
                        {isSubmitting ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
                      </button>
                    </form>
                  </div>
                </Card>
              </motion.div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
