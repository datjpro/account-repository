import React, { useState } from 'react';
import { ShieldCheck, Lock, Eye, EyeOff, KeyRound, AlertCircle } from 'lucide-react';

interface VaultAuthViewProps {
  isInitialized: boolean;
  onInitialize: (masterPassword: string) => Promise<string | null>;
  onUnlock: (masterPassword: string) => Promise<string | null>;
  onOpenOptions?: () => void;
}

export const VaultAuthView: React.FC<VaultAuthViewProps> = ({
  isInitialized,
  onInitialize,
  onUnlock,
  onOpenOptions
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isInitialized) {
      if (password.length < 8) {
        setError('Master Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Master Passwords do not match.');
        return;
      }
      setLoading(true);
      const err = await onInitialize(password);
      setLoading(false);
      if (err) {
        setError(err);
      } else {
        setPassword('');
        setConfirmPassword('');
      }
    } else {
      if (!password) {
        setError('Enter your Master Password to unlock.');
        return;
      }
      setLoading(true);
      const err = await onUnlock(password);
      setLoading(false);
      if (err) {
        setError(err);
      } else {
        setPassword('');
      }
    }
  };

  return (
    <div className="flex flex-col justify-between min-h-[460px] bg-slate-950 text-slate-100 p-5">
      <div>
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3.5 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-slate-100">
                VaultGuard
              </h1>
              <p className="text-[11px] text-slate-400 font-mono">
                AES-256-GCM · PBKDF2 600K
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
            <Lock className="w-3 h-3" />
            {isInitialized ? 'Locked' : 'Unconfigured'}
          </span>
        </div>

        <div className="mb-5">
          <h2 className="text-base font-semibold text-slate-100">
            {isInitialized ? 'Unlock Local Vault' : 'Create Master Vault'}
          </h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            {isInitialized
              ? 'Your credentials are encrypted at rest. Enter your Master Password to derive the session key in memory.'
              : 'Set a strong Master Password. Zero-knowledge architecture means this password is never stored and cannot be recovered if forgotten.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label
              htmlFor="master-password-input"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Master Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="master-password-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                placeholder={isInitialized ? 'Enter Master Password' : 'Minimum 8 characters'}
                className="w-full pl-9 pr-9 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500/70 focus:ring-1 focus:ring-emerald-500/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {!isInitialized && (
            <div>
              <label
                htmlFor="confirm-master-password-input"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Confirm Master Password
              </label>
              <input
                id="confirm-master-password-input"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter Master Password"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500/70 focus:ring-1 focus:ring-emerald-500/30"
              />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
          >
            {loading
              ? 'Deriving Key (PBKDF2 600K)...'
              : isInitialized
                ? 'Unlock Vault'
                : 'Initialize Encrypted Vault'}
          </button>
        </form>
      </div>

      <div className="pt-4 border-t border-slate-900 flex items-center justify-between text-[11px] text-slate-500">
        <span>100% Offline · Zero Telemetry</span>
        {onOpenOptions && (
          <button
            type="button"
            onClick={onOpenOptions}
            className="text-slate-400 hover:text-emerald-400 underline underline-offset-2 cursor-pointer"
          >
            Import Backup JSON
          </button>
        )}
      </div>
    </div>
  );
};
