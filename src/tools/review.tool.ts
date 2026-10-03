import { resolveBackend } from '../services/router.service.js';
import { collectGitScope } from '../services/git.service.js';
import { checkModelGovernance } from '../services/policy.service.js';
import { acquireAndResolveSession, releaseSessionTurn, updateSession } from '../services/session.service.js';
import * as codexAdapter from '../adapters/codex.adapter.js';
import * as claudeAdapter from '../adapters/claude.adapter.js';
import { formatExecutionResult } from './common.js';
import { TOOL_NAMES, getLegacyAliasDescription } from '../constants/index.js';

export function getReviewToolDefinitions(codexConfig: any) {
  const baseReviewSchema = {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        description:
          'Target changes to review. Formats: "uncommitted" (default), "staged", commit SHA ("a1b2c3d"), revision ("HEAD~1"), base branch ("main"), or revision range ("main...feature").',
      },
      instructions: {
        type: 'string',
        description: 'Review focus guidelines, constraints, conventions, or security/performance checks.',
      },
      backend: {
        type: 'string',
        enum: ['auto', 'codex', 'claude', 'smart_quota'],
        description: 'CLI agent backend to execute the review (default: "auto", respecting configured default or smart_quota).',
      },
      workspace_path: {
        type: 'string',
        description: 'Optional absolute path to workspace root.',
      },
      model: {
        type: 'string',
        description: 'Optional model override for the selected backend.',
      },
      reasoning_effort: {
        type: 'string',
        description: 'Reasoning depth level (e.g. "low", "medium", "high", "xhigh", "max").',
      },
      user_confirmed: {
        type: 'boolean',
        description: 'Mandatory true confirmation if invoking top-tier models (e.g. "astra", "claude-3-opus").',
      },
      session_handle: {
        type: 'string',
        description: 'Optional persistent session handle from a previous turn to preserve full multi-turn context.',
      },
    },
  };

  return [
    {
      name: TOOL_NAMES.REVIEW,
      description:
        'Perform an automated code review on uncommitted changes, staged index, branches, or commits using local reasoning agents (Codex or Claude Code) in read-only sandbox mode.',
      inputSchema: baseReviewSchema,
    },
    {
      name: TOOL_NAMES.LEGACY_REVIEW,
      description: getLegacyAliasDescription(TOOL_NAMES.REVIEW),
      inputSchema: baseReviewSchema,
    },
    {
      name: TOOL_NAMES.CODEX_REVIEW,
      description:
        'Run an automated code review on uncommitted changes, staged index, branches, or commits using OpenAI Codex in read-only mode.',
      inputSchema: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            description:
              'Target changes to review. Formats: "uncommitted" (default), "staged", commit SHA ("a1b2c3d"), revision ("HEAD~1"), base branch ("main"), or revision range ("main...feature").',
          },
          instructions: {
            type: 'string',
            description: 'Review focus guidelines, constraints, conventions, or security/performance checks.',
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
            description: `Reasoning effort depth (default: "${codexConfig.defaultReasoningEffort}").`,
          },
          user_confirmed: {
            type: 'boolean',
            description: 'Mandatory true confirmation if using the top-tier "astra" model.',
          },
        },
      },
    },
  ];
}

export async function handleReview(
  toolName: string,
  args: any,
  workspaceCwd: string,
  abortSignal: AbortSignal | null = null,
  onProgress: any = null
) {
  const backendId = toolName === TOOL_NAMES.CODEX_REVIEW ? 'codex' : (args.backend || 'auto');
  const backend = await resolveBackend(backendId);

  const codexConfig = codexAdapter.readCodexConfig();
  const requestedModel = typeof args.model === 'string' && args.model.trim()
    ? args.model.trim()
    : (backend.id === 'codex' ? codexConfig.defaultModel : 'claude-3-7-sonnet');

  const approval = checkModelGovernance(requestedModel, args.user_confirmed);
  if (approval) return approval;

  if (backend.id === 'claude' && args.session_handle) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'Multi-turn session continuation is currently supported on the Codex backend. Session continuation for Claude Code CLI is planned for a subsequent update.' }],
    };
  }

  const scopeInfo = await collectGitScope(args.scope, workspaceCwd, abortSignal);
  const hasInstructions = typeof args.instructions === 'string' && args.instructions.trim();

  if (!scopeInfo.diff) {
    return {
      isError: false,
      content: [{ type: 'text', text: `Review reported clean: No changes detected in target scope (${scopeInfo.label}).` }],
    };
  }

  if (backend.id === 'claude') {
    const prompt = `[TASK: CODE REVIEW & AUDIT]
Scope: ${scopeInfo.label}
Review Guidelines & Constraints:
${hasInstructions ? args.instructions : 'Perform a comprehensive code review focusing on correctness, security, edge cases, and architectural best practices.'}

DIFF / CHANGES:
${scopeInfo.diff}`;

    const res = await claudeAdapter.executeClaude(prompt, {
      cwd: workspaceCwd,
      model: requestedModel,
      reasoningEffort: args.reasoning_effort || 'high',
      abortSignal: abortSignal || undefined,
      onProgress,
    });

    return formatExecutionResult('claude', res);
  }

  // Codex backend
  const effort = codexAdapter.normalizeReasoningEffort(args.reasoning_effort, codexConfig.defaultReasoningEffort);
  const cliModelArgs = ['-m', requestedModel, '-c', `model_reasoning_effort=${effort}`];

  if (
    toolName === TOOL_NAMES.REVIEW ||
    toolName === TOOL_NAMES.LEGACY_REVIEW ||
    args.session_handle ||
    hasInstructions ||
    !scopeInfo.nativeArgs
  ) {
    const sessionRes = acquireAndResolveSession(args.session_handle, backend.id, workspaceCwd);
    if (sessionRes.error) {
      return {
        isError: true,
        content: [{ type: 'text', text: sessionRes.error }],
      };
    }
    const session = sessionRes.session!;
    const sessionOptions = session.threadId ? { threadId: session.threadId } : {};

    const prompt = `[TASK: CODE REVIEW & AUDIT]
Scope: ${scopeInfo.label}
Review Guidelines & Constraints:
${hasInstructions ? args.instructions : 'Perform a comprehensive code review focusing on correctness, security, edge cases, and architectural best practices.'}

DIFF / CHANGES:
${scopeInfo.diff}`;

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

      execResult = formatExecutionResult('codex', res, 'Codex review reported clean status.', session.sessionHandle);
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

  const reviewArgs = [...cliModelArgs, ...scopeInfo.nativeArgs];
  const res = await codexAdapter.executeCodexReview(reviewArgs, workspaceCwd, abortSignal, onProgress);
  return formatExecutionResult('codex', res, 'Codex review reported clean status.');
}
