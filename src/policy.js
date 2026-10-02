'use strict';

const fs = require('fs');

const GOVERNED_TOP_TIER_MODELS = new Set(['astra', 'claude-3-opus', 'claude-3-opus-20240229', 'opus']);

/**
 * Validates whether top-tier expensive reasoning models have explicit user confirmation.
 */
function checkModelGovernance(modelName, userConfirmed = false) {
  if (typeof modelName !== 'string') return null;

  const normalized = modelName.trim().toLowerCase();
  if (GOVERNED_TOP_TIER_MODELS.has(normalized)) {
    if (userConfirmed !== true) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text:
              `[GOVERNANCE ERROR] The selected model '${modelName}' is a top-tier deep reasoning model. ` +
              `Execution strictly requires explicit user confirmation (user_confirmed: true). ` +
              `Please prompt the user before initiating requests with this tier.`,
          },
        ],
      };
    }
  }
  return null;
}

/**
 * Resolves workspace path strictly; errors out if explicit path does not exist.
 */
function resolveWorkspacePath(rawPath) {
  if (typeof rawPath === 'string' && rawPath.trim()) {
    const cleanPath = rawPath.trim();
    if (!fs.existsSync(cleanPath)) {
      throw new Error(`Validation Error: The specified workspace path does not exist: '${cleanPath}'`);
    }
    const stat = fs.statSync(cleanPath);
    if (!stat.isDirectory()) {
      throw new Error(`Validation Error: The specified workspace path is not a directory: '${cleanPath}'`);
    }
    return cleanPath;
  }
  return process.cwd();
}

module.exports = {
  checkModelGovernance,
  resolveWorkspacePath,
  GOVERNED_TOP_TIER_MODELS,
};
