import fs from 'fs';
import path from 'path';
import os from 'os';
import { BackendId, OmniAgentConfig, RoutingStrategy } from '../types/config.types.js';

export const DEFAULT_CONFIG_DIR = process.env.OMNIAGENT_DIR || path.join(os.homedir(), '.omniagent');
export const CONFIG_FILE = process.env.OMNIAGENT_CONFIG || path.join(DEFAULT_CONFIG_DIR, 'config.json');

export const VALID_BACKENDS: BackendId[] = ['codex', 'claude', 'gemini', 'smart_quota'];
export const VALID_STRATEGIES: RoutingStrategy[] = ['fixed', 'smart_quota'];

export const DEFAULT_CONFIG: OmniAgentConfig = {
  schemaVersion: 1,
  defaultBackend: null, // null triggers onboarding if multiple backends detected
  routing: {
    strategy: 'fixed',
    allowedBackends: ['codex', 'claude'],
  },
};

export function ensureConfigDir(): void {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
  }
}

export function validateConfig(config: any): OmniAgentConfig {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Configuration Error: configuration must be a valid JSON object.');
  }

  const schemaVersion = config.schemaVersion ?? DEFAULT_CONFIG.schemaVersion;
  if (typeof schemaVersion !== 'number' || schemaVersion < 1) {
    throw new Error(`Configuration Error: Invalid schemaVersion: expected positive number, got ${schemaVersion}`);
  }

  let defaultBackend = config.defaultBackend;
  if (defaultBackend !== null && defaultBackend !== undefined) {
    if (typeof defaultBackend !== 'string' || !VALID_BACKENDS.includes(defaultBackend.toLowerCase() as BackendId)) {
      throw new Error(
        `Configuration Error: Invalid defaultBackend: '${defaultBackend}'. Supported: ${VALID_BACKENDS.join(', ')} or null.`
      );
    }
    defaultBackend = defaultBackend.toLowerCase() as BackendId;
  } else {
    defaultBackend = null;
  }

  const routing = config.routing;
  let strategy = DEFAULT_CONFIG.routing.strategy;
  let allowedBackends = [...DEFAULT_CONFIG.routing.allowedBackends];

  if (routing !== undefined && routing !== null) {
    if (typeof routing !== 'object' || Array.isArray(routing)) {
      throw new Error('Configuration Error: routing must be a valid object.');
    }

    if (routing.strategy !== undefined) {
      if (!VALID_STRATEGIES.includes(routing.strategy)) {
        throw new Error(
          `Configuration Error: Invalid routing strategy: '${routing.strategy}'. Supported: ${VALID_STRATEGIES.join(', ')}`
        );
      }
      strategy = routing.strategy;
    }

    if (routing.allowedBackends !== undefined) {
      if (!Array.isArray(routing.allowedBackends)) {
        throw new Error(
          `Configuration Error: Invalid allowedBackends: expected an array of strings, got ${typeof routing.allowedBackends}`
        );
      }
      for (const b of routing.allowedBackends) {
        if (typeof b !== 'string' || !['codex', 'claude', 'gemini'].includes(b.toLowerCase())) {
          throw new Error(
            `Configuration Error: Invalid entry in allowedBackends: '${b}'. Supported: 'codex', 'claude', 'gemini'.`
          );
        }
      }
      allowedBackends = routing.allowedBackends.map((b: string) => b.toLowerCase());
    }
  }

  return {
    schemaVersion,
    defaultBackend,
    routing: {
      strategy,
      allowedBackends,
    },
  };
}

export function loadConfig(): OmniAgentConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG, routing: { ...DEFAULT_CONFIG.routing, allowedBackends: [...DEFAULT_CONFIG.routing.allowedBackends] } };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(CONFIG_FILE, 'utf8');
  } catch (err: any) {
    throw new Error(`Configuration Error: Failed to read '${CONFIG_FILE}': ${err.message}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Configuration Error: Malformed JSON in '${CONFIG_FILE}': ${err.message}`);
  }

  return validateConfig(parsed);
}

export function saveConfig(updates: Partial<OmniAgentConfig>): OmniAgentConfig {
  ensureConfigDir();
  const current = fs.existsSync(CONFIG_FILE) ? loadConfig() : { ...DEFAULT_CONFIG };
  const merged = validateConfig({
    ...current,
    ...updates,
    routing: {
      ...current.routing,
      ...(updates.routing || {}),
    },
  });

  const tmpPath = `${CONFIG_FILE}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(merged, null, 2), 'utf8');
  fs.renameSync(tmpPath, CONFIG_FILE);
  return merged;
}

export function getDefaultBackend(): BackendId | null {
  const config = loadConfig();
  return config.defaultBackend;
}

export function setDefaultBackend(backend: unknown): OmniAgentConfig {
  if (typeof backend !== 'string' || !VALID_BACKENDS.includes(backend.toLowerCase() as BackendId)) {
    throw new Error(
      `Validation Error: backend must be one of: ${VALID_BACKENDS.join(', ')}. Received: '${backend}'`
    );
  }
  return saveConfig({ defaultBackend: backend.toLowerCase() as BackendId });
}
