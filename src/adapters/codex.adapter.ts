import path from 'path';
import os from 'os';
import fs from 'fs';
import { spawn } from 'child_process';
import { runCommand, killProcessSafely, activeProcesses, MAX_BUFFER_BYTES } from '../services/process.service.js';
import { getProgressStage } from '../services/progress.service.js';
import { AdapterProbeResult, ExecutionResult, ExecutionOptions, CliAdapter } from '../types/adapter.types.js';

export const id = 'codex';
export const name = 'OpenAI Codex CLI';
export const CODEX_EXE = process.env.CODEX_PATH || 'codex';
export const CODEX_CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml');

export const VALID_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

export interface CodexConfig {
  defaultModel: string;
  defaultReasoningEffort: string;
  sandboxMode: string;
}

export function resolveCodexCommand(): { command: string; argsPrefix: string[] } {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || '';
    const globalCodexJs = path.join(appData, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (fs.existsSync(globalCodexJs)) {
      return { command: process.execPath, argsPrefix: [globalCodexJs] };
    }
  }
  return { command: CODEX_EXE, argsPrefix: [] };
}

export const CODEX_CMD = resolveCodexCommand();

export function readCodexConfig(): CodexConfig {
  const result: CodexConfig = {
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

export function normalizeReasoningEffort(effort?: string | null, defaultEffort = 'high'): string {
  if (typeof effort === 'string' && VALID_REASONING_EFFORTS.includes(effort.toLowerCase())) {
    return effort.toLowerCase();
  }
  return defaultEffort;
}

export async function probe(): Promise<AdapterProbeResult> {
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
    availableModels: ['gpt-6.1-sol', 'gpt-6.0-sol', 'luna', 'astra'],
    supportedReasoningEfforts: VALID_REASONING_EFFORTS,
  };
}

export function formatCodexActivity(event: any): string | null {
  if (!event || typeof event !== 'object') return null;
  const type = event.type;

  if (type === 'thread.started') {
    return 'Initializing session...';
  }
  if (type === 'turn.started') {
    return 'Starting task analysis...';
  }
  if (type === 'item.started' || type === 'item.updated') {
    const item = event.item || event;
    const itemType = item.type || item.item_type || '';

    if (itemType === 'command') {
      const cmd = (item.command || item.detail || '').replace(/[\r\n]+/g, ' ');
      return `Running: ${cmd.slice(0, 50)}${cmd.length > 50 ? '...' : ''}`;
    }
    if (itemType === 'file_search' || itemType === 'search') {
      const q = item.query || item.pattern || '';
      return `Searching: ${q || 'repository'}`;
    }
    if (itemType === 'read_file' || itemType === 'file_read') {
      const f = item.path || item.file || '';
      return `Reading: ${path.basename(f) || 'file'}`;
    }
    if (itemType === 'thought' || itemType === 'reasoning') {
      const summary = (item.summary || item.text || item.content || '').replace(/[\r\n]+/g, ' ').trim();
      if (summary) {
        return `Reasoning: ${summary.slice(0, 60)}${summary.length > 60 ? '...' : ''}`;
      }
      return 'Analyzing architecture...';
    }
    if (itemType === 'agent_message' || itemType === 'message') {
      return 'Formulating findings...';
    }
    if (item.summary) {
      return String(item.summary).replace(/[\r\n]+/g, ' ').slice(0, 60);
    }
  }
  if (type === 'item.completed') {
    const item = event.item || event;
    if (item.type === 'command') {
      const cmd = (item.command || 'command').replace(/[\r\n]+/g, ' ');
      return `Completed: ${cmd.slice(0, 40)}`;
    }
  }
  return null;
}

export function truncateToByteLength(str: string, maxBytes: number, suffix = ''): string {
  if (typeof str !== 'string') return '';
  const suffixBytes = Buffer.byteLength(suffix, 'utf8');
  if (Buffer.byteLength(str, 'utf8') <= maxBytes) return str;
  const targetBytes = Math.max(0, maxBytes - suffixBytes);
  const buf = Buffer.from(str, 'utf8');
  let end = targetBytes;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) {
    end--;
  }
  return buf.toString('utf8', 0, end) + suffix;
}

