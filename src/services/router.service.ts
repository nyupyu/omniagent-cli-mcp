import * as codexAdapter from '../adapters/codex.adapter.js';
import * as claudeAdapter from '../adapters/claude.adapter.js';
import { loadConfig, setDefaultBackend } from './config.service.js';
import { selectSmartQuotaBackend } from './quota.service.js';
import { AdapterProbeResult, CliAdapter } from '../types/adapter.types.js';

/**
 * Represents a resolved agent CLI backend with its active adapter and system probe.
 */
export interface ResolvedBackend {
  /** Identifier of the resolved backend ('codex' or 'claude'). */
  id: string;
  /** Concrete adapter instance conforming to CliAdapter contract. */
  adapter: CliAdapter;
  /** Host environment probe results for this backend. */
  probe: AdapterProbeResult;
  /** Whether this backend was dynamically selected via smart_quota. */
  isSmartQuota?: boolean;
}

/**
 * Resolves the appropriate CLI adapter based on caller request, user configuration,
 * installation state, and quota availability.
 *
 * @param requestedBackend - Optional target ('auto', 'codex', 'claude', 'smart_quota')
 * @returns Resolved backend structure with adapter and probe
 * @throws Error if requested backend is invalid, uninstalled, or forbidden by policy
 */
export async function resolveBackend(requestedBackend?: string | null): Promise<ResolvedBackend> {
  const config = loadConfig();
  const allowed = new Set(config.routing?.allowedBackends || ['codex', 'claude']);

  const [codexProbe, claudeProbe] = await Promise.all([
    codexAdapter.probe(),
    claudeAdapter.probe(),
  ]);

  const candidatePool = ['codex', 'claude'];
  const candidates = candidatePool.filter((b) => allowed.has(b));

  async function resolveSmartQuota(): Promise<ResolvedBackend> {
    if (candidates.length === 0) {
      throw new Error(
        `No permitted backends available for smart_quota (routing.allowedBackends: [${Array.from(allowed).join(', ')}]).`
      );
    }
    const selectedId = await selectSmartQuotaBackend(candidates);
    const adapter = selectedId === 'codex' ? codexAdapter.codexAdapter : claudeAdapter.claudeAdapter;
    const probe = selectedId === 'codex' ? codexProbe : claudeProbe;
    if (!probe.installed) {
      throw new Error(
        `Selected smart_quota backend '${selectedId}' is not installed or operational. Run 'omniagent_doctor' for diagnostic details.`
      );
    }
    return { id: selectedId, adapter, probe, isSmartQuota: true };
  }

  const rawTarget = typeof requestedBackend === 'string' && requestedBackend.trim()
    ? requestedBackend.trim().toLowerCase()
    : 'auto';

  // 1. Explicit backend requests
  if (rawTarget === 'codex') {
    if (!allowed.has('codex')) {
      throw new Error(`Backend 'codex' is not permitted by configuration (routing.allowedBackends: [${Array.from(allowed).join(', ')}]).`);
    }
    if (!codexProbe.installed) {
      throw new Error(`OpenAI Codex CLI is not installed. Run 'npm install -g @openai/codex' in your terminal.`);
    }
    return { id: 'codex', adapter: codexAdapter.codexAdapter, probe: codexProbe };
  }

  if (rawTarget === 'claude') {
    if (!allowed.has('claude')) {
      throw new Error(`Backend 'claude' is not permitted by configuration (routing.allowedBackends: [${Array.from(allowed).join(', ')}]).`);
    }
    if (!claudeProbe.installed) {
      throw new Error(`Claude Code CLI is not installed. Run 'npm install -g @anthropic-ai/claude-code' in your terminal.`);
    }
    return { id: 'claude', adapter: claudeAdapter.claudeAdapter, probe: claudeProbe };
  }

  if (rawTarget === 'smart_quota') {
    return await resolveSmartQuota();
  }

  if (rawTarget !== 'auto') {
    throw new Error(
      `Invalid backend '${requestedBackend}'. Supported options are: 'auto', 'codex', 'claude', 'smart_quota'.`
    );
  }

  // 2. Target is 'auto': check persistent user configuration
  if (config.defaultBackend) {
    const configuredTarget = config.defaultBackend.toLowerCase();

    if (configuredTarget === 'smart_quota') {
      return await resolveSmartQuota();
    }

    if (configuredTarget === 'codex') {
      if (!allowed.has('codex')) {
        throw new Error(`Configured default backend 'codex' is disabled by routing.allowedBackends: [${Array.from(allowed).join(', ')}].`);
      }
      if (!codexProbe.installed) {
        throw new Error(
          `Configured default backend 'codex' is not installed or operational. Run 'npm install -g @openai/codex' or ` +
          `update your preferred backend using tool 'omniagent_set_default'. To preserve privacy and prevent unauthorized ` +
          `cross-provider code transmission, OmniAgent will not silently reroute to another provider.`
        );
      }
      return { id: 'codex', adapter: codexAdapter.codexAdapter, probe: codexProbe };
    }

    if (configuredTarget === 'claude') {
      if (!allowed.has('claude')) {
        throw new Error(`Configured default backend 'claude' is disabled by routing.allowedBackends: [${Array.from(allowed).join(', ')}].`);
      }
      if (!claudeProbe.installed) {
        throw new Error(
          `Configured default backend 'claude' is not installed or operational. Run 'npm install -g @anthropic-ai/claude-code' or ` +
          `update your preferred backend using tool 'omniagent_set_default'. To preserve privacy and prevent unauthorized ` +
          `cross-provider code transmission, OmniAgent will not silently reroute to another provider.`
        );
      }
      return { id: 'claude', adapter: claudeAdapter.claudeAdapter, probe: claudeProbe };
    }

    throw new Error(`Unknown configured default backend: '${config.defaultBackend}'.`);
  }

  // 3. First-run onboarding resolution (only reached when config.defaultBackend is null)
  const installedAllowed: string[] = [];
  if (codexProbe.installed && allowed.has('codex')) installedAllowed.push('codex');
  if (claudeProbe.installed && allowed.has('claude')) installedAllowed.push('claude');

  if (installedAllowed.length === 0) {
    throw new Error(
      `No active permitted CLI backends found. Please install either OpenAI Codex CLI ('npm install -g @openai/codex') ` +
      `or Claude Code CLI ('npm install -g @anthropic-ai/claude-code'). Use tool 'omniagent_doctor' for detailed diagnostics.`
    );
  }

  // Single backend installed: auto-persist as default on first run
  if (installedAllowed.length === 1) {
    const single = installedAllowed[0];
    try {
      setDefaultBackend(single);
    } catch (err: any) {
      throw new Error(`Failed to persist default backend configuration: ${err.message}`);
    }
    const adapter = single === 'codex' ? codexAdapter.codexAdapter : claudeAdapter.claudeAdapter;
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
