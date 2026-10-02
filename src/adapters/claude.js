'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const { runCommand, killProcessSafely, activeProcesses } = require('../process.js');
const { getProgressStage } = require('../progress.js');

const CLAUDE_EXE = process.env.CLAUDE_PATH || 'claude';
const CLAUDE_CONFIG_DIR = path.join(os.homedir(), '.claude');

async function probe() {
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
    availableModels: [
      { id: 'claude-3-7-sonnet', tier: 'default', description: 'Hybrid reasoning and coding model' },
      { id: 'claude-3-5-sonnet', tier: 'standard', description: 'Fast code generation and analysis' },
      { id: 'claude-3-opus', tier: 'top-tier', description: 'Deep reasoning model (Requires user confirmation)' },
    ],
    supportedReasoningEfforts: ['low', 'medium', 'high', 'max'],
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    authCommand: 'claude auth login',
  };
}

/**
 * Executes Claude Code CLI in headless, read-only mode.
 * Strictly restricts tools to Read, Glob, Grep to enforce the Maker-Checker read-only guarantee.
 */
function executeClaude(prompt, options = {}) {
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

    const env = { ...process.env };
    // Map reasoning effort to MAX_THINKING_TOKENS if provided
    if (reasoningEffort) {
      const effortMap = {
        low: '2048',
        medium: '8192',
        high: '16384',
        max: '32000',
      };
      if (effortMap[reasoningEffort.toLowerCase()]) {
        env.MAX_THINKING_TOKENS = effortMap[reasoningEffort.toLowerCase()];
      }
    }

    let child;
    try {
      child = spawn(CLAUDE_EXE, args, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      });
    } catch (err) {
      return reject(err);
    }

    activeProcesses.add(child);

    let elapsed = 0;
    if (onProgress) {
      onProgress(getProgressStage(0, 'general', 'Claude'));
    }

    const progressTimer = setInterval(() => {
      elapsed += 3;
      if (onProgress) {
        onProgress(getProgressStage(elapsed, 'general', 'Claude'));
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
        if (clean.length > 0 && clean.length < 80) {
          onProgress?.(`[Claude] ${clean}`);
        }
      }
    });

    child.on('error', (err) => {
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

    child.on('close', (code, signal) => {
      cleanup();
      if (onProgress) {
        onProgress('Completed! Formatting output...', 100, 100);
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

module.exports = {
  probe,
  executeClaude,
  CLAUDE_EXE,
};
