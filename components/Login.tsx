import React, { useMemo, useRef, useState } from 'react';
import { AuthUser } from '../types';
import { Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { Card } from './ui/card';
import { motion } from 'framer-motion';
import { supabase } from '../supabase';
import Hero from './ui/animated-shader-hero';

interface LoginProps {
  onLogin: (user: AuthUser) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const authSectionRef = useRef<HTMLDivElement>(null);
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
      role: (signedInUser.user_metadata?.role as string) || undefined,
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

  const scrollToAuth = (nextMode: 'signin' | 'signup') => {
    setMode(nextMode);
    requestAnimationFrame(() => {
      authSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
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
      <Hero
        trustBadge={{ text: 'Trusted fleet operations workspace for assigned teams.' }}
        headline={{ line1: 'Run Your Board', line2: 'From One Place' }}
        subtitle="Track drivers, manage follow-up, send broadcasts, and enter with the email your admin assigned to you."
        buttons={{
          primary: { text: 'Create Account', onClick: () => scrollToAuth('signup') },
          secondary: { text: 'Sign In', onClick: () => scrollToAuth('signin') }
        }}
      >
        <motion.div
          ref={authSectionRef}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
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
      </Hero>
    </div>
  );
};
