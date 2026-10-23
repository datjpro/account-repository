import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Plus,
  Search,
  Copy,
  Check,
  Zap,
  Settings,
  Trash2,
  Edit3,
  Globe
} from 'lucide-react';
import { sendVaultMessage } from '@/lib/messaging';
import { VaultAuthView } from '@/components/VaultAuthView';
import { CredentialFormModal } from '@/components/CredentialFormModal';
import type { CredentialEntry, NewCredentialInput, VaultStatus } from '@/types';

export const App: React.FC = () => {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [entries, setEntries] = useState<CredentialEntry[]>([]);
  const [matchedForTab, setMatchedForTab] = useState<CredentialEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTabUrl, setActiveTabUrl] = useState('');
  const [activeTabTitle, setActiveTabTitle] = useState('');
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CredentialEntry | null>(null);

  const loadVaultState = useCallback(async (query: string = searchQuery) => {
    let tabUrl = '';
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          tabUrl = tab.url || '';
          setActiveTabUrl(tabUrl);
          setActiveTabTitle(tab.title || '');
          setActiveTabId(tab.id ?? null);
        }
      }
    } catch {
      // Ignore tab query errors on restricted chrome:// pages
    }

    const statusRes = await sendVaultMessage({ type: 'QUERY_VAULT_STATUS' });
    if (!statusRes.ok) return;

    setStatus(statusRes.data);

    if (statusRes.data.isUnlocked) {
      const listRes = await sendVaultMessage({
        type: 'LIST_ALL_CREDENTIALS',
        payload: { searchQuery: query, tabUrl }
      });
      if (listRes.ok) {
        setEntries(listRes.data.entries);
        setMatchedForTab(listRes.data.matchedForTab);
      }
    }
  }, [searchQuery]);

  useEffect(() => {
    void loadVaultState('');
  }, [loadVaultState]);

  const handleInitialize = async (masterPassword: string): Promise<string | null> => {
    const res = await sendVaultMessage({
      type: 'INITIALIZE_VAULT',
      payload: { masterPassword }
    });
    if (!res.ok) return res.error;
    await loadVaultState(searchQuery);
    return null;
  };

  const handleUnlock = async (masterPassword: string): Promise<string | null> => {
    const res = await sendVaultMessage({
      type: 'UNLOCK_VAULT',
      payload: { masterPassword }
    });
    if (!res.ok) return res.error;
    await loadVaultState(searchQuery);
    return null;
  };

  const handleLock = async () => {
    await sendVaultMessage({ type: 'LOCK_VAULT' });
    setEntries([]);
    setMatchedForTab([]);
    await loadVaultState('');
  };

  const handleSearchChange = async (value: string) => {
    setSearchQuery(value);
    const listRes = await sendVaultMessage({
      type: 'LIST_ALL_CREDENTIALS',
      payload: { searchQuery: value, tabUrl: activeTabUrl }
    });
    if (listRes.ok) {
      setEntries(listRes.data.entries);
      setMatchedForTab(listRes.data.matchedForTab);
    }
  };

  const handleCopy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1500);
  };

  const handleAutofillInTab = (entry: CredentialEntry) => {
    if (!activeTabId || typeof chrome === 'undefined' || !chrome.tabs) return;
    chrome.tabs.sendMessage(activeTabId, {
      type: 'FILL_ACTIVE_TAB_CREDENTIAL',
      payload: {
        username: entry.username,
        password: entry.password
      }
    });
  };

  const handleSaveCredential = async (
    input: NewCredentialInput,
    existingId?: string
  ): Promise<string | null> => {
    if (existingId) {
      const res = await sendVaultMessage({
        type: 'UPDATE_CREDENTIAL',
        payload: { id: existingId, updates: input }
      });
      if (!res.ok) return res.error;
    } else {
      const res = await sendVaultMessage({
        type: 'SAVE_CREDENTIALS',
        payload: input
      });
      if (!res.ok) return res.error;
    }
    await loadVaultState(searchQuery);
    return null;
  };

  const handleDeleteCredential = async (id: string) => {
    const res = await sendVaultMessage({
      type: 'DELETE_CREDENTIAL',
      payload: { id }
    });
    if (res.ok) {
      await loadVaultState(searchQuery);
    }
  };

  const openOptionsPage = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      void chrome.runtime.openOptionsPage();
    }
  };

  if (!status) {
    return (
      <div className="flex items-center justify-center min-h-[480px] bg-slate-950 text-slate-400 text-xs font-mono">
        Connecting to VaultGuard Worker...
      </div>
    );
  }

  if (!status.isInitialized || !status.isUnlocked) {
    return (
      <VaultAuthView
        isInitialized={status.isInitialized}
        onInitialize={handleInitialize}
        onUnlock={handleUnlock}
        onOpenOptions={openOptionsPage}
      />
    );
  }

  return (
    <div className="flex flex-col h-[500px] bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-100">VaultGuard</span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                Unlocked
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono tabular-nums">
              {entries.length} {entries.length === 1 ? 'item' : 'items'} · Auto-lock {status.autoLockMinutes}m
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setEditingEntry(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs cursor-pointer"
            title="Add new credential"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
          <button
            type="button"
            onClick={openOptionsPage}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 cursor-pointer"
            title="Vault Backup & Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleLock}
            className="p-1.5 rounded-md text-slate-400 hover:text-amber-300 hover:bg-slate-800 cursor-pointer"
            title="Lock Vault Now"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Search bar */}
      <div className="px-4 py-2.5 border-b border-slate-900">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => void handleSearchChange(e.target.value)}
            placeholder="Search by domain, title, or username..."
            className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
          />
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Matched for Current Tab (eTLD+1 verified) */}
        {matchedForTab.length > 0 && !searchQuery && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                Matched for Active Site (eTLD+1)
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {matchedForTab[0]?.domain}
              </span>
            </div>
            <div className="space-y-2">
              {matchedForTab.map((entry) => (
                <div
                  key={`match-${entry.id}`}
                  className="p-2.5 rounded-lg bg-emerald-950/25 border border-emerald-500/30 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-100 truncate">
                      {entry.title}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">
                      {entry.username || '(No username)'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleAutofillInTab(entry)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-medium cursor-pointer"
                      title="Autofill into current tab"
                    >
                      <Zap className="w-3 h-3" />
                      Fill
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopy(entry.password, `pass-${entry.id}`)}
                      className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 cursor-pointer"
                      title="Copy Password"
                    >
                      {copiedKey === `pass-${entry.id}` ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* All Credentials */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {searchQuery ? 'Search Results' : 'All Vault Credentials'}
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-800 bg-slate-900/30">
              <Globe className="w-6 h-6 text-slate-600 mx-auto mb-2" />
              <p className="text-xs font-medium text-slate-300">
                {searchQuery ? 'No matching credentials found' : 'Your encrypted vault is empty'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Click &ldquo;Add&rdquo; above or log in to any website to save credentials.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/90 hover:border-slate-700 transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-slate-100 truncate">
                        {entry.title}
                      </span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 truncate">
                        {entry.domain}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                      {entry.username || '(No username)'}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleCopy(entry.username, `user-${entry.id}`)}
                      className="px-1.5 py-1 rounded bg-slate-800/80 hover:bg-slate-800 text-[10px] font-mono text-slate-300 cursor-pointer"
                      title="Copy Username"
                    >
                      {copiedKey === `user-${entry.id}` ? 'Copied' : 'User'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleCopy(entry.password, `pw-${entry.id}`)}
                      className="px-1.5 py-1 rounded bg-slate-800/80 hover:bg-slate-800 text-[10px] font-mono text-emerald-300 cursor-pointer"
                      title="Copy Password"
                    >
                      {copiedKey === `pw-${entry.id}` ? 'Copied' : 'Pass'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEntry(entry);
                        setModalOpen(true);
                      }}
                      className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
                      title="Edit"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCredential(entry.id)}
                      className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {modalOpen && (
        <CredentialFormModal
          initialEntry={editingEntry}
          defaultUrl={/^https?:\/\//i.test(activeTabUrl) ? new URL(activeTabUrl).origin : ''}
          defaultTitle={activeTabTitle}
          onSave={handleSaveCredential}
          onClose={() => {
            setModalOpen(false);
            setEditingEntry(null);
          }}
        />
      )}
    </div>
  );
};
