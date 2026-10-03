import { closeSession } from '../services/session.service.js';
import { TOOL_NAMES, getLegacyAliasDescription } from '../constants/index.js';

export const closeSessionToolDefinition = {
  name: TOOL_NAMES.CLOSE_SESSION,
  description:
    'Close and clean up an active multi-turn conversation session.',
  inputSchema: {
    type: 'object',
    properties: {
      session_handle: {
        type: 'string',
        description: 'The opaque session handle to close.',
      },
    },
    required: ['session_handle'],
  },
};

export const legacyCloseSessionToolDefinition = {
  ...closeSessionToolDefinition,
  name: TOOL_NAMES.LEGACY_CLOSE_SESSION,
  description: getLegacyAliasDescription(TOOL_NAMES.CLOSE_SESSION),
};

export async function handleCloseSession(args: any) {
  const closed = closeSession(args.session_handle);
  return {
    content: [
      {
        type: 'text',
        text: closed
          ? `Session '${args.session_handle}' closed successfully.`
          : `Session '${args.session_handle}' not found or already closed.`,
      },
    ],
  };
}

export const handleOmniagentCloseSession = handleCloseSession;
