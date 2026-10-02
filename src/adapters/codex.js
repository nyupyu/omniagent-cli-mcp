'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const { runCommand, killProcessSafely, activeProcesses } = require('../process.js');
const { getProgressStage } = require('../progress.js');

const CODEX_EXE = process.env.CODEX_PATH || 'codex';
const CODEX_CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml');

const VALID_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

function isExecutable(cmd) {
  try {
    const probe = spawn(cmd, ['--version'], {
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
    });
    probe.on('error', () => {});
    return true;
  } catch (_) {
    return false;
  }
}

function resolveCodexCommand() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || '';
    const globalCodexJs = path.join(appData, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (fs.existsSync(globalCodexJs)) {
      return { command: process.execPath, argsPrefix: [globalCodexJs] };
    }
  }
  return { command: CODEX_EXE, argsPrefix: [] };
}

const CODEX_CMD = resolveCodexCommand();

function readCodexConfig() {
  const result = {
    defaultModel: 'gpt-6.1-sol',
    defaultReasoningEffort: 'high',
    sandboxMode: 'read-only',
  };

  try {
    if (fs.existsSync(CODEX_CONFIG_PATH)) {
      const content = fs.readFileSync(CODEX_CONFIG_PATH, 'utf-8');
      const modelMatch = content.match(/model\s*=\s*["']([^"']+)["']/);
      if (modelMatch) result.defaultModel = modelMatch[1];

      const effortMatch = content.match(/model_reasoning_effort\s*=\s*["']([^"']+)["']/);
      if (effortMatch && VALID_REASONING_EFFORTS.includes(effortMatch[1])) {
        result.defaultReasoningEffort = effortMatch[1];
      }
    }
  } catch (_) {}

  return result;
}

function normalizeReasoningEffort(effort, defaultEffort = 'high') {
  if (typeof effort === 'string' && VALID_REASONING_EFFORTS.includes(effort.toLowerCase())) {
    return effort.toLowerCase();
  }
  return defaultEffort;
}

async function probe() {
  const config = readCodexConfig();
  let installed = false;
  let version = 'unknown';

  try {
    const res = await runCommand(CODEX_CMD.command, [...CODEX_CMD.argsPrefix, '--version'], { timeoutMs: 5000 });
    if (res.exitCode === 0) {
      installed = true;
      version = res.stdout.trim() || 'installed';
    }
  } catch (_) {}

  return {
    id: 'codex',
    name: 'OpenAI Codex CLI',
    installed,
    version,
    command: CODEX_CMD.command,
    configPath: CODEX_CONFIG_PATH,
    config,
    availableModels: [
      { id: 'gpt-6.1-sol', tier: 'default', description: 'Flagship general-purpose model' },
      { id: 'gpt-6.0-sol', tier: 'standard', description: 'Previous stable flagship' },
      { id: 'luna', tier: 'fast', description: 'High-speed model for quick advice' },
      { id: 'astra', tier: 'top-tier', description: 'Maximum depth reasoning model (Requires user confirmation)' },
    ],
    supportedReasoningEfforts: VALID_REASONING_EFFORTS,
    installCommand: 'npm install -g @openai/codex',
    authCommand: 'codex login',
  };
}

