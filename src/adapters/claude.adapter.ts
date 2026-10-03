import path from 'path';
import os from 'os';
import fs from 'fs';
import { spawn } from 'child_process';
import { runCommand, killProcessSafely, activeProcesses, MAX_BUFFER_BYTES } from '../services/process.service.js';
import { getProgressStage } from '../services/progress.service.js';
import { AdapterProbeResult, ExecutionResult, ExecutionOptions, CliAdapter } from '../types/adapter.types.js';

export const id = 'claude';
export const name = 'Claude Code CLI';
export const CLAUDE_EXE = process.env.CLAUDE_PATH || 'claude';
export const CLAUDE_CONFIG_DIR = path.join(os.homedir(), '.claude');

export async function probe(): Promise<AdapterProbeResult> {
  let installed = false;
  let version = 'unknown';
  let authType = 'unavailable';

  try {
    const res = await runCommand(CLAUDE_EXE, ['--version'], { timeoutMs: 5000 });
    if (res.exitCode === 0) {
      installed = true;
      version = res.stdout.trim() || 'installed';
    }
  } catch (_) {}

  // Check auth evidence
  if (process.env.ANTHROPIC_API_KEY) {
    authType = 'api_key';
  } else if (fs.existsSync(CLAUDE_CONFIG_DIR)) {
    authType = 'subscription_config_present';
  }

  return {
    id: 'claude',
    name: 'Claude Code CLI',
    installed,
    version,
    command: CLAUDE_EXE,
    authStatus: authType,
    availableModels: ['claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-opus'],
    supportedReasoningEfforts: ['low', 'medium', 'high', 'max'],
  };
}

/**
 * Executes Claude Code CLI in headless, read-only mode.
 * Strictly restricts tools to Read, Glob, Grep to enforce the Maker-Checker read-only guarantee.
 */
export function executeClaude(prompt: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
  const {
    cwd = process.cwd(),
    model = null,
    reasoningEffort = null,
    abortSignal = null,
    onProgress = null,
  } = options;

  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--permission-mode', 'dontAsk',
      '--tools', 'Read,Glob,Grep',
    ];

    if (model && typeof model === 'string') {
      args.push('--model', model.trim());
    }

    const env: NodeJS.ProcessEnv = { ...process.env };
    // Map reasoning effort to MAX_THINKING_TOKENS if provided
    if (reasoningEffort) {
      const effortMap: Record<string, string> = {
        low: '2048',
        medium: '8192',
        high: '16384',
        max: '32000',
      };
      if (effortMap[reasoningEffort.toLowerCase()]) {
        env.MAX_THINKING_TOKENS = effortMap[reasoningEffort.toLowerCase()];
      }
    }

    let child: any;
    try {
      child = spawn(CLAUDE_EXE, args, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
        detached: process.platform !== 'win32',
      });
    } catch (err) {
      return reject(err);
    }

    activeProcesses.add(child);

    let elapsed = 0;
    if (onProgress) {
      onProgress(getProgressStage(0, 'general', 'Claude') as any);
    }

    const progressTimer = setInterval(() => {
      elapsed += 3;
      if (onProgress) {
        onProgress(getProgressStage(elapsed, 'general', 'Claude') as any);
      }
    }, 3000);

    const cleanup = () => {
      clearInterval(progressTimer);
      activeProcesses.delete(child);
    };

    if (abortSignal) {
      if (abortSignal.aborted) {
        killProcessSafely(child);
        cleanup();
        return reject(new Error('Operation aborted'));
      }
      abortSignal.addEventListener('abort', () => {
        killProcessSafely(child);
      });
    }

    if (child.stdin) {
      child.stdin.on('error', () => {});
      if (prompt) {
        child.stdin.write(prompt);
      }
      child.stdin.end();
    }

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (d: string) => {
      const chunkBytes = Buffer.byteLength(d, 'utf8');
      if (stdoutBytes + chunkBytes <= MAX_BUFFER_BYTES) {
        stdout += d;
        stdoutBytes += chunkBytes;
      } else if (stdoutBytes < MAX_BUFFER_BYTES) {
        const remaining = MAX_BUFFER_BYTES - stdoutBytes;
        stdout += Buffer.from(d, 'utf8').subarray(0, remaining).toString('utf8') + '\n...[stdout truncated]';
        stdoutBytes = MAX_BUFFER_BYTES;
      }
    });

    child.stderr.on('data', (d: string) => {
      const chunkBytes = Buffer.byteLength(d, 'utf8');
      if (stderrBytes + chunkBytes <= MAX_BUFFER_BYTES) {
        stderr += d;
        stderrBytes += chunkBytes;
      } else if (stderrBytes < MAX_BUFFER_BYTES) {
        const remaining = MAX_BUFFER_BYTES - stderrBytes;
        stderr += Buffer.from(d, 'utf8').subarray(0, remaining).toString('utf8') + '\n...[stderr truncated]';
        stderrBytes = MAX_BUFFER_BYTES;
      }
      const lines = d.trim().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const clean = line.trim();
        if (clean.length > 0 && clean.length < 80) {
          onProgress?.(`[Claude] ${clean}` as any);
        }
      }
    });

    child.on('error', (err: any) => {
      cleanup();
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            `[CLAUDE_CLI_NOT_FOUND] Could not find executable '${CLAUDE_EXE}'. Please install Claude Code CLI ('npm install -g @anthropic-ai/claude-code') and ensure 'claude' is in your PATH.`
          )
        );
      } else {
        reject(err);
      }
    });

    child.on('close', (code: number | null, signal: string | null) => {
      cleanup();
      if (onProgress) {
        onProgress('Completed! Formatting output...' as any);
      }

      const output = stdout.trim();
      if (code !== 0 || signal) {
        const errorDetail = stderr.trim() || `Claude process exited with code ${code || signal}`;
        resolve({
          isError: true,
          errorDetail,
          output: `Claude execution error (${code || signal}):\n${errorDetail}${output ? '\nPartial output:\n' + output : ''}`.trim(),
          exitCode: code,
        });
      } else {
        resolve({
          isError: false,
          output: output || 'Claude returned clean output.',
          exitCode: 0,
        });
      }
    });
  });
}

export function execute(prompt: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
  return executeClaude(prompt, options);
}

export const claudeAdapter: CliAdapter = {
  id,
  name,
  probe,
  execute,
};

export default claudeAdapter;
