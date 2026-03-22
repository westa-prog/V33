import React, { useState } from 'react';
import { AuthUser } from '../types';
import { Mail, Lock, ShieldCheck } from 'lucide-react';
import { SplineScene } from './ui/splite';
import { Card } from './ui/card';
import { Spotlight } from './ui/spotlight';
import { HeroBackground } from './ui/shape-landing-hero';
import { motion } from 'framer-motion';
import { supabase } from '../supabase';

interface LoginProps {
  onLogin: (user: AuthUser) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogleAppLogin = async () => {
    try {
      setIsSubmitting(true);
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

    try {
      const signInResult = await supabase.auth.signInWithPassword({ email, password });
      if (signInResult.error) {
        throw signInResult.error;
      }

      const signedInUser = signInResult.data.user;
      onLogin({
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
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4 md:p-8 relative overflow-hidden">
      <HeroBackground className="opacity-100" />
      <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="white" />

      <Card className="w-full max-w-6xl h-auto md:h-[700px] bg-neutral-900/50 backdrop-blur-xl border-neutral-800 relative overflow-hidden shadow-2xl z-10">
        <div className="flex flex-col md:flex-row h-full">
          <div className="w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center border-b md:border-b-0 md:border-r border-neutral-800 bg-neutral-950/30">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-8"
            >
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 mb-6 shadow-xl shadow-indigo-500/20">
                <ShieldCheck className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">Leader A1</h1>
              <p className="text-neutral-400 mt-2">Fleet operations workspace for teams, messaging, and compliance tracking.</p>
            </motion.div>

            <div className="flex flex-col gap-3 mb-8">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 text-sm text-neutral-300">
                Sign in with the email assigned to your account.
              </div>

              <div className="flex items-center gap-3 text-xs text-neutral-500 uppercase font-bold">
                <div className="h-px bg-neutral-800 flex-1" />
                <span>Secure email login</span>
                <div className="h-px bg-neutral-800 flex-1" />
              </div>
            </div>

            <button
              onClick={handleGoogleAppLogin}
              disabled={isSubmitting}
              className="w-full mb-5 py-3 bg-white text-slate-900 rounded-xl font-bold border border-neutral-300 hover:bg-neutral-100 transition-all disabled:opacity-60"
            >
              Sign in with Google
            </button>

            <form onSubmit={handleSubmit} className="space-y-5">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <label className="block text-xs font-bold text-neutral-500 uppercase mb-2 ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-5 h-5 text-neutral-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-3 bg-neutral-900/50 border border-neutral-800 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none transition-all text-white placeholder-neutral-600"
                    placeholder="admin@leader-a1.com"
                  />
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <label className="block text-xs font-bold text-neutral-500 uppercase mb-2 ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-5 h-5 text-neutral-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-3 bg-neutral-900/50 border border-neutral-800 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none transition-all text-white placeholder-neutral-600"
                    placeholder="Enter your password"
                  />
                </div>
              </motion.div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-indigo-600/30 disabled:opacity-60"
              >
                {isSubmitting ? 'Please wait...' : 'Sign In'}
              </motion.button>
            </form>
          </div>

          <div className="hidden md:block w-1/2 relative bg-neutral-950 overflow-hidden">
            <div className="absolute inset-0 z-10 flex flex-col justify-end p-12 bg-gradient-to-t from-neutral-950 via-transparent to-transparent pointer-events-none">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <h2 className="text-4xl font-bold text-white mb-2">Operate from one place.</h2>
                <p className="text-neutral-400 max-w-md">
                  Manage drivers, send broadcast communications, and keep your operation organized with Supabase, Gemini, and a deployable Node backend.
                </p>
              </motion.div>
            </div>
            <SplineScene
              scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
              className="w-full h-full opacity-60"
            />
          </div>
        </div>
      </Card>

    </div>
  );
};
