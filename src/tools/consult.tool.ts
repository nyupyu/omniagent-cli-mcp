import { resolveBackend } from '../services/router.service.js';
import { checkModelGovernance } from '../services/policy.service.js';
import { acquireAndResolveSession, releaseSessionTurn, updateSession } from '../services/session.service.js';
import * as codexAdapter from '../adapters/codex.adapter.js';
import * as claudeAdapter from '../adapters/claude.adapter.js';
import { formatExecutionResult } from './common.js';

export function getConsultToolDefinitions(codexConfig: any) {
  const baseConsultSchema = {
    type: 'object',
    properties: {
      proposal: {
        type: 'string',
        description: 'The proposed plan, architecture, or refactoring strategy to evaluate.',
      },
      specific_questions: {
        type: 'string',
        description: 'Specific concerns, trade-offs, or questions to address.',
      },
      backend: {
        type: 'string',
        enum: ['auto', 'codex', 'claude', 'smart_quota'],
        description: 'CLI agent backend to consult (default: "auto").',
      },
      workspace_path: {
        type: 'string',
        description: 'Optional absolute path to workspace root.',
      },
      model: {
        type: 'string',
        description: 'Optional model override.',
      },
      reasoning_effort: {
        type: 'string',
        description: 'Reasoning depth level (default: "medium").',
      },
      user_confirmed: {
        type: 'boolean',
        description: 'Mandatory true confirmation if using top-tier models ("astra", "claude-3-opus").',
      },
      session_handle: {
        type: 'string',
        description: 'Optional persistent session handle from a previous turn to preserve full multi-turn context.',
      },
    },
    required: ['proposal'],
  };

  return [
    {
      name: 'synagent_consult',
      description:
        'Consult local reasoning agents (Codex or Claude Code) for a second opinion on architecture plans, refactoring strategies, or technical trade-offs.',
      inputSchema: baseConsultSchema,
    },
    {
      name: 'omniagent_consult',
      description: 'Backward-compatible alias for synagent_consult.',
      inputSchema: baseConsultSchema,
    },
    {
      name: 'codex_consult',
      description:
        'Consult OpenAI Codex for a second opinion on an architecture plan, refactoring strategy, or technical trade-offs.',
      inputSchema: {
        type: 'object',
        properties: {
          proposal: {
            type: 'string',
            description: 'The proposed plan, architecture, or refactoring strategy to evaluate.',
          },
          specific_questions: {
            type: 'string',
            description: 'Specific concerns, trade-offs, or questions to address.',
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
            description: 'Reasoning effort depth (default: "medium").',
          },
          user_confirmed: {
            type: 'boolean',
            description: 'Mandatory true confirmation if using the top-tier "astra" model.',
          },
        },
        required: ['proposal'],
      },
    },
  ];
}

export async function handleConsult(
  toolName: string,
  args: any,
  workspaceCwd: string,
  abortSignal: AbortSignal | null = null,
  onProgress: any = null
) {
  if (typeof args.proposal !== 'string' || !args.proposal.trim()) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Validation Error: proposal must be a non-empty string.' }],
    };
  }

  const backendId = toolName === 'codex_consult' ? 'codex' : (args.backend || 'auto');
  const backend = await resolveBackend(backendId);

  const codexConfig = codexAdapter.readCodexConfig();
  const requestedModel = typeof args.model === 'string' && args.model.trim()
    ? args.model.trim()
    : (backend.id === 'codex' ? codexConfig.defaultModel : 'claude-3-7-sonnet');

  const approval = checkModelGovernance(requestedModel, args.user_confirmed);
  if (approval) return approval;

  const prompt = `[TASK: SECOND OPINION & DESIGN CONSULTATION]
Please evaluate the following proposal and provide a technical critique, potential pitfalls, and alternative approaches:

PROPOSAL:
${args.proposal}

QUESTIONS:
${args.specific_questions || 'General review and risk assessment'}`;

  if (backend.id === 'claude') {
    if (args.session_handle) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Multi-turn session continuation is currently supported on the Codex backend. Session continuation for Claude Code CLI is planned for a subsequent update.' }],
      };
    }
    const res = await claudeAdapter.executeClaude(prompt, {
      cwd: workspaceCwd,
      model: requestedModel,
      reasoningEffort: args.reasoning_effort || 'medium',
      abortSignal: abortSignal || undefined,
      onProgress,
    });
    return formatExecutionResult('claude', res);
  }

  const effort = codexAdapter.normalizeReasoningEffort(args.reasoning_effort, 'medium');
  const cliModelArgs = ['-m', requestedModel, '-c', `model_reasoning_effort=${effort}`];

  const sessionRes = acquireAndResolveSession(args.session_handle, backend.id, workspaceCwd);
  if (sessionRes.error) {
    return {
      isError: true,
      content: [{ type: 'text', text: sessionRes.error }],
    };
  }
  const session = sessionRes.session!;
  const sessionOptions = session.threadId ? { threadId: session.threadId } : {};

  let execResult: any;
  let caughtErr: any = null;
  try {
    const res = await codexAdapter.executeCodex(
      ['--sandbox', 'read-only', ...cliModelArgs, '-'],
      prompt,
      workspaceCwd,
      abortSignal,
      onProgress,
      sessionOptions
    );

    if (res.threadId && session) {
      updateSession(session.sessionHandle, { threadId: res.threadId });
    }

    execResult = formatExecutionResult('codex', res, 'No output received.', session.sessionHandle);
  } catch (err: any) {
    caughtErr = err;
  } finally {
    const rel = releaseSessionTurn(session.sessionHandle);
    if (rel && !rel.ok) {
      console.error(`[OmniAgent] Failed to release session '${session.sessionHandle}': ${rel.error}`);
      if (caughtErr) {
        caughtErr.message += ` (Additionally, failed to release session lock: ${rel.error})`;
      } else if (execResult && execResult.content) {
        const textEntry = execResult.content.find((c: any) => c.type === 'text');
        if (textEntry) {
          textEntry.text += `\n\n[Warning] Failed to release session lock: ${rel.error}`;
        }
      }
    }
  }
  if (caughtErr) throw caughtErr;
  return execResult;
}
