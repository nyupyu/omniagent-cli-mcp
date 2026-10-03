import { spawn, ChildProcess } from 'child_process';
import path from 'path';

export const activeProcesses = new Set<ChildProcess>();

/**
 * Safely terminates a process and all its children across Windows and POSIX.
 */
export function killProcessSafely(proc: ChildProcess | null | undefined): void {
  if (!proc || !proc.pid) return;
  try {
    proc.stdin?.destroy();
    proc.stdout?.destroy();
    proc.stderr?.destroy();
  } catch (_) {}

  try {
    if (process.platform === 'win32') {
      if (proc.killed || proc.exitCode !== null) return;
      const taskkillExe = process.env.SystemRoot
        ? path.join(process.env.SystemRoot, 'System32', 'taskkill.exe')
        : 'taskkill.exe';
      const killer = spawn(taskkillExe, ['/pid', String(proc.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.on('error', () => {
        try {
          proc.kill('SIGTERM');
        } catch (_) {}
      });
    } else {
      // On POSIX, even if the leader proc has exited, surviving descendants in the process group (-proc.pid)
      // must be terminated to prevent dangling child sub-trees and hung pipes.
      try {
        process.kill(-proc.pid, 'SIGTERM');
      } catch (_) {
        try {
          proc.kill('SIGTERM');
        } catch (_) {}
      }
    }
  } catch (_) {
    try {
      proc.kill('SIGTERM');
    } catch (_) {}
  }
}

/**
 * Terminates all running child processes tracked by OmniAgent.
 */
export function terminateAllProcesses(): void {
  for (const proc of activeProcesses) {
    killProcessSafely(proc);
  }
  activeProcesses.clear();
}

process.on('SIGINT', () => {
  terminateAllProcesses();
  process.exit(0);
});

process.on('SIGTERM', () => {
  terminateAllProcesses();
  process.exit(0);
});

export const MAX_BUFFER_BYTES = 512 * 1024;

export interface RunCommandOptions {
  cwd?: string;
  stdinInput?: string | null;
  abortSignal?: AbortSignal | null;
  timeoutMs?: number | null;
  maxBufferBytes?: number;
  onProgress?: ((info: { message?: string; percent?: number }) => void) | null;
  onStderrLine?: ((line: string) => void) | null;
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  isTruncated?: boolean;
}

/**
 * Spawns a child command with stdin piping, stream decoding, and timeout/abort handling.
 */
export function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<RunCommandResult> {
  const {
    cwd = process.cwd(),
    stdinInput = null,
    abortSignal = null,
    timeoutMs = null,
    maxBufferBytes = MAX_BUFFER_BYTES,
    onStderrLine = null,
  } = options;

  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
        detached: process.platform !== 'win32',
      });
    } catch (err) {
      return reject(err);
    }

    activeProcesses.add(child);

    let timer: NodeJS.Timeout | null = null;
    let onAbort: (() => void) | null = null;

    const cleanup = () => {
      activeProcesses.delete(child);
      if (timer) clearTimeout(timer);
      if (abortSignal && onAbort) {
        abortSignal.removeEventListener('abort', onAbort);
      }
    };

    if (abortSignal) {
      if (abortSignal.aborted) {
        killProcessSafely(child);
        cleanup();
        return reject(new Error('Operation aborted'));
      }
      onAbort = () => {
        cleanup();
        killProcessSafely(child);
        reject(new Error('Operation aborted'));
      };
      abortSignal.addEventListener('abort', onAbort);
    }

    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      timer = setTimeout(() => {
        cleanup();
        killProcessSafely(child);
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    if (child.stdin) {
      child.stdin.on('error', () => {});
      if (stdinInput) {
        child.stdin.write(stdinInput);
      }
      child.stdin.end();
    }

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    child.stdout?.on('data', (d: string) => {
      const chunkBytes = Buffer.byteLength(d, 'utf8');
      if (stdoutBytes + chunkBytes <= maxBufferBytes) {
        stdout += d;
        stdoutBytes += chunkBytes;
      } else if (!stdoutTruncated) {
        const remaining = Math.max(0, maxBufferBytes - stdoutBytes);
        if (remaining > 0) {
          stdout += Buffer.from(d, 'utf8').subarray(0, remaining).toString('utf8');
          stdoutBytes += remaining;
        }
        stdout += '\n...[stdout truncated: buffer limit reached]';
        stdoutTruncated = true;
      }
    });

    child.stderr?.on('data', (d: string) => {
      const chunkBytes = Buffer.byteLength(d, 'utf8');
      if (stderrBytes + chunkBytes <= maxBufferBytes) {
        stderr += d;
        stderrBytes += chunkBytes;
      } else if (!stderrTruncated) {
        const remaining = Math.max(0, maxBufferBytes - stderrBytes);
        if (remaining > 0) {
          stderr += Buffer.from(d, 'utf8').subarray(0, remaining).toString('utf8');
          stderrBytes += remaining;
        }
        stderr += '\n...[stderr truncated: buffer limit reached]';
        stderrTruncated = true;
      }
      if (onStderrLine) {
        const lines = d.trim().split(/\r?\n/).filter(Boolean);
        for (const line of lines) {
          onStderrLine(line);
        }
      }
    });

    child.on('error', (err) => {
      cleanup();
      reject(err);
    });

    child.on('close', (code, signal) => {
      cleanup();
      resolve({
        stdout,
        stderr,
        exitCode: code,
        signal,
        isTruncated: stdoutTruncated || stderrTruncated,
      });
    });
  });
}
