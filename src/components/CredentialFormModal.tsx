import React, { useState } from 'react';
import { X, RefreshCw, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { generateSecurePassword } from '@/lib/crypto';
import type { CredentialEntry, NewCredentialInput } from '@/types';

interface CredentialFormModalProps {
  initialEntry?: CredentialEntry | null;
  defaultUrl?: string;
  defaultTitle?: string;
  onSave: (input: NewCredentialInput, existingId?: string) => Promise<string | null>;
  onClose: () => void;
}

export const CredentialFormModal: React.FC<CredentialFormModalProps> = ({
  initialEntry,
  defaultUrl = '',
  defaultTitle = '',
  onSave,
  onClose
}) => {
  const [title, setTitle] = useState(initialEntry?.title || defaultTitle);
  const [url, setUrl] = useState(initialEntry?.url || defaultUrl);
  const [username, setUsername] = useState(initialEntry?.username || '');
  const [password, setPassword] = useState(initialEntry?.password || '');
  const [notes, setNotes] = useState(initialEntry?.notes || '');
  const [showPassword, setShowPassword] = useState(false);
  const [genLength, setGenLength] = useState(20);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGeneratePassword = () => {
    const generated = generateSecurePassword({
      length: genLength,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true
    });
    setPassword(generated);
    setShowPassword(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !url.trim() || !password) {
      setError('Title, URL/Domain, and Password are required.');
      return;
    }

    setSaving(true);
    const err = await onSave(
      {
        title: title.trim(),
        url: url.trim(),
        username: username.trim(),
        password,
        notes: notes.trim(),
        favorite: initialEntry?.favorite ?? false
      },
      initialEntry?.id
    );
    setSaving(false);

    if (err) {
      setError(err);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xs flex flex-col p-4 overflow-y-auto">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
        <h2 className="text-sm font-semibold text-slate-100">
          {initialEntry ? 'Edit Credential' : 'Add Encrypted Credential'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-200 rounded-md cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 flex-1 flex flex-col justify-between">
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Service Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. GitHub, PayPal"
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500/70"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Website URL (eTLD+1 verified)
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com"
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500/70"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Username / Email
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500/70"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-slate-300">
                Password
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                  {genLength} chars
                </span>
                <input
                  type="range"
                  min={12}
                  max={48}
                  value={genLength}
                  onChange={(e) => setGenLength(Number(e.target.value))}
                  className="w-16 accent-emerald-500 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  Generate
                </button>
              </div>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter or generate password"
                className="w-full pl-3 pr-8 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500/70"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Encrypted Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Recovery codes or security notes..."
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-emerald-500/70 resize-none"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-xs cursor-pointer"
          >
            {saving ? 'Encrypting...' : 'Save Credential'}
          </button>
        </div>
      </form>
    </div>
  );
};