export interface CodexStreamCollectorOptions {
  onProgress?: ((message: string) => void) | null;
  maxLineBuffer?: number;
  maxTotalMessageBytes?: number;
  maxMessages?: number;
  maxTextPerMessage?: number;
}

export function createCodexStreamCollector({
  onProgress = null,
  maxLineBuffer = 1024 * 1024,
  maxTotalMessageBytes = 1024 * 1024,
  maxMessages = 50,
  maxTextPerMessage = 512 * 1024,
}: CodexStreamCollectorOptions = {}) {
  let stdoutBuffer = '';
  let discardingOversizedLine = false;
  let hasDiscardedOversizedLine = false;
  let capturedThreadId: string | null = null;
  let totalMessageBytes = 0;

  const messageMap = new Map<string, string>();
  const rawFallbackLines: string[] = [];
  const jsonErrorLines: string[] = [];
  const MAX_FALLBACK_LINES = 20;

  function processLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('{')) {
      try {
        const event = JSON.parse(trimmed);
        if (event.type === 'thread.started' && (event.thread_id || event.id)) {
          capturedThreadId = event.thread_id || event.id;
        }
        const item = event.item || event;
        if (item.type === 'agent_message' || item.type === 'message') {
          let text = item.text || item.content || item.message;
          if (text && typeof text === 'string') {
            if (Buffer.byteLength(text, 'utf8') > maxTextPerMessage) {
              text = truncateToByteLength(text, maxTextPerMessage, '\n...[truncated]');
            }
            const msgBytes = Buffer.byteLength(text, 'utf8');
            const id = item.id || `msg_${messageMap.size}`;
            if (messageMap.has(id)) {
              // Update accumulated message in-place with latest completed/updated text
              const prevText = messageMap.get(id)!;
              const prevBytes = Buffer.byteLength(prevText, 'utf8');
              const delta = msgBytes - prevBytes;
              if (totalMessageBytes + delta <= maxTotalMessageBytes) {
                messageMap.set(id, text);
                totalMessageBytes += delta;
              } else {
                // Under budget pressure, ALWAYS replace draft with bounded latest text and explicit truncation
                const availableBytes = Math.max(0, maxTotalMessageBytes - (totalMessageBytes - prevBytes));
                let truncated: string;
                if (availableBytes >= 20) {
                  truncated = truncateToByteLength(text, availableBytes, '\n...[truncated]');
                } else {
                  truncated = '[truncated]';
                }
                messageMap.set(id, truncated);
                totalMessageBytes = (totalMessageBytes - prevBytes) + Buffer.byteLength(truncated, 'utf8');
              }
            } else {
              if (messageMap.size < maxMessages) {
                if (totalMessageBytes + msgBytes <= maxTotalMessageBytes) {
                  messageMap.set(id, text);
                  totalMessageBytes += msgBytes;
                } else {
                  const availableBytes = Math.max(0, maxTotalMessageBytes - totalMessageBytes);
                  if (availableBytes >= 20) {
                    const truncated = truncateToByteLength(text, availableBytes, '\n...[truncated]');
                    messageMap.set(id, truncated);
                    totalMessageBytes += Buffer.byteLength(truncated, 'utf8');
                  } else if (availableBytes > 0) {
                    messageMap.set(id, '[truncated]');
                    totalMessageBytes += Buffer.byteLength('[truncated]', 'utf8');
                  }
                }
              }
            }
          }
        }
        const err = event.error || (event.type === 'error' || event.type === 'turn.failed' ? event : null);
        if (err && jsonErrorLines.length < 20) {
          const rawMsg = typeof err === 'string'
            ? err
            : (err.message || err.detail || (err.error && err.error.message) || JSON.stringify(err));
          if (rawMsg) {
            const prefix = '[Codex Error] ';
            const maxMsgLen = 500 - prefix.length;
            let cleanMsg = String(rawMsg);
            if (cleanMsg.length > maxMsgLen) {
              cleanMsg = cleanMsg.slice(0, maxMsgLen - 3) + '...';
            }
            jsonErrorLines.push(`${prefix}${cleanMsg}`);
          }
        }
        const activity = formatCodexActivity(event);
        if (activity && onProgress) {
          onProgress(`[Codex] ${activity}`);
        }
      } catch (_) {
        if (rawFallbackLines.length < MAX_FALLBACK_LINES) {
          rawFallbackLines.push(trimmed.slice(0, 500));
        }
      }
    } else {
      if (rawFallbackLines.length < MAX_FALLBACK_LINES) {
        rawFallbackLines.push(trimmed.slice(0, 500));
      }
    }
  }

  function pushChunk(chunk: string) {
    stdoutBuffer += chunk;

    // Preserve record boundaries: if a record exceeds maxLineBuffer without a newline, discard it cleanly
    if (Buffer.byteLength(stdoutBuffer, 'utf8') > maxLineBuffer && !stdoutBuffer.includes('\n')) {
      stdoutBuffer = '';
      discardingOversizedLine = true;
      hasDiscardedOversizedLine = true;
      return;
    }

    if (!stdoutBuffer.includes('\n')) {
      return;
    }

    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || ''; // Keep trailing incomplete fragment

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (discardingOversizedLine) {
        discardingOversizedLine = false;
        continue;
      }
      processLine(line);
    }
  }

  function flush() {
    if (stdoutBuffer && !discardingOversizedLine) {
      processLine(stdoutBuffer);
      stdoutBuffer = '';
    }
  }

  function getFormattedOutput(exitCode = 0, signal: any = null): string {
    const agentMessages = Array.from(messageMap.values());
    if (agentMessages.length > 0) {
      return agentMessages.join('\n\n').trim();
    }
    if (rawFallbackLines.length > 0) {
      return rawFallbackLines.join('\n').trim();
    }
    if (exitCode === 0 && !signal) {
      return 'Task completed cleanly with no textual output.';
    }
    return '';
  }

  return {
    pushChunk,
    flush,
    getCapturedThreadId: () => capturedThreadId,
    getFormattedOutput,
    getMessageMap: () => messageMap,
    getJsonErrors: () => [...jsonErrorLines],
    getRawFallbackLines: () => [...rawFallbackLines],
    hasOversizedLine: () => hasDiscardedOversizedLine,
  };
}

