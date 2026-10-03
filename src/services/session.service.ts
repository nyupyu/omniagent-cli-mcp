import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  SessionRecord,
  SessionLockData,
  SessionResult,
  AcquireSessionResult,
  GetSessionOptions,
} from '../types/session.types.js';

export function getSessionsDir(): string {
  if (process.env.OMNIAGENT_SESSIONS_DIR) {
    return process.env.OMNIAGENT_SESSIONS_DIR;
  }
  if (process.env.OMNIAGENT_SESSIONS) {
    const p = process.env.OMNIAGENT_SESSIONS;
    return p.endsWith('.json') ? path.join(path.dirname(p), 'sessions') : p;
  }
  return path.join(os.homedir(), '.omniagent', 'sessions');
}

export const DEFAULT_SESSION_TTL_MS = 2 * 3600 * 1000; // 2 hours

export function isProcessAlive(pid?: number | null): boolean {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err.code === 'EPERM'; // Alive but owned by different user
  }
}

export function canonicalPath(p?: string | null): string {
  if (!p) return '';
  const resolved = path.resolve(p);
  try {
    if (fs.existsSync(resolved)) {
      return (fs.realpathSync as any).native ? (fs.realpathSync as any).native(resolved) : fs.realpathSync(resolved);
    }
  } catch (_) {}
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export function sanitizeHandle(handle?: string | null): string | null {
  if (!handle || typeof handle !== 'string') return null;
  return handle.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function getSessionFilePath(handle: string): string | null {
  const cleanHandle = sanitizeHandle(handle);
  if (!cleanHandle) return null;
  return path.join(getSessionsDir(), `${cleanHandle}.json`);
}

export function getBusyLockPath(handle: string): string | null {
  const cleanHandle = sanitizeHandle(handle);
  if (!cleanHandle) return null;
  return path.join(getSessionsDir(), `${cleanHandle}.busy`);
}

export function saveSessionFile(filePath: string, record: SessionRecord): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (err: any) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw new Error(`Failed to persist session to disk at '${filePath}': ${err.message}`);
  }
}

function sleepSync(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (_) {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
  }
}

function getBackoffDelay(attempt: number): number {
  const base = Math.min(80, 10 + attempt * 5);
  const jitter = Math.floor(Math.random() * 10);
  return base + jitter;
}

