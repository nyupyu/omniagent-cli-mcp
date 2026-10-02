'use strict';

const codexAdapter = require('./adapters/codex.js');
const claudeAdapter = require('./adapters/claude.js');
const { loadConfig, setDefaultBackend } = require('./config.js');
const { selectSmartQuotaBackend } = require('./quota.js');

async function resolveBackend(requestedBackend) {
  const config = loadConfig();
  const allowed = new Set(config.routing?.allowedBackends || ['codex', 'claude']);

  const [codexProbe, claudeProbe] = await Promise.all([
    codexAdapter.probe(),
    claudeAdapter.probe(),
  ]);

  const rawTarget = typeof requestedBackend === 'string' && requestedBackend.trim()
    ? requestedBackend.trim().toLowerCase()
    : 'auto';

  // 1. Explicit backend requests
  if (rawTarget === 'codex') {
    if (!allowed.has('codex')) {
      throw new Error(`Backend 'codex' is not permitted by configuration (routing.allowedBackends: [${Array.from(allowed).join(', ')}]).`);
    }
    if (!codexProbe.installed) {
      throw new Error(`OpenAI Codex CLI is not installed. Run '${codexProbe.installCommand}' in your terminal.`);
    }
    return { id: 'codex', adapter: codexAdapter, probe: codexProbe };
  }

  if (rawTarget === 'claude') {
    if (!allowed.has('claude')) {
      throw new Error(`Backend 'claude' is not permitted by configuration (routing.allowedBackends: [${Array.from(allowed).join(', ')}]).`);
    }
    if (!claudeProbe.installed) {
      throw new Error(`Claude Code CLI is not installed. Run '${claudeProbe.installCommand}' in your terminal.`);
    }
    return { id: 'claude', adapter: claudeAdapter, probe: claudeProbe };
  }

  if (rawTarget === 'smart_quota') {
    const selectedId = await selectSmartQuotaBackend(['codex', 'claude']);
    const adapter = selectedId === 'codex' ? codexAdapter : claudeAdapter;
    const probe = selectedId === 'codex' ? codexProbe : claudeProbe;
    return { id: selectedId, adapter, probe, isSmartQuota: true };
  }

  // 2. Target is 'auto': check persistent user configuration
  if (config.defaultBackend) {
    const configuredTarget = config.defaultBackend.toLowerCase();

    if (configuredTarget === 'smart_quota') {
      const selectedId = await selectSmartQuotaBackend(['codex', 'claude']);
      const adapter = selectedId === 'codex' ? codexAdapter : claudeAdapter;
      const probe = selectedId === 'codex' ? codexProbe : claudeProbe;
      return { id: selectedId, adapter, probe, isSmartQuota: true };
    }

    if (configuredTarget === 'codex') {
      if (!allowed.has('codex')) {
        throw new Error(`Configured default backend 'codex' is disabled by routing.allowedBackends: [${Array.from(allowed).join(', ')}].`);
      }
      if (!codexProbe.installed) {
        throw new Error(
          `Configured default backend 'codex' is not installed or operational. Run '${codexProbe.installCommand}' or ` +
          `update your preferred backend using tool 'omniagent_set_default'. To preserve privacy and prevent unauthorized ` +
          `cross-provider code transmission, OmniAgent will not silently reroute to another provider.`
        );
      }
      return { id: 'codex', adapter: codexAdapter, probe: codexProbe };
    }

    if (configuredTarget === 'claude') {
      if (!allowed.has('claude')) {
        throw new Error(`Configured default backend 'claude' is disabled by routing.allowedBackends: [${Array.from(allowed).join(', ')}].`);
      }
      if (!claudeProbe.installed) {
        throw new Error(
          `Configured default backend 'claude' is not installed or operational. Run '${claudeProbe.installCommand}' or ` +
          `update your preferred backend using tool 'omniagent_set_default'. To preserve privacy and prevent unauthorized ` +
          `cross-provider code transmission, OmniAgent will not silently reroute to another provider.`
        );
      }
      return { id: 'claude', adapter: claudeAdapter, probe: claudeProbe };
    }

    throw new Error(`Unknown configured default backend: '${config.defaultBackend}'.`);
  }

  // 3. First-run onboarding resolution (only reached when config.defaultBackend is null)
  const installedAllowed = [];
  if (codexProbe.installed && allowed.has('codex')) installedAllowed.push('codex');
  if (claudeProbe.installed && allowed.has('claude')) installedAllowed.push('claude');

  if (installedAllowed.length === 0) {
    throw new Error(
      `No active permitted CLI backends found. Please install either OpenAI Codex CLI ('${codexProbe.installCommand}') ` +
      `or Claude Code CLI ('${claudeProbe.installCommand}'). Use tool 'omniagent_doctor' for detailed diagnostics.`
    );
  }

  // Single backend installed: auto-persist as default on first run
  if (installedAllowed.length === 1) {
    const single = installedAllowed[0];
    try {
      setDefaultBackend(single);
    } catch (err) {
      throw new Error(`Failed to persist default backend configuration: ${err.message}`);
    }
    const adapter = single === 'codex' ? codexAdapter : claudeAdapter;
    const probe = single === 'codex' ? codexProbe : claudeProbe;
    return { id: single, adapter, probe };
  }

  // Multiple backends installed and no default set: trigger structured onboarding
  throw new Error(
    `[ONBOARDING_REQUIRED] Multiple active coding agent CLIs detected: OpenAI Codex CLI and Claude Code CLI.\n` +
    `Please set your preferred default backend by invoking tool 'omniagent_set_default' with backend: "codex" | "claude" | "smart_quota", ` +
    `or supply the 'backend' parameter explicitly for this request.`
  );
}

module.exports = {
  resolveBackend,
};
