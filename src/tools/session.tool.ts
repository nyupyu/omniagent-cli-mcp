import { closeSession } from '../services/session.service.js';

export const closeSessionToolDefinition = {
  name: 'omniagent_close_session',
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

export async function handleOmniagentCloseSession(args: any) {
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