function executeCodex(args, stdinInput = null, cwd = process.cwd(), abortSignal = null, onProgress = null) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(
      os.tmpdir(),
      `codex-out-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.txt`
    );

    const cleanArgs = args[0] === 'exec' ? args.slice(1) : args;
    const fullArgs = ['exec', '--skip-git-repo-check', '--ephemeral', '-o', tmpFile, ...cleanArgs];

    const child = spawn(CODEX_CMD.command, [...CODEX_CMD.argsPrefix, ...fullArgs], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });

    activeProcesses.add(child);

    let elapsed = 0;
    if (onProgress) {
      onProgress(getProgressStage(0, 'general', 'Codex'));
    }

    const progressTimer = setInterval(() => {
      elapsed += 3;
      if (onProgress) {
        onProgress(getProgressStage(elapsed, 'general', 'Codex'));
      }
    }, 3000);

    function cleanup() {
      clearInterval(progressTimer);
      try {
        if (fs.existsSync(tmpFile)) {
          fs.unlinkSync(tmpFile);
        }
      } catch (_) {}
    }

    if (abortSignal) {
      if (abortSignal.aborted) {
        killProcessSafely(child);
      } else {
        abortSignal.addEventListener('abort', () => {
          killProcessSafely(child);
        });
      }
    }

    if (child.stdin) {
      child.stdin.on('error', () => {});
      if (stdinInput) {
        child.stdin.write(stdinInput);
      }
      child.stdin.end();
    }

    let stderr = '';
    let stdout = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (d) => {
      stdout += d;
    });

    child.stderr.on('data', (d) => {
      stderr += d;
      const lines = d.trim().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const clean = line.trim();
        if (clean.startsWith('mcp:') || clean.startsWith('exec') || clean.startsWith('warning:')) {
          onProgress?.(`[Codex] ${clean.slice(0, 80)}`);
        }
      }
    });

    child.on('error', (err) => {
      activeProcesses.delete(child);
      cleanup();
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            `[CODEX_CLI_NOT_FOUND] Could not find executable '${CODEX_EXE}'. Please install OpenAI Codex CLI ('npm install -g @openai/codex') and ensure 'codex' is in your PATH.`
          )
        );
      } else {
        reject(err);
      }
    });

    child.on('close', (code, signal) => {
      activeProcesses.delete(child);
      if (onProgress) {
        onProgress('Completed! Formatting output...', 100, 100);
      }
      let result = '';
      if (fs.existsSync(tmpFile)) {
        try {
          result = fs.readFileSync(tmpFile, 'utf-8').trim();
        } catch (_) {}
      }

      cleanup();

      if (!result && stdout) {
        result = stdout.trim();
      }

      if (code !== 0 || signal) {
        const errorDetail = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n') || `Process exited with code ${code || signal}`;
        resolve({
          isError: true,
          errorDetail,
          output: `Codex execution error (${code || signal}):\n${errorDetail}${result ? '\nPartial output:\n' + result : ''}`.trim(),
          exitCode: code,
        });
      } else {
        resolve({ isError: false, output: result, exitCode: 0 });
      }
    });
  });
}

function executeCodexReview(args, cwd = process.cwd(), abortSignal = null, onProgress = null) {
  return new Promise((resolve, reject) => {
    const fullArgs = ['review', '--config', 'sandbox_mode="read-only"', ...args];

    const child = spawn(CODEX_CMD.command, [...CODEX_CMD.argsPrefix, ...fullArgs], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });

    activeProcesses.add(child);

    let elapsed = 0;
    if (onProgress) {
      onProgress(getProgressStage(0, 'review', 'Codex'));
    }

    const progressTimer = setInterval(() => {
      elapsed += 3;
      if (onProgress) {
        onProgress(getProgressStage(elapsed, 'review', 'Codex'));
      }
    }, 3000);

    const cleanup = () => {
      clearInterval(progressTimer);
    };

    if (abortSignal) {
      if (abortSignal.aborted) {
        killProcessSafely(child);
      } else {
        abortSignal.addEventListener('abort', () => {
          killProcessSafely(child);
        });
      }
    }

    if (child.stdin) {
      child.stdin.on('error', () => {});
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
      const lines = d.trim().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const clean = line.trim();
        if (clean.startsWith('mcp:') || clean.startsWith('exec') || clean.startsWith('warning:')) {
          onProgress?.(`[Codex Review] ${clean.slice(0, 80)}`);
        }
      }
    });

    child.on('error', (err) => {
      activeProcesses.delete(child);
      cleanup();
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            `[CODEX_CLI_NOT_FOUND] Could not find executable '${CODEX_EXE}'. Please install OpenAI Codex CLI ('npm install -g @openai/codex') and ensure 'codex' is in your PATH.`
          )
        );
      } else {
        reject(err);
      }
    });

    child.on('close', (code, signal) => {
      activeProcesses.delete(child);
      cleanup();
      if (onProgress) {
        onProgress('Review complete! Formatting findings...', 100, 100);
      }
      const output = stdout.trim();
      if (code !== 0 || signal) {
        const errorDetail = stderr.trim() || `Review process exited with code ${code || signal}`;
        resolve({
          isError: true,
          errorDetail,
          output: `Codex review error (${code || signal}):\n${errorDetail}${output ? '\nPartial review:\n' + output : ''}`.trim(),
          exitCode: code,
        });
      } else {
        resolve({
          isError: false,
          output: output || 'Codex review reported no changes or clean status.',
          exitCode: 0,
        });
      }
    });
  });
}

module.exports = {
  probe,
  readCodexConfig,
  normalizeReasoningEffort,
  executeCodex,
  executeCodexReview,
  CODEX_EXE,
  CODEX_CONFIG_PATH,
  VALID_REASONING_EFFORTS,
};
