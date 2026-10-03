export interface SessionRecord {
  sessionHandle: string;
  backend: string;
  threadId: string | null;
  workspace: string;
  activePid: number | null;
  activeTurnAt: number | null;
  createdAt: string;
  lastUsedAt: string;
}

export interface SessionLockData {
  token: string;
  pid: number;
  time: number;
}

export interface SessionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

export interface AcquireSessionResult {
  session?: SessionRecord;
  error?: string;
}

export interface GetSessionOptions {
  backend?: string;
  workspace?: string;
}
