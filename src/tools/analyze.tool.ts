import { resolveBackend } from '../services/router.service.js';
import { checkModelGovernance } from '../services/policy.service.js';
import { acquireAndResolveSession, releaseSessionTurn, updateSession } from '../services/session.service.js';
import * as codexAdapter from '../adapters/codex.adapter.js';
import * as claudeAdapter from '../adapters/claude.adapter.js';
import { formatExecutionResult } from './common.js';

export function getAnalyzeToolDefinitions(codexConfig: any) {
  return [
    {
      name: 'omniagent_analyze',
      description:
        'Perform deep architectural, dependency, and structural code analysis in read-only mode using local CLI reasoning agents.',
      inputSchema: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'The specific question, architectural aspect, or focus area to analyze.',
          },
          file_paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of files or directories to inspect.',
          },
          backend: {
            type: 'string',
            enum: ['auto', 'codex', 'claude', 'smart_quota'],
            description: 'CLI agent backend to analyze with (default: "auto").',
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
            description: 'Reasoning depth level (default: "high").',
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
        required: ['task'],
      },
    },
    {
      name: 'codex_analyze',
      description:
        'Perform deep architectural, dependency, and structural code analysis in read-only sandbox mode using OpenAI Codex.',
      inputSchema: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description: 'The specific question, architectural aspect, or focus area to analyze.',
          },
          file_paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of files or directories to inspect.',
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
        required: ['task'],
      },
    },
  ];
}

export async function handleAnalyze(
  toolName: string,
  args: any,
  workspaceCwd: string,
  abortSignal: AbortSignal | null = null,
  onProgress: any = null
) {
  if (typeof args.task !== 'string' || !args.task.trim()) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Validation Error: task must be a non-empty string.' }],
    };
  }

  const backendId = toolName === 'codex_analyze' ? 'codex' : (args.backend || 'auto');
  const backend = await resolveBackend(backendId);

  const codexConfig = codexAdapter.readCodexConfig();
  const requestedModel = typeof args.model === 'string' && args.model.trim()
    ? args.model.trim()
    : (backend.id === 'codex' ? codexConfig.defaultModel : 'claude-3-7-sonnet');

  const approval = checkModelGovernance(requestedModel, args.user_confirmed);
  if (approval) return approval;

  const filesContext =
    Array.isArray(args.file_paths) && args.file_paths.length > 0
      ? `\nTarget files:\n${args.file_paths.join('\n')}`
      : '';

  const prompt = `[TASK: ARCHITECTURAL & CODE ANALYSIS]
Please perform a detailed code and architectural analysis for the following request:

OBJECTIVE:
${args.task}
${filesContext}`;

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
      reasoningEffort: args.reasoning_effort || 'high',
      abortSignal: abortSignal || undefined,
      onProgress,
    });
    return formatExecutionResult('claude', res);
  }

  const effort = codexAdapter.normalizeReasoningEffort(args.reasoning_effort, 'high');
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
