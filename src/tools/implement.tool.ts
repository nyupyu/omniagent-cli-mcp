import { checkModelGovernance } from '../services/policy.service.js';
import * as codexAdapter from '../adapters/codex.adapter.js';
import { formatExecutionResult } from './common.js';

export function getImplementToolDefinition(codexConfig: any) {
  return {
    name: 'codex_implement',
    description:
      'Implement a well-specified component, complex algorithm, or class in read-only sandbox mode. Codex outputs code without writing to disk.',
    inputSchema: {
      type: 'object',
      properties: {
        specification: {
          type: 'string',
          description: 'Detailed description of what to implement, including interface requirements.',
        },
        context_files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of files that provide relevant types, interfaces, or context.',
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
          description: 'Reasoning effort depth (default: "high").',
        },
        user_confirmed: {
          type: 'boolean',
          description: 'Mandatory true confirmation if using the top-tier "astra" model.',
        },
      },
      required: ['specification'],
    },
  };
}

export async function handleImplement(
  args: any,
  workspaceCwd: string,
  abortSignal: AbortSignal | null = null,
  onProgress: any = null
) {
  if (typeof args.specification !== 'string' || !args.specification.trim()) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Validation Error: specification must be a non-empty string.' }],
    };
  }

  const codexConfig = codexAdapter.readCodexConfig();
  const requestedModel = typeof args.model === 'string' && args.model.trim()
    ? args.model.trim()
    : codexConfig.defaultModel;

  const approval = checkModelGovernance(requestedModel, args.user_confirmed);
  if (approval) return approval;

  const filesContext =
    Array.isArray(args.context_files) && args.context_files.length > 0
      ? `\nContext files:\n${args.context_files.join('\n')}`
      : '';

  const prompt = `[TASK: CODE IMPLEMENTATION]
Please provide the implementation / code solution for the following specification.
Provide clean, idiomatic code with clear explanations of non-trivial logic.

SPECIFICATION:
${args.specification}
${filesContext}`;

  const effort = codexAdapter.normalizeReasoningEffort(args.reasoning_effort, 'high');
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
