import React, { useState } from 'react';
import {
  Shield,
  Lock,
  User,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!identifier.trim()) {
      setError('Please enter your username (e.g. nfsslg-yfd, nfsslg-ncr, nfsslg-r11, or region name).');
      return;
    }
    if (!password) {
      setError('Please enter your account password.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await login(identifier.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your identifier and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col justify-center items-center p-4 selection:bg-blue-600 selection:text-white">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col md:flex-row">
        {/* Left Column: Institutional Brand & Welcome */}
        <div className="md:w-5/12 bg-gradient-to-b from-blue-900 via-slate-900 to-slate-950 p-7 sm:p-8 text-white flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-3.5 mb-6">
              <div className="w-13 h-13 rounded-full flex items-center justify-center shadow-xl ring-2 ring-blue-400/30 shrink-0 bg-white/5 p-0.5">
                <img src="/logo.svg" alt="NFSSLG Official Seal" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight text-white leading-tight">
                  NFSSLG SignFlow
                </h1>
                <p className="text-[10px] tracking-widest uppercase font-bold text-blue-300">
                  National Federation of SSLG
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-black leading-snug">
                National Federation of SSLG Document Approval &amp; Digital Signature Portal
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Centralized, tamper-evident document workflow coordinating the Central Office
                and RFSSLG Presidents across Regions 1 to 13, Region 4A, Region 4B, NCR, CAR, NIR, and BARMM.
              </p>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800 space-y-2 text-xs text-slate-400">
            <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-[11px]">
              <Shield className="w-4 h-4" />
              <span>SHA-256 Digital Verification Seal</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Access is restricted to authorized NFSSLG Central Office and RFSSLG President accounts.
              Public registration is disabled.
            </p>
          </div>
        </div>

        {/* Right Column: Secure Username/Identifier & Password Login Form */}
        <div className="md:w-7/12 p-6 sm:p-8 bg-slate-50/50 flex flex-col justify-between">
          <div>
            <div className="mb-6">
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Account Sign In
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Enter your assigned RFSSLG President or Central Office credentials to access your document workspace
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center space-x-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <form action="#" onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Identifier Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Username / Region Identifier
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. nfsslg-yfd, nfsslg-ncr, nfsslg-r11, nfsslg-nir, or email"
                    className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent shadow-2xs"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-2.5 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-bold shadow-md transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <span>Sign In to Regional Workspace</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="mt-6 text-center text-[11px] text-slate-400 border-t border-slate-100 pt-3">
            NFSSLG SignFlow • National Document Approval &amp; Electronic Signature Platform
          </div>
        </div>
      </div>
    </div>
  );
};
