import path from 'path';
import os from 'os';
import fs from 'fs';
import { runCommand } from '../services/process.service.js';
import { AdapterProbeResult, ExecutionOptions, ExecutionResult, CliAdapter } from '../types/adapter.types.js';

export const id = 'gemini';
export const name = 'Google Gemini CLI';
export const GEMINI_EXE = process.env.GEMINI_PATH || 'gemini';
export const GEMINI_CONFIG_DIR = path.join(os.homedir(), '.gemini');

export async function probe(): Promise<AdapterProbeResult> {
  let installed = false;
  let version = 'unknown';
  let authType = 'unavailable';

  try {
    const res = await runCommand(GEMINI_EXE, ['--version'], { timeoutMs: 5000 });
    if (res.exitCode === 0) {
      installed = true;
      version = res.stdout.trim() || 'installed';
    }
  } catch (_) {}

  if (process.env.GEMINI_API_KEY) {
    authType = 'api_key';
  } else if (fs.existsSync(GEMINI_CONFIG_DIR)) {
    authType = 'config_present';
  }

  return {
    id: 'gemini',
    name: 'Google Gemini CLI',
    installed,
    version,
    command: GEMINI_EXE,
    authStatus: authType,
    availableModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  };
}

export async function execute(prompt: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
  return {
    isError: true,
    errorDetail: 'Gemini CLI execution adapter is not yet implemented. Use omniagent_doctor for probing.',
    output: 'Gemini CLI execution is currently supported in probe/diagnostic mode only.',
  };
}

export const geminiAdapter: CliAdapter = {
  id,
  name,
  probe,
  execute,
};

export default geminiAdapter;
