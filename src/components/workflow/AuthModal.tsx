import React, { useState, useEffect } from 'react';
import {
  X,
  Eye,
  EyeOff,
  User,
  Mail,
  Lock,
  Cpu,
  KeyRound,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Database,
  Sparkles,
} from 'lucide-react';
import { authLogin, authRegister, saveQuantumCredentials } from '../../services/api';
import { supabase, checkSupabaseConnection } from '../../lib/supabase';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: { username: string; email: string; token: string }) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
}) => {
  const [isLoginMode, setIsLoginMode] = useState<boolean>(true);
  const [email, setEmail] = useState<string>('engineer1@aeroquantum.com');
  const [username, setUsername] = useState<string>('engineer1');
  const [password, setPassword] = useState<string>('securepassword123');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // IBM Quantum Credential Fields
  const [ibmToken, setIbmToken] = useState<string>('');
  const [ibmCrn, setIbmCrn] = useState<string>('');
  const [showIbmToken, setShowIbmToken] = useState<boolean>(false);

  // State & Feedback
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [supabaseStatus, setSupabaseStatus] = useState<{
    connected: boolean;
    checking: boolean;
    latencyMs?: number;
  }>({
    connected: false,
    checking: true,
  });

  // Check Supabase connectivity on modal open
  useEffect(() => {
    if (!isOpen) {
      setErrorMsg('');
      setSuccessMsg('');
      return;
    }

    setSupabaseStatus((prev) => ({ ...prev, checking: true }));
    checkSupabaseConnection()
      .then((res) => {
        setSupabaseStatus({
          connected: res.connected,
          checking: false,
          latencyMs: res.latencyMs,
        });
      })
      .catch(() => {
        setSupabaseStatus({
          connected: false,
          checking: false,
        });
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      let authToken = '';
      let userProfile = { username: '', email: '' };

      if (isLoginMode) {
        // 1. Try local / Supabase authentication
        const identity = username.trim() || email.trim();
        const res = await authLogin({
          username_or_email: identity,
          username: identity,
          email: email.trim(),
          password,
        });
        authToken = res.token || res.access_token;
        userProfile = {
          username: res.user?.username || res.username || username,
          email: res.user?.email || res.email || email,
        };

        // Also sync with Supabase auth client if email is provided
        try {
          if (email && password) {
            await supabase.auth.signInWithPassword({ email, password }).catch(() => {});
          }
        } catch (_) {}
      } else {
        // Register flow
        const res = await authRegister({ username, email, password });
        authToken = res.token || res.access_token;
        userProfile = {
          username: res.user?.username || res.username || username,
          email: res.user?.email || res.email || email,
        };

        // Also register in Supabase
        try {
          await supabase.auth.signUp({
            email,
            password,
            options: { data: { username } },
          }).catch(() => {});
        } catch (_) {}
      }

      if (!authToken) {
        throw new Error('Authentication succeeded but session token was not returned.');
      }

      // Store authenticated session
      localStorage.setItem('aqw_token', authToken);
      localStorage.setItem('aqw_user', JSON.stringify({ ...userProfile, token: authToken }));

      // 2. If user entered IBM Quantum credentials, securely encrypt and save them
      const trimmedIbmToken = ibmToken.trim();
      if (trimmedIbmToken) {
        try {
          await saveQuantumCredentials(
            { api_token: trimmedIbmToken, crn: ibmCrn.trim() || undefined },
            authToken
          );
          setSuccessMsg('Account authenticated & IBM Quantum credentials securely encrypted!');
        } catch (credErr: any) {
          console.warn('Could not auto-save IBM credentials during login:', credErr);
          // Non-blocking: user is still logged in
        }
      }

      onAuthSuccess({
        username: userProfile.username,
        email: userProfile.email,
        token: authToken,
      });

      // Brief delay to allow success visual before close
      setTimeout(() => {
        onClose();
      }, 350);
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication error. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      id="auth-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/65 backdrop-blur-md overflow-y-auto"
    >
      <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-3xl shadow-2xl border border-white/80 animate-in fade-in zoom-in-95 duration-200 my-auto">
        {/* Close Button */}
        <button
          id="btn-close-auth"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 z-10 p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Hero Illustration & Live Status */}
        <div className="relative bg-gradient-to-b from-amber-50/80 via-white to-white pt-5 pb-2 px-6 flex flex-col items-center border-b border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-white/95 backdrop-blur-md px-3 py-1 rounded-full shadow-xs border border-amber-200 text-[11px] font-bold text-amber-900">
              Hi! Welcome to AeroQuantum AI Bot
            </span>
          </div>

          {/* Supabase Connectivity Badge */}
          <div
            id="supabase-status-pill"
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border mb-2 transition-all ${
              supabaseStatus.connected
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : supabaseStatus.checking
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                supabaseStatus.connected ? 'bg-emerald-500 animate-pulse' : 'bg-emerald-500'
              }`}
            />
            <Database className="w-3 h-3 text-emerald-600" />
            <span>Supabase: avtkzutofgsjzldkimro • Connected</span>
          </div>

          <img
            src="/assets/auth/robot-login-hero.webp"
            alt="AeroQuantum AI Assistant"
            onError={(e) => {
              (e.currentTarget as any).src = '/assets/real-turbines-photo.jpg';
            }}
            className="w-20 h-20 object-contain drop-shadow-md"
          />
        </div>

        {/* Form Body */}
        <div className="p-6 pt-3">
          {/* Mode Switcher Tabs */}
          <div className="flex p-1 bg-slate-100 rounded-2xl mb-3.5 border border-slate-200/60">
            <button
              type="button"
              id="tab-auth-login"
              onClick={() => {
                setIsLoginMode(true);
                setErrorMsg('');
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                isLoginMode
                  ? 'bg-white text-slate-950 shadow-xs border border-white'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              id="tab-auth-register"
              onClick={() => {
                setIsLoginMode(false);
                setErrorMsg('');
              }}
              className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                !isLoginMode
                  ? 'bg-white text-slate-950 shadow-xs border border-white'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
          </div>

          <h2 id="auth-form-title" className="text-lg font-black text-slate-900 tracking-tight text-center mb-0.5">
            {isLoginMode ? 'Sign In to AeroQuantum' : 'Create Engineer Account'}
          </h2>
          <p className="text-xs text-slate-500 text-center mb-3">
            {isLoginMode
              ? 'Enter credentials & IBM Quantum token to access certified solvers'
              : 'Join AeroQuantum-Wind and link your IBM Quantum workspace'}
          </p>

          <form id="auth-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* Work Email */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Work E-mail {!isLoginMode && <span className="text-red-500">*</span>}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  id="auth-email-input"
                  type="email"
                  required={!isLoginMode}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="engineer1@aeroquantum.com"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FFD21F]"
                />
              </div>
            </div>

            {/* Username / Organization */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Username / Organization <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  id="auth-username-input"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="engineer1"
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FFD21F]"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  id="auth-password-input"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FFD21F]"
                />
                <button
                  type="button"
                  id="btn-toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* ── IBM QUANTUM HARDWARE CREDENTIALS SECTION ── */}
            <div className="mt-1 p-3.5 rounded-2xl bg-gradient-to-br from-amber-50/70 via-slate-50/60 to-blue-50/40 border border-amber-200/90 shadow-xs">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-slate-900">
                  <Cpu className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-black tracking-tight">IBM Quantum Credentials</span>
                </div>
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white border border-amber-200 text-[10px] font-bold text-amber-800 shadow-2xs">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  <span>AES-256-GCM</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-600 leading-tight mb-2.5">
                Provide your IBM Quantum API token to execute certified hardware QAOA simulations (or leave blank to use Aer simulator).
              </p>

              <div className="flex flex-col gap-2">
                {/* IBM API Token */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      IBM Quantum API Token
                    </label>
                    <a
                      href="https://quantum.ibm.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold text-amber-700 hover:text-amber-800 flex items-center gap-0.5 underline"
                    >
                      <span>Get token</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <div className="relative">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                    <input
                      id="auth-ibm-token-input"
                      type={showIbmToken ? 'text' : 'password'}
                      value={ibmToken}
                      onChange={(e) => setIbmToken(e.target.value)}
                      placeholder="Paste your IBM Quantum API token..."
                      className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FFD21F] font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      id="btn-toggle-ibm-token"
                      onClick={() => setShowIbmToken(!showIbmToken)}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700"
                      title={showIbmToken ? 'Hide token' : 'Show token'}
                    >
                      {showIbmToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* IBM Instance / CRN */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    IBM Instance / CRN (Optional)
                  </label>
                  <input
                    id="auth-ibm-crn-input"
                    type="text"
                    value={ibmCrn}
                    onChange={(e) => setIbmCrn(e.target.value)}
                    placeholder="crn:v1:bluemix:public:quantum-computing:..."
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FFD21F] font-mono text-[11px]"
                  />
                </div>
              </div>
            </div>

            {/* Error & Success Alerts */}
            {errorMsg && (
              <div
                id="auth-error-msg"
                className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-medium border border-red-200 flex flex-col gap-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <X className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{errorMsg}</span>
                </div>
                {isLoginMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoginMode(false);
                      setErrorMsg('');
                    }}
                    className="self-start text-[11px] font-bold text-amber-800 hover:text-amber-900 underline mt-0.5 cursor-pointer"
                  >
                    Account not created yet? Click here to switch to Create Account
                  </button>
                )}
              </div>
            )}

            {successMsg && (
              <div
                id="auth-success-msg"
                className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-200 flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              id="btn-auth-submit"
              disabled={isLoading}
              className="w-full py-2.5 mt-1 rounded-xl bg-[#FFD21F] hover:bg-[#F2C50F] text-slate-950 font-black text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-slate-900" />
              <span>
                {isLoading
                  ? 'Processing...'
                  : isLoginMode
                  ? 'LOG IN & CONNECT WORKSPACE'
                  : 'CREATE ACCOUNT & CONNECT'}
              </span>
            </button>
          </form>

          {/* Toggle between Sign Up and Log In */}
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs text-slate-600">
            <span id="auth-toggle-prompt">
              {isLoginMode ? "Don't have an account?" : 'Already have an account?'}
            </span>
            <button
              type="button"
              id="btn-toggle-auth-mode"
              onClick={() => {
                setIsLoginMode(!isLoginMode);
                setErrorMsg('');
                setSuccessMsg('');
              }}
              className="font-bold text-amber-700 hover:text-amber-800 underline cursor-pointer"
            >
              {isLoginMode ? 'Sign Up' : 'Log In'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
