'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const { runCommand } = require('../process.js');

const GEMINI_EXE = process.env.GEMINI_PATH || 'gemini';
const GEMINI_CONFIG_DIR = path.join(os.homedir(), '.gemini');

async function probe() {
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
    availableModels: [
      { id: 'gemini-2.5-flash', tier: 'default', description: 'Fast multimodal model' },
      { id: 'gemini-2.5-pro', tier: 'top-tier', description: 'Advanced reasoning and complex task model' },
    ],
    statusInV1: 'diagnostic_probed',
    installCommand: 'npm install -g @google/gemini-cli',
    authCommand: 'gemini (follow initial authentication prompt)',
  };
}

module.exports = {
  probe,
  GEMINI_EXE,
};