export function executeCodex(
  args: string[],
  stdinInput: string | null = null,
  cwd = process.cwd(),
  abortSignal: AbortSignal | null = null,
  onProgress: ((msg: string, percent?: number, total?: number) => void) | null = null,
  options: { threadId?: string | null } = {}
): Promise<ExecutionResult> {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(
      os.tmpdir(),
      `codex-out-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.txt`
    );

    let cleanArgs = args[0] === 'exec' ? args.slice(1) : args;
    const isResume = !!options.threadId;

    let fullArgs: string[];
    if (isResume) {
      let sandboxMode = 'read-only';
      const resumeArgs: string[] = [];
      for (let i = 0; i < cleanArgs.length; i++) {
        if (cleanArgs[i] === '--sandbox' || cleanArgs[i] === '-s') {
          if (cleanArgs[i + 1] && !cleanArgs[i + 1].startsWith('-')) {
            sandboxMode = cleanArgs[i + 1];
            i++;
          }
          continue;
        }
        resumeArgs.push(cleanArgs[i]);
      }

      fullArgs = [
        'exec',
        '--sandbox',
        sandboxMode,
        'resume',
        '--skip-git-repo-check',
        '--json',
        '-o',
        tmpFile,
        options.threadId!,
        ...resumeArgs,
      ];
    } else {
      fullArgs = ['exec', '--skip-git-repo-check', '--json', '-o', tmpFile, ...cleanArgs];
    }

    const child = spawn(CODEX_CMD.command, [...CODEX_CMD.argsPrefix, ...fullArgs], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
      detached: process.platform !== 'win32',
    });

    activeProcesses.add(child);

    let elapsed = 0;
    let lastActivityTime = Date.now();
    let capturedThreadId = options.threadId || null;

    if (onProgress) {
      onProgress(isResume ? '[Codex] Resuming conversation session...' : '[Codex] Initializing agent environment...');
    }

    const progressTimer = setInterval(() => {
      elapsed += 3;
      if (Date.now() - lastActivityTime > 8000 && onProgress) {
        onProgress(`[Codex] Deep reasoning in progress... (${elapsed}s elapsed)`);
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
    const MAX_STDERR_BYTES = 64 * 1024;

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    const collector = createCodexStreamCollector({
      onProgress: (p) => {
        lastActivityTime = Date.now();
        onProgress?.(p);
      },
    });

    child.stdout?.on('data', (d: string) => {
      collector.pushChunk(d);
    });

    child.stderr?.on('data', (d: string) => {
      if (stderr.length < MAX_STDERR_BYTES) {
        stderr += d;
      }
      const lines = d.trim().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const clean = line.trim();
        if (clean.startsWith('mcp:') || clean.startsWith('exec') || clean.startsWith('warning:')) {
          onProgress?.(`[Codex] ${clean.slice(0, 80)}`);
        }
      }
    });

    child.on('error', (err: any) => {
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

      collector.flush();
      if (collector.getCapturedThreadId()) {
        capturedThreadId = collector.getCapturedThreadId();
      }

      let result = '';
      if (fs.existsSync(tmpFile)) {
        try {
          result = fs.readFileSync(tmpFile, 'utf-8').trim();
        } catch (_) {}
      }

      cleanup();

      if (!result) {
        result = collector.getFormattedOutput(code || 0, signal);
        if (collector.hasOversizedLine()) {
          result += '\n\n[Warning: Stream output contained an oversized record (> 1MB) that was truncated.]';
        }
      }

      if (code !== 0 || signal) {
        const errorLines: string[] = [];
        if (stderr.trim()) errorLines.push(stderr.trim());
        for (const errLine of collector.getJsonErrors()) {
          errorLines.push(errLine);
        }
        if (errorLines.length === 0 && collector.getRawFallbackLines().length > 0) {
          errorLines.push(collector.getRawFallbackLines().join('\n'));
        }

        const errorDetail = errorLines.join('\n').trim() || `Process exited with code ${code || signal}`;
        resolve({
          isError: true,
          errorDetail,
          output: `Codex execution error (${code || signal}):\n${errorDetail}${result && result !== errorDetail ? '\nPartial output:\n' + result : ''}`.trim(),
          exitCode: code,
          threadId: capturedThreadId,
        });
      } else {
        resolve({
          isError: false,
          output: result,
          exitCode: 0,
          threadId: capturedThreadId,
        });
      }
    });
  });
}

