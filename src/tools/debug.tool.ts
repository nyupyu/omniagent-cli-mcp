import { checkModelGovernance } from '../services/policy.service.js';
import * as codexAdapter from '../adapters/codex.adapter.js';
import { formatExecutionResult } from './common.js';

export function getDebugToolDefinition(codexConfig: any) {
  return {
    name: 'codex_debug_error',
    description:
      'Diagnose an error or stack trace using OpenAI Codex in read-only sandbox mode. Returns root cause analysis and a step-by-step fix recommendation.',
    inputSchema: {
      type: 'object',
      properties: {
        error_message: {
          type: 'string',
          description: 'The complete error message or stack trace to diagnose.',
        },
        context: {
          type: 'string',
          description: 'What you were doing when the error occurred, relevant inputs, or recent changes.',
        },
        file_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of relevant source files to provide context.',
        },
        workspace_path: {
          type: 'string',
          description: 'Optional absolute path to workspace root.',
        },
        model: {
          type: 'string',
          description: `Model to use (default: "${codexConfig.defaultModel}", options: "gpt-6.1-sol", "gpt-6.0-sol", "luna", "astra").`,
        },
        reasoning_effort: {
          type: 'string',
          enum: codexAdapter.VALID_REASONING_EFFORTS,
          description: 'Reasoning effort depth (default: "xhigh" for debugging).',
        },
        user_confirmed: {
          type: 'boolean',
          description: 'Mandatory true confirmation if using the top-tier "astra" model.',
        },
      },
      required: ['error_message'],
    },
  };
}

export async function handleDebugError(
  args: any,
  workspaceCwd: string,
  abortSignal: AbortSignal | null = null,
  onProgress: any = null
) {
  if (typeof args.error_message !== 'string' || !args.error_message.trim()) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Validation Error: error_message must be a non-empty string.' }],
    };
  }

  const codexConfig = codexAdapter.readCodexConfig();
  const requestedModel = typeof args.model === 'string' && args.model.trim()
    ? args.model.trim()
    : codexConfig.defaultModel;

  const approval = checkModelGovernance(requestedModel, args.user_confirmed);
  if (approval) return approval;

  const filesContext =
    Array.isArray(args.file_paths) && args.file_paths.length > 0
      ? `\nRelevant files:\n${args.file_paths.join('\n')}`
      : '';

  const prompt = `[TASK: ROOT CAUSE ANALYSIS & DEBUGGING]
Please diagnose the following error and provide concrete root cause analysis and a step-by-step fix recommendation:

ERROR MESSAGE:
${args.error_message}

CONTEXT & DESCRIPTION:
${args.context || 'Not provided'}
${filesContext}`;

  const effort = codexAdapter.normalizeReasoningEffort(args.reasoning_effort, 'xhigh');
  const cliModelArgs = ['-m', requestedModel, '-c', `model_reasoning_effort=${effort}`];

  const res = await codexAdapter.executeCodex(
    ['--sandbox', 'read-only', ...cliModelArgs, '-'],
    prompt,
    workspaceCwd,
    abortSignal,
    onProgress
  );
  return formatExecutionResult('codex', res);
}
