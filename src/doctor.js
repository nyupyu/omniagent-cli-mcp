'use strict';

const codexAdapter = require('./adapters/codex.js');
const claudeAdapter = require('./adapters/claude.js');
const geminiAdapter = require('./adapters/gemini.js');

async function runDoctor() {
  const [codex, claude, gemini] = await Promise.all([
    codexAdapter.probe(),
    claudeAdapter.probe(),
    geminiAdapter.probe(),
  ]);

  const activeBackends = [];
  if (codex.installed) activeBackends.push('codex');
  if (claude.installed) activeBackends.push('claude');

  let overallStatus = 'operational';
  if (activeBackends.length === 0) {
    overallStatus = 'degraded_no_active_backends';
  } else if (!codex.installed || !claude.installed) {
    overallStatus = 'partially_configured';
  }

  const recommendations = [];
  if (!codex.installed) {
    recommendations.push(
      `OpenAI Codex CLI is missing. Install via terminal: '${codex.installCommand}' and run '${codex.authCommand}'.`
    );
  }
  if (!claude.installed) {
    recommendations.push(
      `Claude Code CLI is missing. Install via terminal: '${claude.installCommand}' and run '${claude.authCommand}'.`
    );
  }
  if (!gemini.installed) {
    recommendations.push(
      `Gemini CLI is missing. Install via terminal: '${gemini.installCommand}' and run '${gemini.authCommand}'.`
    );
  }

  return {
    status: overallStatus,
    active_backends: activeBackends,
    default_backend: codex.installed ? 'codex' : (claude.installed ? 'claude' : 'none'),
    security_policy: {
      zero_silent_downloads: true,
      read_only_sandbox_guard: true,
      governed_models_require_confirmation: ['astra', 'claude-3-opus'],
    },
    backends: {
      codex,
      claude,
      gemini,
    },
    recommendations,
  };
}

module.exports = {
  runDoctor,
};