export function executeCodexReview(
  args: string[],
  cwd = process.cwd(),
  abortSignal: AbortSignal | null = null,
  onProgress: ((msg: string, percent?: number, total?: number) => void) | null = null
): Promise<ExecutionResult> {
  return new Promise((resolve, reject) => {
    const fullArgs = ['review', '--config', 'sandbox_mode="read-only"', ...args];

    const child = spawn(CODEX_CMD.command, [...CODEX_CMD.argsPrefix, ...fullArgs], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
      detached: process.platform !== 'win32',
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
    let stdoutBytes = 0;
    let stderrBytes = 0;

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    child.stdout?.on('data', (d: string) => {
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

    child.stderr?.on('data', (d: string) => {
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
        if (clean.startsWith('mcp:') || clean.startsWith('exec') || clean.startsWith('warning:')) {
          onProgress?.(`[Codex Review] ${clean.slice(0, 80)}`);
        }
      }
    });

    child.on('error', (err: any) => {
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

export async function execute(prompt: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
  const config = readCodexConfig();
  const model = options.model || config.defaultModel;
  const effort = normalizeReasoningEffort(options.reasoningEffort, config.defaultReasoningEffort);
  const args = ['--sandbox', 'read-only', '-m', model, '-c', `model_reasoning_effort=${effort}`, '-'];

  const progressAdapter = options.onProgress
    ? (msg: string, percent?: number) => {
        options.onProgress?.({ message: msg, percent });
      }
    : null;

  return executeCodex(
    args,
    prompt,
    options.cwd || process.cwd(),
    options.abortSignal || null,
    progressAdapter,
    { threadId: options.threadId }
  );
}

export const codexAdapter: CliAdapter = {
  id,
  name,
  probe,
  execute,
};

export default codexAdapter;
