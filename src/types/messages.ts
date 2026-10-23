import type {
  AutofillCredentialMatch,
  CredentialEntry,
  EncryptedVaultEnvelope,
  NewCredentialInput,
  VaultSettings,
  VaultStatus
} from './vault';

export interface QueryVaultStatusMessage {
  type: 'QUERY_VAULT_STATUS';
}

export interface InitializeVaultMessage {
  type: 'INITIALIZE_VAULT';
  payload: {
    masterPassword: string;
  };
}

export interface UnlockVaultMessage {
  type: 'UNLOCK_VAULT';
  payload: {
    masterPassword: string;
  };
}

export interface LockVaultMessage {
  type: 'LOCK_VAULT';
}

export interface RequestCredentialsMessage {
  type: 'REQUEST_CREDENTIALS';
  payload: {
    tabUrl: string;
  };
}

export interface SaveCredentialsMessage {
  type: 'SAVE_CREDENTIALS';
  payload: NewCredentialInput;
}

export interface UpdateCredentialMessage {
  type: 'UPDATE_CREDENTIAL';
  payload: {
    id: string;
    updates: Partial<NewCredentialInput>;
  };
}

export interface DeleteCredentialMessage {
  type: 'DELETE_CREDENTIAL';
  payload: {
    id: string;
  };
}

export interface ListAllCredentialsMessage {
  type: 'LIST_ALL_CREDENTIALS';
  payload?: {
    searchQuery?: string;
    tabUrl?: string;
  };
}

export interface ExportEncryptedVaultMessage {
  type: 'EXPORT_ENCRYPTED_VAULT';
}

export interface ImportEncryptedVaultMessage {
  type: 'IMPORT_ENCRYPTED_VAULT';
  payload: {
    envelope: EncryptedVaultEnvelope;
    masterPassword: string;
  };
}

export interface UpdateSettingsMessage {
  type: 'UPDATE_SETTINGS';
  payload: Partial<VaultSettings>;
}

export type ExtensionMessage =
  | QueryVaultStatusMessage
  | InitializeVaultMessage
  | UnlockVaultMessage
  | LockVaultMessage
  | RequestCredentialsMessage
  | SaveCredentialsMessage
  | UpdateCredentialMessage
  | DeleteCredentialMessage
  | ListAllCredentialsMessage
  | ExportEncryptedVaultMessage
  | ImportEncryptedVaultMessage
  | UpdateSettingsMessage;

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: 'VAULT_LOCKED' | 'INVALID_PASSWORD' | 'NOT_INITIALIZED' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR' };

export interface ListCredentialsResponse {
  entries: CredentialEntry[];
  matchedForTab: CredentialEntry[];
  settings: VaultSettings;
}

export type MessageResponseMap = {
  QUERY_VAULT_STATUS: ApiResponse<VaultStatus>;
  INITIALIZE_VAULT: ApiResponse<VaultStatus>;
  UNLOCK_VAULT: ApiResponse<VaultStatus>;
  LOCK_VAULT: ApiResponse<VaultStatus>;
  REQUEST_CREDENTIALS: ApiResponse<{
    isLocked: boolean;
    matches: AutofillCredentialMatch[];
  }>;
  SAVE_CREDENTIALS: ApiResponse<CredentialEntry>;
  UPDATE_CREDENTIAL: ApiResponse<CredentialEntry>;
  DELETE_CREDENTIAL: ApiResponse<{ deletedId: string }>;
  LIST_ALL_CREDENTIALS: ApiResponse<ListCredentialsResponse>;
  EXPORT_ENCRYPTED_VAULT: ApiResponse<EncryptedVaultEnvelope>;
  IMPORT_ENCRYPTED_VAULT: ApiResponse<VaultStatus>;
  UPDATE_SETTINGS: ApiResponse<VaultSettings>;
};
