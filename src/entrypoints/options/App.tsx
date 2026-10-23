import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Download,
  Upload,
  Clock,
  CheckCircle2,
  AlertCircle,
  Lock
} from 'lucide-react';
import { sendVaultMessage } from '@/lib/messaging';
import { parseExportedVaultJson } from '@/lib/storage';
import type { VaultStatus } from '@/types';

export const App: React.FC = () => {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [autoLockMinutes, setAutoLockMinutes] = useState(15);
  const [importJsonText, setImportJsonText] = useState('');
  const [importMasterPassword, setImportMasterPassword] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [loading, setLoading] = useState(false);

  const refreshStatus = async () => {
    const res = await sendVaultMessage({ type: 'QUERY_VAULT_STATUS' });
    if (res.ok) {
      setStatus(res.data);
      setAutoLockMinutes(res.data.autoLockMinutes);
    }
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  const handleExportVault = async () => {
    setFeedback(null);
    const res = await sendVaultMessage({ type: 'EXPORT_ENCRYPTED_VAULT' });
    if (!res.ok) {
      setFeedback({ type: 'error', message: res.error });
      return;
    }

    const serialized = JSON.stringify(res.data, null, 2);
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `vaultguard-backup-${dateStamp}.vault.json`;
    a.click();
    URL.revokeObjectURL(url);

    setFeedback({
      type: 'success',
      message: 'Encrypted vault backup (.vault.json) downloaded. Keep your Master Password safe!'
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setImportJsonText(text);
  };

  const handleImportVault = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!importJsonText.trim()) {
      setFeedback({ type: 'error', message: 'Please select a .vault.json backup file first.' });
      return;
    }
    if (!importMasterPassword) {
      setFeedback({
        type: 'error',
        message: 'Enter the Master Password for the backup file to verify integrity before importing.'
      });
      return;
    }

    try {
      setLoading(true);
      const envelope = parseExportedVaultJson(importJsonText);
      const res = await sendVaultMessage({
        type: 'IMPORT_ENCRYPTED_VAULT',
        payload: {
          envelope,
          masterPassword: importMasterPassword
        }
      });
      setLoading(false);

      if (!res.ok) {
        setFeedback({ type: 'error', message: res.error });
        return;
      }

      setImportMasterPassword('');
      setImportJsonText('');
      await refreshStatus();
      setFeedback({
        type: 'success',
        message: `Successfully verified and imported vault (${res.data.entryCount} credentials).`
      });
    } catch (err) {
      setLoading(false);
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Invalid backup file'
      });
    }
  };

  const handleSaveTimeout = async () => {
    setFeedback(null);
    const res = await sendVaultMessage({
      type: 'UPDATE_SETTINGS',
      payload: { autoLockMinutes }
    });
    if (!res.ok) {
      setFeedback({ type: 'error', message: res.error });
      return;
    }
    await refreshStatus();
    setFeedback({
      type: 'success',
      message: `Inactivity auto-lock timeout updated to ${res.data.autoLockMinutes} minutes.`
    });
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-6 space-y-8">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-800 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-100">
              VaultGuard Security &amp; Backup Center
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Browser-Native Local-First · AES-256-GCM · PBKDF2-SHA256 (600,000 iterations)
            </p>
          </div>
        </div>
        {status && (
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
              status.isUnlocked
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/25'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            {status.isUnlocked ? `Unlocked (${status.entryCount} items)` : 'Vault Locked'}
          </span>
        )}
      </header>

      {feedback && (
        <div
          className={`flex items-start gap-2.5 p-4 rounded-xl border text-xs ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Session Auto-Lock Timeout */}
      <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Session Inactivity Auto-Lock
          </h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Your derived AES-256-GCM <code className="font-mono text-slate-200">CryptoKey</code> resides
          strictly in the Background Service Worker&apos;s ephemeral memory and is wiped automatically
          after inactivity. (Vault must be unlocked to modify settings.)
        </p>
        <div className="flex items-center gap-3 pt-1">
          <select
            value={autoLockMinutes}
            onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
            disabled={!status?.isUnlocked}
            className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono disabled:opacity-50"
          >
            <option value={1}>1 minute</option>
            <option value={5}>5 minutes</option>
            <option value={15}>15 minutes (Default)</option>
            <option value={30}>30 minutes</option>
            <option value={60}>60 minutes</option>
          </select>
          <button
            type="button"
            disabled={!status?.isUnlocked}
            onClick={() => void handleSaveTimeout()}
            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-semibold text-xs cursor-pointer"
          >
            Save Auto-Lock Policy
          </button>
        </div>
      </section>

      {/* Export Encrypted Vault */}
      <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Export Encrypted Vault (.vault.json)
          </h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Downloads the raw AES-256-GCM encrypted envelope stored in{' '}
          <code className="font-mono text-slate-200">chrome.storage.local</code>. No plaintext is ever
          exported. Safe to store on local disk or personal cloud storage (Google Drive, iCloud, Dropbox).
        </p>
        <button
          type="button"
          disabled={!status?.isInitialized}
          onClick={() => void handleExportVault()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-xs font-semibold text-slate-100 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Download Encrypted Backup
        </button>
      </section>

      {/* Import Encrypted Vault */}
      <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Import &amp; Restore Encrypted Vault
          </h2>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Restore from a <code className="font-mono text-slate-200">.vault.json</code> file. VaultGuard
          verifies authenticity (AES-GCM authentication tag) using the backup&apos;s Master Password
          before replacing local storage.
        </p>

        <form onSubmit={handleImportVault} className="space-y-4 max-w-md">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              1. Select Encrypted <code className="font-mono">.vault.json</code> File
            </label>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => void handleFileChange(e)}
              className="block w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              2. Backup Master Password
            </label>
            <input
              type="password"
              value={importMasterPassword}
              onChange={(e) => setImportMasterPassword(e.target.value)}
              placeholder="Enter Master Password for this backup"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:border-emerald-500/70"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-xs cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            {loading ? 'Verifying & Decrypting...' : 'Verify & Restore Vault'}
          </button>
        </form>
      </section>
    </div>
  );
};
