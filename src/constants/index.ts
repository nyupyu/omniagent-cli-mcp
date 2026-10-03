/**
 * @fileoverview Central branding, naming, and tool constants for SynAgent MCP Server.
 * Prevents magic strings across tool definitions, dispatchers, handlers, and configuration.
 */

export const BRAND = {
  NAME: 'SynAgent',
  TAGLINE: 'Cross-Agent CLI Bridge',
  PACKAGE_NAME: 'synagent',
  SERVER_NAME: 'synagent',
  SERVER_VERSION: '0.9.0-dev',
  GITHUB_OWNER: 'nyupyu',
  GITHUB_REPO: 'synagent',
} as const;

export const CONFIG_CONSTANTS = {
  DIR_NAME: '.synagent',
  LEGACY_DIR_NAME: '.omniagent',
  FILE_NAME: 'config.json',
  ENV_DIR: 'SYNAGENT_DIR',
  LEGACY_ENV_DIR: 'OMNIAGENT_DIR',
  ENV_CONFIG: 'SYNAGENT_CONFIG',
  LEGACY_ENV_CONFIG: 'OMNIAGENT_CONFIG',
  ENV_SESSIONS_DIR: 'SYNAGENT_SESSIONS_DIR',
  LEGACY_ENV_SESSIONS_DIR: 'OMNIAGENT_SESSIONS_DIR',
} as const;

/**
 * Enumeration of all registered tool names across SynAgent, legacy OmniAgent aliases, and direct Codex CLI tools.
 */
export const TOOL_NAMES = {
  // Primary SynAgent Tools
  DOCTOR: 'synagent_doctor',
  SET_DEFAULT: 'synagent_set_default',
  QUOTA_STATUS: 'synagent_quota_status',
  REPORT_BUG: 'synagent_report_bug',
  CLOSE_SESSION: 'synagent_close_session',
  REVIEW: 'synagent_review',
  CONSULT: 'synagent_consult',
  ANALYZE: 'synagent_analyze',

  // Backward-Compatible OmniAgent Aliases
  LEGACY_DOCTOR: 'omniagent_doctor',
  LEGACY_SET_DEFAULT: 'omniagent_set_default',
  LEGACY_QUOTA_STATUS: 'omniagent_quota_status',
  LEGACY_REPORT_BUG: 'omniagent_report_bug',
  LEGACY_CLOSE_SESSION: 'omniagent_close_session',
  LEGACY_REVIEW: 'omniagent_review',
  LEGACY_CONSULT: 'omniagent_consult',
  LEGACY_ANALYZE: 'omniagent_analyze',

  // Direct Codex CLI Tools
  CODEX_STATUS: 'codex_status',
  CODEX_DEBUG: 'codex_debug_error',
  CODEX_ANALYZE: 'codex_analyze',
  CODEX_REVIEW: 'codex_review_code',
  CODEX_IMPLEMENT: 'codex_implement',
  CODEX_CONSULT: 'codex_consult',
} as const;

export type ToolName = (typeof TOOL_NAMES)[keyof typeof TOOL_NAMES];

/**
 * Returns a standardized description for backward-compatible alias tools.
 *
 * @param primaryToolName The name of the primary replacement tool.
 * @returns Human-readable description referencing the primary tool.
 */
export function getLegacyAliasDescription(primaryToolName: string): string {
  return `Backward-compatible alias for ${primaryToolName}.`;
}