export function withSessionLock<T>(handle: string, fn: (filePath: string) => T): SessionResult<T> {
  const cleanHandle = sanitizeHandle(handle);
  if (!cleanHandle) return { ok: false, error: 'Invalid session handle format' };
  const filePath = getSessionFilePath(cleanHandle);
  if (!filePath) return { ok: false, error: 'Invalid session path' };
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const lockFile = `${filePath}.lock`;
  const reclaimMutex = `${lockFile}.reclaim`;
  const myToken = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const lockData = JSON.stringify({ token: myToken, pid: process.pid, time: Date.now() });

  const maxAttempts = 150;
  let acquired = false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // 1. Attempt exclusive lock creation
      fs.writeFileSync(lockFile, lockData, { flag: 'wx' });
      acquired = true;
      break;
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        let isStale = false;
        try {
          const raw = fs.readFileSync(lockFile, 'utf8');
          const data: SessionLockData = JSON.parse(raw);
          const hasPid = data && typeof data.pid === 'number';
          const isDead = hasPid && !isProcessAlive(data.pid);
          const stat = fs.statSync(lockFile);
          const isAbandoned = Date.now() - stat.mtimeMs > 5000;
          if (isDead || (isAbandoned && !hasPid)) {
            isStale = true;
          }
        } catch (_) {
          try {
            const stat = fs.statSync(lockFile);
            if (Date.now() - stat.mtimeMs > 5000) {
              isStale = true;
            }
          } catch (_) {}
        }

        if (isStale) {
          let wonReclaimMutex = false;
          try {
            fs.writeFileSync(reclaimMutex, JSON.stringify({ pid: process.pid, time: Date.now() }), { flag: 'wx' });
            wonReclaimMutex = true;
          } catch (_) {}

          if (wonReclaimMutex) {
            try {
              let staleToken: string | null = null;
              try {
                const raw = fs.readFileSync(lockFile, 'utf8');
                const data = JSON.parse(raw);
                if (data && data.token) staleToken = data.token;
              } catch (_) {}

              if (staleToken) {
                const reapPath = `${lockFile}.reap.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
                try {
                  fs.renameSync(lockFile, reapPath);
                  let wonReap = false;
                  try {
                    const reaped = JSON.parse(fs.readFileSync(reapPath, 'utf8'));
                    if (reaped && reaped.token === staleToken) {
                      wonReap = true;
                    }
                  } catch (_) {}
                  try { fs.unlinkSync(reapPath); } catch (_) {}

                  if (wonReap) {
                    fs.writeFileSync(lockFile, lockData, { flag: 'wx' });
                    acquired = true;
                    break;
                  }
                } catch (_) {}
              }
            } finally {
              try { fs.unlinkSync(reclaimMutex); } catch (_) {}
            }
          }
        }

        sleepSync(getBackoffDelay(attempt));
        if (attempt === maxAttempts - 1) {
          return { ok: false, error: `Session '${cleanHandle}' is temporarily locked. Please retry in a moment.` };
        }
        continue;
      }
      return { ok: false, error: err.message };
    }
  }

  if (!acquired) {
    return { ok: false, error: `Failed to acquire lock for session '${cleanHandle}'` };
  }

  try {
    const data = fn(filePath);
    return { ok: true, data };
  } finally {
    try {
      if (fs.existsSync(lockFile)) {
        const raw = fs.readFileSync(lockFile, 'utf8');
        const data = JSON.parse(raw);
        if (data && data.token === myToken) {
          fs.unlinkSync(lockFile);
        }
      }
    } catch (_) {}
  }
}

export function acquireSessionTurn(handle: string): SessionResult<any> {
  const cleanHandle = sanitizeHandle(handle);
  if (!cleanHandle) return { ok: false, error: 'Invalid session handle' };

  const res = withSessionLock(cleanHandle, (filePath) => {
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: `Session '${cleanHandle}' does not exist.` };
    }

    let session: SessionRecord;
    try {
      session = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e: any) {
      return { ok: false, error: `Session file corrupted: ${e.message}` };
    }

    // 1. Check if a turn is actively executing by a live process
    const isExecuting = session.activePid && isProcessAlive(session.activePid);
    if (isExecuting) {
      return {
        ok: false,
        error: `Session '${cleanHandle}' is currently busy executing another turn${session.activePid === process.pid ? '' : ` in process ${session.activePid}`}. Please wait for it to finish or omit 'session_handle'.`,
      };
    }

    // 2. Session is IDLE (not executing): now validate TTL
    const lastUsed = new Date(session.lastUsedAt).getTime();
    if (Date.now() - lastUsed > DEFAULT_SESSION_TTL_MS) {
      try { fs.unlinkSync(filePath); } catch (_) {}
      return { ok: false, error: `Session '${cleanHandle}' has expired (2-hour TTL). Please start a new session.` };
    }

    // 3. Unowned or previous owner PID is confirmed dead -> acquire turn exclusively
    session.activePid = process.pid;
    session.activeTurnAt = Date.now();
    session.lastUsedAt = new Date().toISOString();
    saveSessionFile(filePath, session);
    return { ok: true };
  });

  return res.data || res;
}

export function releaseSessionTurn(handle: string): SessionResult<any> {
  const cleanHandle = sanitizeHandle(handle);
  if (!cleanHandle) return { ok: false, error: 'Invalid session handle' };

  const result = withSessionLock(cleanHandle, (filePath) => {
    if (!fs.existsSync(filePath)) return { ok: true };
    try {
      const session: SessionRecord = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (session.activePid === process.pid) {
        session.activePid = null;
        session.activeTurnAt = null;
        session.lastUsedAt = new Date().toISOString();
        saveSessionFile(filePath, session);
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: `Failed to persist released turn: ${e.message}` };
    }
  });

  return (result.data as SessionResult) || result;
}

let lastPruneTime = 0;
let pruneCursor = 0;
const PRUNE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const PRUNE_BATCH_SIZE = 100;

export function pruneExpiredSessions(force = false): void {
  const now = Date.now();
  if (!force && now - lastPruneTime < PRUNE_INTERVAL_MS) {
    return;
  }
  lastPruneTime = now;

  try {
    const dir = getSessionsDir();
    if (!fs.existsSync(dir)) return;

    const allFiles = fs.readdirSync(dir);
    if (!allFiles || allFiles.length === 0) return;

    const totalFiles = allFiles.length;
    const startIdx = pruneCursor % totalFiles;
    pruneCursor = (startIdx + PRUNE_BATCH_SIZE) % totalFiles;
    const batchCount = Math.min(totalFiles, PRUNE_BATCH_SIZE);

    for (let i = 0; i < batchCount; i++) {
      const file = allFiles[(startIdx + i) % totalFiles];
      const fullPath = path.join(dir, file);

      if (file.endsWith('.lock') || file.includes('.lock.') || file.includes('.reclaim') || file.includes('.busy')) {
        try {
          let isStale = false;
          try {
            const raw = fs.readFileSync(fullPath, 'utf8');
            const data = JSON.parse(raw);
            const hasPid = data && typeof data.pid === 'number';
            if (hasPid && isProcessAlive(data.pid)) {
              continue;
            }
            if (hasPid && !isProcessAlive(data.pid)) {
              isStale = true;
            } else {
              const st = fs.statSync(fullPath);
              if (now - st.mtimeMs > 60000) isStale = true;
            }
          } catch (_) {
            try {
              const st = fs.statSync(fullPath);
              if (now - st.mtimeMs > 60000) isStale = true;
            } catch (_) {}
          }
          if (isStale) {
            try { fs.unlinkSync(fullPath); } catch (_) {}
          }
        } catch (_) {}
        continue;
      }

      if (!file.startsWith('omni_sess_') || !file.endsWith('.json')) {
        continue;
      }

      const cleanHandle = file.replace(/\.json$/, '');
      withSessionLock(cleanHandle, (fPath) => {
        if (!fs.existsSync(fPath)) return;
        try {
          const raw = fs.readFileSync(fPath, 'utf8');
          const session = JSON.parse(raw);
          if (session && session.lastUsedAt) {
            if (session.activePid && isProcessAlive(session.activePid)) {
              return;
            }
            const lastUsed = new Date(session.lastUsedAt).getTime();
            if (now - lastUsed > DEFAULT_SESSION_TTL_MS) {
              fs.unlinkSync(fPath);
            }
          }
        } catch (_) {
          try {
            const st = fs.statSync(fPath);
            if (now - st.mtimeMs > 60000) {
              fs.unlinkSync(fPath);
            }
          } catch (_) {}
        }
      });
    }
  } catch (_) {}
}

export function createSession(backend: string, workspace = process.cwd(), threadId: string | null = null): SessionRecord {
  pruneExpiredSessions();
  const handle = `omni_sess_${crypto.randomBytes(6).toString('hex')}`;
  const record: SessionRecord = {
    sessionHandle: handle,
    backend: backend.toLowerCase(),
    threadId: threadId || null,
    workspace: canonicalPath(workspace),
    activePid: null,
    activeTurnAt: null,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };

  const filePath = getSessionFilePath(handle);
  if (filePath) {
    saveSessionFile(filePath, record);
  }
  return record;
}

export function getSession(sessionHandle: string, options: GetSessionOptions = {}): SessionRecord | null {
  const filePath = getSessionFilePath(sessionHandle);
  if (!filePath || !fs.existsSync(filePath)) return null;

  let session: SessionRecord;
  try {
    session = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }

  if (!session || typeof session !== 'object') return null;

  const isExecuting = session.activePid && isProcessAlive(session.activePid);
  if (!isExecuting) {
    const lastUsed = new Date(session.lastUsedAt).getTime();
    if (Date.now() - lastUsed > DEFAULT_SESSION_TTL_MS) {
      try { fs.unlinkSync(filePath); } catch (_) {}
      return null;
    }
  }

  if (options.backend && session.backend !== options.backend.toLowerCase()) {
    return null;
  }

  if (options.workspace) {
    const expected = canonicalPath(options.workspace);
    const actual = canonicalPath(session.workspace);
    if (expected !== actual) {
      return null;
    }
  }

  return session;
}

export function updateSession(sessionHandle: string, updates: Partial<SessionRecord> = {}): SessionRecord | null {
  const filePath = getSessionFilePath(sessionHandle);
  if (!filePath || !fs.existsSync(filePath)) return null;

  let session: SessionRecord;
  try {
    session = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }

  const updatedRecord: SessionRecord = {
    ...session,
    ...updates,
    lastUsedAt: new Date().toISOString(),
  };

  saveSessionFile(filePath, updatedRecord);
  return updatedRecord;
}

export function closeSession(sessionHandle: string): boolean {
  const cleanHandle = sanitizeHandle(sessionHandle);
  if (!cleanHandle) return false;

  const turnLock = acquireSessionTurn(cleanHandle);
  if (!turnLock.ok) {
    throw new Error(`Cannot close session '${cleanHandle}': ${turnLock.error}`);
  }

  try {
    const filePath = getSessionFilePath(cleanHandle);
    let closed = false;
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        closed = true;
      } catch (err: any) {
        throw new Error(`Failed to close session at '${filePath}': ${err.message}`);
      }
    }
    return closed;
  } finally {
    releaseSessionTurn(cleanHandle);
  }
}

export function acquireAndResolveSession(sessionHandle?: string | null, backendId = 'codex', workspaceCwd = process.cwd()): AcquireSessionResult {
  if (sessionHandle) {
    const cleanHandle = sanitizeHandle(sessionHandle);
    if (!cleanHandle) {
      return { error: `Invalid session handle format: '${sessionHandle}'` };
    }
    const turnLock = acquireSessionTurn(cleanHandle);
    if (!turnLock.ok) {
      return { error: turnLock.error };
    }

    const existing = getSession(cleanHandle, { backend: backendId, workspace: workspaceCwd });
    if (!existing) {
      releaseSessionTurn(cleanHandle);
      return {
        error: `Invalid or expired session handle: '${sessionHandle}'. The session may have expired (2-hour TTL), been closed, or was opened in another workspace or backend. Please omit 'session_handle' to start a new session.`,
      };
    }
    return { session: existing };
  }

  const session = createSession(backendId, workspaceCwd);
  const turnLock = acquireSessionTurn(session.sessionHandle);
  if (!turnLock.ok) {
    return { error: turnLock.error };
  }
  return { session };
}

export function resolveOrInitSession(sessionHandle?: string | null, backendId = 'codex', workspaceCwd = process.cwd()): AcquireSessionResult {
  if (sessionHandle) {
    const existing = getSession(sessionHandle, { backend: backendId, workspace: workspaceCwd });
    if (!existing) {
      return {
        error: `Invalid or expired session handle: '${sessionHandle}'. The session may have expired (2-hour TTL), been closed, or was opened in another workspace or backend. Please omit 'session_handle' to start a new session.`,
      };
    }
    return { session: existing };
  }
  return { session: createSession(backendId, workspaceCwd) };
}
