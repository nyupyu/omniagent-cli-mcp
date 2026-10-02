'use strict';

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const activeProcesses = new Set();

/**
 * Safely terminates a process and all its children across Windows and POSIX.
 */
function killProcessSafely(proc) {
  if (!proc || !proc.pid || proc.killed || proc.exitCode !== null) return;
  try {
    if (process.platform === 'win32') {
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
      proc.kill('SIGTERM');
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
function terminateAllProcesses() {
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

/**
 * Spawns a child command with stdin piping, stream decoding, and timeout/abort handling.
 */
function runCommand(command, args, options = {}) {
  const {
    cwd = process.cwd(),
    stdinInput = null,
    abortSignal = null,
    timeoutMs = null,
    onProgress = null,
    onStderrLine = null,
  } = options;

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      });
    } catch (err) {
      return reject(err);
    }

    activeProcesses.add(child);

    let timer = null;
    let onAbort = null;

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

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (d) => {
      stdout += d;
    });

    child.stderr.on('data', (d) => {
      stderr += d;
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
      });
    });
  });
}

module.exports = {
  runCommand,
  killProcessSafely,
  terminateAllProcesses,
  activeProcesses,
};
