import { setDefaultBackend, CONFIG_FILE } from '../services/config.service.js';
import { TOOL_NAMES, CONFIG_CONSTANTS, getLegacyAliasDescription } from '../constants/index.js';

export const setDefaultToolDefinition = {
  name: TOOL_NAMES.SET_DEFAULT,
  description:
    `Set and persist your preferred default CLI agent backend in ~/${CONFIG_CONSTANTS.DIR_NAME}/${CONFIG_CONSTANTS.FILE_NAME}.`,
  inputSchema: {
    type: 'object',
    properties: {
      backend: {
        type: 'string',
        enum: ['codex', 'claude', 'smart_quota'],
        description: 'The preferred default backend: "codex", "claude", or "smart_quota" (routes dynamically based on 5h rolling window headroom).',
      },
    },
    required: ['backend'],
  },
};

export const legacySetDefaultToolDefinition = {
  ...setDefaultToolDefinition,
  name: TOOL_NAMES.LEGACY_SET_DEFAULT,
  description: getLegacyAliasDescription(TOOL_NAMES.SET_DEFAULT),
};

export async function handleSetDefault(args: any) {
  setDefaultBackend(args.backend);
  return {
    content: [
      {
        type: 'text',
        text: `Successfully set default backend to '${args.backend}'. Saved to ${CONFIG_FILE}`,
      },
    ],
  };
}

export const handleOmniagentSetDefault = handleSetDefault;
