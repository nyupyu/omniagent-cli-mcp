import { checkAndRecordRateLimit } from '../services/quota.service.js';

export function formatExecutionResult(
  backendId: string,
  res: any,
  defaultText = 'No output received.',
  sessionHandle: string | null = null
) {
  if (res.isError) {
    const diagnostic = res.errorDetail || res.output;
    if (diagnostic) {
      checkAndRecordRateLimit(backendId, diagnostic);
    }
  }

  let text = res.output || defaultText;
  if (sessionHandle && res.threadId && !res.isError) {
    text += `\n\n[Session: ${sessionHandle}]`;
  }

  return {
    isError: res.isError,
    content: [{ type: 'text', text }],
  };
}
