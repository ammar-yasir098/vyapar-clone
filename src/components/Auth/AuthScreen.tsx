import React, { useState } from 'react';
import { Store, Lock, Mail, User as UserIcon, Phone, Building2, ArrowRight, ShieldCheck, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { API_BASE_URL } from '../../services/api';

export interface AuthUser {
  userId: string;
  tenantId: string;
  fullName: string;
  email: string;
  phone?: string;
  role: string;
  token: string;
}

interface AuthScreenProps {
  onAuthSuccess: (session: AuthUser) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? `${API_BASE_URL}/auth/login` : `${API_BASE_URL}/auth/register`;
      const bodyPayload = mode === 'login'
        ? { email, password }
        : { businessName: businessName || 'Company', fullName, email, phone, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Authentication failed. Please check your credentials.');
      }

      const session: AuthUser = {
        userId: data.user.userId,
        tenantId: data.user.tenantId,
        fullName: data.user.fullName,
        email: data.user.email,
        phone: data.user.phone,
        role: data.user.role || 'OWNER',
        token: data.token
      };

      onAuthSuccess(session);
    } catch (err: any) {
      console.error('Auth Error:', err);
      setErrorMessage(err.message || 'Unable to connect to authentication server. Please check network connection.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = () => {
    setEmail('admin@vyapar.com');
    setPassword('admin123');
    setMode('login');
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Dynamic Ambient Background Glows */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* Main Glassmorphism Auth Container */}
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl backdrop-blur-xl p-8 z-10 flex flex-col gap-6">
        
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
            <Store className="w-7 h-7 stroke-[2.5]" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-1.5 mt-2">
            Vyapar POS <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold border border-blue-500/30 uppercase tracking-widest">Enterprise</span>
          </h1>
          <p className="text-xs font-semibold text-slate-400">
            Cloud Multi-Tenant Authentication & Offline-First POS
          </p>
        </div>

        {/* Auth Mode Tabs */}
        <div className="grid grid-cols-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800/80">
          <button
            type="button"
            onClick={() => { setMode('login'); setErrorMessage(null); }}
            className={`py-2 text-xs font-extrabold rounded-xl transition-all ${
              mode === 'login'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setErrorMessage(null); }}
            className={`py-2 text-xs font-extrabold rounded-xl transition-all ${
              mode === 'register'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-2xl flex items-start gap-2.5 text-rose-400 text-xs font-bold animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          
          {/* Registration Fields */}
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                  Business / Store Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    placeholder="e.g. SuperMarket Retailers"
                    className="w-full h-10 pl-9 pr-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-bold text-white outline-none focus:border-blue-500 transition"
                  />
                  <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="e.g. Ammar Yasir"
                    className="w-full h-10 pl-9 pr-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-bold text-white outline-none focus:border-blue-500 transition"
                  />
                  <UserIcon className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                  Phone Number (Optional)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+92 300 xxxxxxx"
                    className="w-full h-10 pl-9 pr-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-bold text-white outline-none focus:border-blue-500 transition"
                  />
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                </div>
              </div>
            </>
          )}

          {/* Email Address */}
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@vyapar.com"
                className="w-full h-10 pl-9 pr-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-bold text-white outline-none focus:border-blue-500 transition"
              />
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-10 pl-9 pr-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs font-bold text-white outline-none focus:border-blue-500 transition"
              />
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            </div>
          </div>

          {/* Submit Action Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-50 mt-2"
          >
            {loading ? (
              <span>Authenticating with Cloud Server...</span>
            ) : (
              <>
                <span>{mode === 'login' ? 'Sign In to Account' : 'Register & Create Store'}</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </>
            )}
          </button>
        </form>

        {/* Demo Quick Login Helper */}
        {mode === 'login' && (
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 font-semibold">Testing app flow?</span>
            <button
              type="button"
              onClick={fillDemoAccount}
              className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 hover:underline cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Fill Demo Admin</span>
            </button>
          </div>
        )}

        {/* Security & Offline Feature Badges */}
        <div className="flex items-center justify-center gap-4 text-[10px] text-slate-500 font-bold tracking-wide uppercase pt-2">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            256-Bit SSL Cloud
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
            Full Offline POS Mode
          </span>
        </div>
      </div>
    </div>
  );
};
