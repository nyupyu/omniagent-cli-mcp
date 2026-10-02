'use strict';

const codexAdapter = require('./adapters/codex.js');
const claudeAdapter = require('./adapters/claude.js');
const { checkModelGovernance } = require('./policy.js');

async function resolveBackend(requestedBackend) {
  const [codexProbe, claudeProbe] = await Promise.all([
    codexAdapter.probe(),
    claudeAdapter.probe(),
  ]);

  const target = typeof requestedBackend === 'string' && requestedBackend.trim()
    ? requestedBackend.trim().toLowerCase()
    : 'auto';

  if (target === 'codex') {
    if (!codexProbe.installed) {
      throw new Error(`OpenAI Codex CLI is not installed. Run '${codexProbe.installCommand}' in your terminal.`);
    }
    return { id: 'codex', adapter: codexAdapter, probe: codexProbe };
  }

  if (target === 'claude') {
    if (!claudeProbe.installed) {
      throw new Error(`Claude Code CLI is not installed. Run '${claudeProbe.installCommand}' in your terminal.`);
    }
    return { id: 'claude', adapter: claudeAdapter, probe: claudeProbe };
  }

  // Auto mode: deterministic priority (Codex first, then Claude)
  if (codexProbe.installed) {
    return { id: 'codex', adapter: codexAdapter, probe: codexProbe };
  }
  if (claudeProbe.installed) {
    return { id: 'claude', adapter: claudeAdapter, probe: claudeProbe };
  }

  throw new Error(
    `No active CLI backends found. Please install either OpenAI Codex CLI ('${codexProbe.installCommand}') ` +
    `or Claude Code CLI ('${claudeProbe.installCommand}'). Use tool 'omniagent_doctor' for detailed diagnostics.`
  );
}

module.exports = {
  resolveBackend,
};
