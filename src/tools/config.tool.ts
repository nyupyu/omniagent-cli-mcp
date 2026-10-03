import { setDefaultBackend, CONFIG_FILE } from '../services/config.service.js';

export const setDefaultToolDefinition = {
  name: 'synagent_set_default',
  description:
    'Set and persist your preferred default CLI agent backend in ~/.synagent/config.json.',
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
  name: 'omniagent_set_default',
  description: 'Backward-compatible alias for synagent_set_default.',
};

export async function handleOmniagentSetDefault(args: any) {
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
