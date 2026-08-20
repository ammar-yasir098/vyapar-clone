import React, { useState, useEffect } from 'react';
import {
  Store, Lock, Mail, User as UserIcon, Phone, Building2,
  ArrowRight, ShieldCheck, Sparkles, CheckCircle2, AlertCircle,
  Eye, EyeOff, TrendingUp, Package, Users, Receipt, KeyRound, ArrowLeft
} from 'lucide-react';
import { API_BASE_URL, requestForgotPassword, resetPassword } from '../../services/api';

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

// Animated stat card for the left panel
const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string; delay: number }> =
  ({ icon, label, value, color, delay }) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-700"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(10px)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
      }}
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: `${color}22` }}
      >
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <div className="text-white text-sm font-bold">{value}</div>
        <div className="text-slate-400 text-[11px]">{label}</div>
      </div>
    </div>
  );
};

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  // Password Reset fields
  const [resetTokenInput, setResetTokenInput] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  // Calculate password strength for registration
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: '#e2e8f0' };
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    switch (score) {
      case 1: return { score: 1, label: 'Weak (min 8 chars needed)', color: '#ef4444' };
      case 2: return { score: 2, label: 'Fair', color: '#f59e0b' };
      case 3: return { score: 3, label: 'Good', color: '#3b82f6' };
      case 4: return { score: 4, label: 'Strong', color: '#10b981' };
      default: return { score: 0, label: 'Too Short (min 8 chars)', color: '#ef4444' };
    }
  };

  const pwdStrength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    // Client-side password validation
    if (mode === 'register' && password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login' || mode === 'register') {
        const endpoint = mode === 'login'
          ? `${API_BASE_URL}/auth/login`
          : `${API_BASE_URL}/auth/register`;
        const bodyPayload = mode === 'login'
          ? { email, password }
          : { businessName: businessName || 'Company', fullName, email, phone, password };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Authentication failed.');
        onAuthSuccess({
          userId: data.user.userId,
          tenantId: data.user.tenantId,
          fullName: data.user.fullName,
          email: data.user.email,
          phone: data.user.phone,
          role: data.user.role || 'OWNER',
          token: data.token
        });
      } else if (mode === 'forgot') {
        const data = await requestForgotPassword(email);
        if (!data.success) throw new Error(data.error || 'Failed to process request');
        setSuccessMessage('Reset token generated! Enter the token below to set your new password.');
        if (data.resetToken) setResetTokenInput(data.resetToken);
        setMode('reset');
      } else if (mode === 'reset') {
        if (newPassword.length < 8) {
          throw new Error('New password must be at least 8 characters long');
        }
        const data = await resetPassword(email, resetTokenInput, newPassword);
        if (!data.success) throw new Error(data.error || 'Failed to reset password');
        setSuccessMessage('Password reset successfully! Please sign in with your new password.');
        setPassword(newPassword);
        setNewPassword('');
        setResetTokenInput('');
        setMode('login');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to connect to server. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = () => {
    setEmail('admin@vyapar.com');
    setPassword('admin123');
    setMode('login');
  };

  const inputBase: React.CSSProperties = {
    width: '100%',
    height: '44px',
    paddingLeft: '40px',
    paddingRight: '16px',
    background: '#f8fafc',
    border: '1.5px solid #e2e8f0',
    borderRadius: '10px',
    fontSize: '13px',
    color: '#1e293b',
    fontWeight: 500,
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
    fontFamily: 'inherit',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        userSelect: 'none',
      }}
    >

      {/* ── Left Panel ───────────────────────────────────────── */}
      <div
        style={{
          width: '420px',
          minWidth: '420px',
          background: 'linear-gradient(145deg, #0f172a 0%, #1a2744 45%, #0c1f3f 100%)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '40px 36px',
          position: 'relative',
          overflow: 'hidden',
        }}
        className="hidden lg:flex"
      >
        {/* Subtle dot grid overlay */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />

        {/* Glowing orbs */}
        <div style={{
          position: 'absolute', top: '-80px', right: '-60px',
          width: '300px', height: '300px',
          background: 'radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-60px', left: '-40px',
          width: '260px', height: '260px',
          background: 'radial-gradient(circle, rgba(229,62,62,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #e53e3e, #c53030)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(229,62,62,0.4)',
          }}>
            <Store style={{ width: '19px', height: '19px', color: '#fff', strokeWidth: 2.5 }} />
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '17px', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
              Vyapar POS
            </div>
            <div style={{
              display: 'inline-block', fontSize: '9px', padding: '1px 7px', borderRadius: '4px',
              background: 'rgba(59,130,246,0.25)', color: '#93c5fd',
              fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              Enterprise
            </div>
          </div>
        </div>

        {/* Hero text + stat cards */}
        <div style={{ position: 'relative' }}>
          <div
            style={{
              fontSize: '28px', fontWeight: 900, color: '#fff',
              lineHeight: 1.25, marginBottom: '10px',
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(16px)',
              transition: 'all 0.7s cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            Run your business<br />
            <span style={{
              background: 'linear-gradient(90deg, #60a5fa, #818cf8)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              smarter, faster.
            </span>
          </div>
          <div style={{
            fontSize: '12.5px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '28px',
            opacity: mounted ? 1 : 0,
            transition: 'all 0.7s 0.1s cubic-bezier(0.22,1,0.36,1)',
          }}>
            Sales · Purchases · Inventory · Parties · Reports<br />
            100% offline-first with real-time cloud sync.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <StatCard icon={<TrendingUp style={{ width: 16, height: 16 }} />} label="Revenue tracked" value="Rs 2,40,000" color="#34d399" delay={200} />
            <StatCard icon={<Package style={{ width: 16, height: 16 }} />} label="Items in catalog" value="1,248 Products" color="#60a5fa" delay={350} />
            <StatCard icon={<Users style={{ width: 16, height: 16 }} />} label="Active parties" value="364 Customers" color="#f472b6" delay={500} />
            <StatCard icon={<Receipt style={{ width: 16, height: 16 }} />} label="Bills saved today" value="47 Invoices" color="#fb923c" delay={650} />
          </div>
        </div>

        {/* Bottom trust line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative' }}>
          {[
            { icon: <ShieldCheck style={{ width: 13, height: 13, color: '#34d399' }} />, text: '256-bit SSL' },
            { icon: <CheckCircle2 style={{ width: 13, height: 13, color: '#60a5fa' }} />, text: 'Full offline mode' },
          ].map(({ icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748b', fontSize: '11px', fontWeight: 500 }}>
              {icon} {text}
            </div>
          ))}
        </div>
      </div>

      {/* ── Right Panel ──────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f1f5f9',
        padding: '32px 24px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle right-panel gradient accent */}
        <div style={{
          position: 'absolute', top: '-100px', right: '-80px',
          width: '320px', height: '320px',
          background: 'radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div
          style={{
            width: '100%', maxWidth: '420px',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(24px)',
            transition: 'all 0.6s 0.15s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          {/* Mobile logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}
            className="flex lg:hidden">
            <div style={{
              width: '34px', height: '34px', borderRadius: '9px',
              background: 'linear-gradient(135deg, #e53e3e, #c53030)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Store style={{ width: '17px', height: '17px', color: '#fff', strokeWidth: 2.5 }} />
            </div>
            <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '16px' }}>Vyapar POS</span>
          </div>

          {/* Card */}
          <div style={{
            background: '#fff',
            borderRadius: '20px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 20px 60px -10px rgba(0,0,0,0.12)',
            border: '1px solid rgba(226,232,240,0.8)',
            padding: '32px',
          }}>
            {/* Heading */}
            <div style={{ marginBottom: '22px' }}>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.4px' }}>
                {mode === 'login' && 'Welcome back 👋'}
                {mode === 'register' && 'Create your account'}
                {mode === 'forgot' && 'Reset your password'}
                {mode === 'reset' && 'Enter reset token'}
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#94a3b8', fontWeight: 500 }}>
                {mode === 'login' && 'Enter your credentials to access your store'}
                {mode === 'register' && 'Fill in the details to set up your business'}
                {mode === 'forgot' && 'Enter your registered email to receive a password reset token'}
                {mode === 'reset' && 'Enter the reset PIN and your new password'}
              </p>
            </div>

            {/* Mode Switcher Tabs (Only for Login & Register) */}
            {(mode === 'login' || mode === 'register') && (
              <div style={{
                display: 'flex', background: '#f1f5f9', borderRadius: '10px',
                padding: '4px', marginBottom: '22px', gap: '4px',
              }}>
                {(['login', 'register'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMode(m); setErrorMessage(null); setSuccessMessage(null); }}
                    style={{
                      flex: 1, padding: '8px 0', fontSize: '12px', fontWeight: 700,
                      borderRadius: '7px', border: 'none', cursor: 'pointer',
                      transition: 'all 0.25s',
                      background: mode === m ? '#fff' : 'transparent',
                      color: mode === m ? '#0f172a' : '#94a3b8',
                      boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                      fontFamily: 'inherit',
                    }}
                  >
                    {m === 'login' ? 'Sign In' : 'Create Account'}
                  </button>
                ))}
              </div>
            )}

            {/* Success Alert */}
            {successMessage && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '8px',
                background: '#ecfdf5', border: '1.5px solid #a7f3d0',
                borderRadius: '10px', padding: '10px 12px',
                color: '#065f46', fontSize: '12px', fontWeight: 500,
                marginBottom: '16px',
              }}>
                <CheckCircle2 style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }} />
                {successMessage}
              </div>
            )}

            {/* Error Alert */}
            {errorMessage && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '8px',
                background: '#fef2f2', border: '1.5px solid #fecaca',
                borderRadius: '10px', padding: '10px 12px',
                color: '#dc2626', fontSize: '12px', fontWeight: 500,
                marginBottom: '16px',
              }}>
                <AlertCircle style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0 }} />
                {errorMessage}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                {/* Registration Fields */}
                {mode === 'register' && (
                  <>
                    <Field label="Business / Store Name">
                      <Building2 style={{ width: 14, height: 14, color: '#94a3b8', position: 'absolute', left: 13, top: 15 }} />
                      <input
                        type="text" required value={businessName}
                        onChange={e => setBusinessName(e.target.value)}
                        placeholder="e.g. SuperMarket Retailers"
                        style={inputBase}
                        onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.12)'; e.target.style.background = '#fff'; }}
                        onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#f8fafc'; }}
                      />
                    </Field>

                    <Field label="Full Name">
                      <UserIcon style={{ width: 14, height: 14, color: '#94a3b8', position: 'absolute', left: 13, top: 15 }} />
                      <input
                        type="text" required value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        placeholder="e.g. Ammar Yasir"
                        style={inputBase}
                        onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.12)'; e.target.style.background = '#fff'; }}
                        onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#f8fafc'; }}
                      />
                    </Field>

                    <Field label="Phone (optional)">
                      <Phone style={{ width: 14, height: 14, color: '#94a3b8', position: 'absolute', left: 13, top: 15 }} />
                      <input
                        type="text" value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+92 300 xxxxxxx"
                        style={inputBase}
                        onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.12)'; e.target.style.background = '#fff'; }}
                        onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#f8fafc'; }}
                      />
                    </Field>
                  </>
                )}

                {/* Email (Shown in Login, Register, Forgot, Reset) */}
                <Field label="Email Address">
                  <Mail style={{ width: 14, height: 14, color: '#94a3b8', position: 'absolute', left: 13, top: 15 }} />
                  <input
                    type="email" required value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@vyapar.com"
                    style={inputBase}
                    onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.12)'; e.target.style.background = '#fff'; }}
                    onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#f8fafc'; }}
                  />
                </Field>

                {/* Password (Login & Register) */}
                {(mode === 'login' || mode === 'register') && (
                  <Field label="Password">
                    <Lock style={{ width: 14, height: 14, color: '#94a3b8', position: 'absolute', left: 13, top: 15 }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      style={{ ...inputBase, paddingRight: '40px' }}
                      onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.12)'; e.target.style.background = '#fff'; }}
                      onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#f8fafc'; }}
                    />
                    <button
                      type="button" tabIndex={-1}
                      onClick={() => setShowPassword(v => !v)}
                      style={{
                        position: 'absolute', right: 12, top: 12,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#94a3b8', padding: 0, display: 'flex', alignItems: 'center',
                      }}
                    >
                      {showPassword
                        ? <EyeOff style={{ width: 16, height: 16 }} />
                        : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </Field>
                )}

                {/* Real-time Password Strength Indicator for Registration */}
                {mode === 'register' && password && (
                  <div style={{ marginTop: '-4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Password Strength:</span>
                      <span style={{ fontSize: '11px', color: pwdStrength.color, fontWeight: 700 }}>{pwdStrength.label}</span>
                    </div>
                    <div style={{ height: '4px', width: '100%', background: '#e2e8f0', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(pwdStrength.score / 4) * 100}%`,
                        background: pwdStrength.color,
                        transition: 'all 0.3s'
                      }} />
                    </div>
                  </div>
                )}

                {/* Forgot Password Link on Login Form */}
                {mode === 'login' && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-6px' }}>
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setErrorMessage(null); setSuccessMessage(null); }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '11.5px', color: '#3b82f6', fontWeight: 600,
                        padding: 0, fontFamily: 'inherit'
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {/* Reset Token & New Password Inputs for Reset Mode */}
                {mode === 'reset' && (
                  <>
                    <Field label="Reset Token / PIN">
                      <KeyRound style={{ width: 14, height: 14, color: '#94a3b8', position: 'absolute', left: 13, top: 15 }} />
                      <input
                        type="text" required value={resetTokenInput}
                        onChange={e => setResetTokenInput(e.target.value)}
                        placeholder="e.g. 123456"
                        style={inputBase}
                        onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.12)'; e.target.style.background = '#fff'; }}
                        onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#f8fafc'; }}
                      />
                    </Field>

                    <Field label="New Password (min 8 chars)">
                      <Lock style={{ width: 14, height: 14, color: '#94a3b8', position: 'absolute', left: 13, top: 15 }} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        style={{ ...inputBase, paddingRight: '40px' }}
                        onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.12)'; e.target.style.background = '#fff'; }}
                        onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; e.target.style.background = '#f8fafc'; }}
                      />
                      <button
                        type="button" tabIndex={-1}
                        onClick={() => setShowPassword(v => !v)}
                        style={{
                          position: 'absolute', right: 12, top: 12,
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#94a3b8', padding: 0, display: 'flex', alignItems: 'center',
                        }}
                      >
                        {showPassword
                          ? <EyeOff style={{ width: 16, height: 16 }} />
                          : <Eye style={{ width: 16, height: 16 }} />}
                      </button>
                    </Field>
                  </>
                )}

                {/* Back to Login Button for Forgot / Reset Modes */}
                {(mode === 'forgot' || mode === 'reset') && (
                  <button
                    type="button"
                    onClick={() => { setMode('login'); setErrorMessage(null); setSuccessMessage(null); }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '12px', color: '#64748b', fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: '4px', margin: '4px 0',
                      fontFamily: 'inherit'
                    }}
                  >
                    <ArrowLeft style={{ width: 14, height: 14 }} /> Back to Sign In
                  </button>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%', height: '46px', marginTop: '4px',
                    background: loading
                      ? '#c53030'
                      : 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)',
                    border: 'none', borderRadius: '11px',
                    color: '#fff', fontSize: '13px', fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    boxShadow: loading ? 'none' : '0 4px 14px rgba(229,62,62,0.45)',
                    transition: 'all 0.2s',
                    fontFamily: 'inherit',
                    opacity: loading ? 0.8 : 1,
                    letterSpacing: '0.01em',
                  }}
                  onMouseEnter={e => { if (!loading) { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(229,62,62,0.5)'; } }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = loading ? 'none' : '0 4px 14px rgba(229,62,62,0.45)'; }}
                >
                  {loading ? (
                    <>
                      <svg
                        className="animate-spin"
                        style={{ width: 16, height: 16 }}
                        viewBox="0 0 24 24" fill="none"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Authenticating...
                    </>
                  ) : (
                    <>
                      {mode === 'login' && 'Sign In to Account'}
                      {mode === 'register' && 'Register & Create Store'}
                      {mode === 'forgot' && 'Request Reset Token'}
                      {mode === 'reset' && 'Reset Password'}
                      <ArrowRight style={{ width: 16, height: 16, strokeWidth: 2.5 }} />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Demo helper */}
            {mode === 'login' && (
              <div style={{
                marginTop: '18px', paddingTop: '16px',
                borderTop: '1px solid #f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 500 }}>
                  Testing the app?
                </span>
                <button
                  type="button"
                  onClick={fillDemoAccount}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '5px',
                    fontSize: '11.5px', fontWeight: 700, color: '#3b82f6',
                    fontFamily: 'inherit', padding: 0,
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#2563eb'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#3b82f6'}
                >
                  <Sparkles style={{ width: 12, height: 12 }} />
                  Fill Demo Admin
                </button>
              </div>
            )}
          </div>

          {/* Trust badges */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '20px', marginTop: '18px',
          }}>
            {[
              { icon: <ShieldCheck style={{ width: 13, height: 13, color: '#10b981' }} />, text: '256-Bit SSL Cloud' },
              { icon: <CheckCircle2 style={{ width: 13, height: 13, color: '#3b82f6' }} />, text: 'Full Offline POS Mode' },
            ].map(({ icon, text }) => (
              <div key={text} style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                fontSize: '11px', fontWeight: 600, color: '#94a3b8',
              }}>
                {icon} {text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper wrapper for form fields
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label style={{
      display: 'block', fontSize: '11px', fontWeight: 700,
      color: '#475569', marginBottom: '6px',
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>
      {label}
    </label>
    <div style={{ position: 'relative' }}>
      {children}
    </div>
  </div>
);
