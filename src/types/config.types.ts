export type BackendId = 'codex' | 'claude' | 'gemini' | 'smart_quota';
export type RoutingStrategy = 'fixed' | 'smart_quota';

export interface RoutingConfig {
  strategy: RoutingStrategy;
  allowedBackends: string[];
}

export interface OmniAgentConfig {
  schemaVersion: number;
  defaultBackend: BackendId | null;
  routing: RoutingConfig;
}
