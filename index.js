#!/usr/bin/env node

'use strict';

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const { runDoctor } = require('./src/doctor.js');
const { resolveBackend } = require('./src/router.js');
const { collectGitScope, sanitizeGitRef } = require('./src/git.js');
const { checkModelGovernance, resolveWorkspacePath } = require('./src/policy.js');
const { createProgressReporter } = require('./src/progress.js');
const { setDefaultBackend, loadConfig, CONFIG_FILE } = require('./src/config.js');
const { inspectQuotas, checkAndRecordRateLimit } = require('./src/quota.js');
const codexAdapter = require('./src/adapters/codex.js');
const claudeAdapter = require('./src/adapters/claude.js');

const server = new Server(
  {
    name: 'omniagent',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const codexConfig = codexAdapter.readCodexConfig();

  return {
    tools: [
      // --- Universal OmniAgent Tools (v1.0.0) ---
      {
        name: 'omniagent_doctor',
        description:
          'Comprehensive multi-agent diagnostic tool. Audits installations, paths, versions, and auth status of OpenAI Codex CLI, Claude Code CLI, and Gemini CLI without running silent background downloads.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'omniagent_set_default',
        description:
          'Set and persist your preferred default CLI agent backend in ~/.omniagent/config.json.',
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
      },
      {
        name: 'omniagent_quota_status',
        description:
          'Check current 5-hour rolling limit headroom, usage percentages, and reset timestamps across active CLI backends without consuming generation tokens.',
        inputSchema: {
          type: 'object',
          properties: {
            refresh: {
              type: 'boolean',
              description: 'Force live refresh instead of reading cached telemetry.',
            },
          },
        },
      },
      {
        name: 'omniagent_review',
        description:
          'Perform an automated code review on uncommitted changes, staged index, branches, or commits using local reasoning agents (Codex or Claude Code) in read-only sandbox mode.',
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
          },
        },
      },
      {
        name: 'omniagent_consult',
        description:
          'Consult local reasoning agents (Codex or Claude Code) for a second opinion on architecture plans, refactoring strategies, or technical trade-offs.',
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
          },
          required: ['proposal'],
        },
      },
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
          },
          required: ['task'],
        },
      },

      // --- 100% Backward Compatible Codex Tools ---
      {
        name: 'codex_status',
        description:
          'Diagnostic check: returns the OpenAI Codex CLI installation status, configuration, available models, reasoning efforts, and active policies.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
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
      {
        name: 'codex_review_code',
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
      {
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
    ],
  };
});

function formatExecutionResult(backendId, res, defaultText = 'No output received.') {
  if (res.isError) {
    const diagnostic = res.errorDetail || res.output;
    if (diagnostic) {
      checkAndRecordRateLimit(backendId, diagnostic);
    }
  }
  return {
    isError: res.isError,
    content: [{ type: 'text', text: res.output || defaultText }],
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const { name, arguments: args = {} } = request.params;
  const abortSignal = extra && extra.signal;
  const progressToken = request.params?._meta?.progressToken;
  const onProgress = createProgressReporter(server, progressToken);

  try {
    // 1. Doctor tool
    if (name === 'omniagent_doctor') {
      const report = await runDoctor();
      return {
        content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
      };
    }

    // 2. Set Default Backend
    if (name === 'omniagent_set_default') {
      const updated = setDefaultBackend(args.backend);
      return {
        content: [
          {
            type: 'text',
            text: `Successfully set default backend to '${args.backend}'. Saved to ${CONFIG_FILE}`,
          },
        ],
      };
    }

    // 3. Quota Status
    if (name === 'omniagent_quota_status') {
      const quotas = await inspectQuotas(args.refresh === true);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(quotas, null, 2),
          },
        ],
      };
    }

    // 2. Legacy Codex Status
    if (name === 'codex_status') {
      const probe = await codexAdapter.probe();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: probe.installed ? 'operational' : 'degraded_cli_missing',
                executable_path: probe.command,
                active_config: {
                  model: probe.config.defaultModel,
                  reasoning_effort: probe.config.defaultReasoningEffort,
                  config_path: probe.configPath,
                },
                available_models: probe.availableModels,
                reasoning_effort_levels: probe.supportedReasoningEfforts,
                governance_policy: {
                  astra_requires_survey_confirmation: true,
                  default_sandbox: 'read-only',
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Resolve workspace strictly
    const workspaceCwd = resolveWorkspacePath(args.workspace_path);

    // --- Unified Review & Legacy Codex Review ---
    if (name === 'omniagent_review' || name === 'codex_review_code') {
      const backendId = name === 'codex_review_code' ? 'codex' : (args.backend || 'auto');
      const backend = await resolveBackend(backendId);

      const codexConfig = codexAdapter.readCodexConfig();
      const requestedModel = typeof args.model === 'string' && args.model.trim()
        ? args.model.trim()
        : (backend.id === 'codex' ? codexConfig.defaultModel : 'claude-3-7-sonnet');

      const approval = checkModelGovernance(requestedModel, args.user_confirmed);
      if (approval) return approval;

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
          abortSignal,
          onProgress,
        });

        return formatExecutionResult('claude', res);
      }

      // Codex backend
      const effort = codexAdapter.normalizeReasoningEffort(args.reasoning_effort, codexConfig.defaultReasoningEffort);
      const cliModelArgs = ['-m', requestedModel, '-c', `model_reasoning_effort="${effort}"`];

      if (hasInstructions || !scopeInfo.nativeArgs) {
        const prompt = `[TASK: CODE REVIEW & AUDIT]
Scope: ${scopeInfo.label}
Review Guidelines & Constraints:
${hasInstructions ? args.instructions : 'Perform a comprehensive code review focusing on correctness, security, edge cases, and architectural best practices.'}

DIFF / CHANGES:
${scopeInfo.diff}`;

        const res = await codexAdapter.executeCodex(
          ['--sandbox', 'read-only', ...cliModelArgs, '-'],
          prompt,
          workspaceCwd,
          abortSignal,
          onProgress
        );

        return formatExecutionResult('codex', res, 'Codex review reported clean status.');
      }

      const reviewArgs = [...cliModelArgs, ...scopeInfo.nativeArgs];
      const res = await codexAdapter.executeCodexReview(reviewArgs, workspaceCwd, abortSignal, onProgress);
      return formatExecutionResult('codex', res, 'Codex review reported clean status.');
    }

    // --- Unified Consult & Legacy Codex Consult ---
    if (name === 'omniagent_consult' || name === 'codex_consult') {
      if (typeof args.proposal !== 'string' || !args.proposal.trim()) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Validation Error: proposal must be a non-empty string.' }],
        };
      }

      const backendId = name === 'codex_consult' ? 'codex' : (args.backend || 'auto');
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
        const res = await claudeAdapter.executeClaude(prompt, {
          cwd: workspaceCwd,
          model: requestedModel,
          reasoningEffort: args.reasoning_effort || 'medium',
          abortSignal,
          onProgress,
        });
        return formatExecutionResult('claude', res);
      }

      const effort = codexAdapter.normalizeReasoningEffort(args.reasoning_effort, 'medium');
      const cliModelArgs = ['-m', requestedModel, '-c', `model_reasoning_effort="${effort}"`];

      const res = await codexAdapter.executeCodex(
        ['--sandbox', 'read-only', ...cliModelArgs, '-'],
        prompt,
        workspaceCwd,
        abortSignal,
        onProgress
      );
      return formatExecutionResult('codex', res);
    }

    // --- Unified Analyze & Legacy Codex Analyze ---
    if (name === 'omniagent_analyze' || name === 'codex_analyze') {
      if (typeof args.task !== 'string' || !args.task.trim()) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Validation Error: task must be a non-empty string.' }],
        };
      }

      const backendId = name === 'codex_analyze' ? 'codex' : (args.backend || 'auto');
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
        const res = await claudeAdapter.executeClaude(prompt, {
          cwd: workspaceCwd,
          model: requestedModel,
          reasoningEffort: args.reasoning_effort || 'high',
          abortSignal,
          onProgress,
        });
        return formatExecutionResult('claude', res);
      }

      const effort = codexAdapter.normalizeReasoningEffort(args.reasoning_effort, 'high');
      const cliModelArgs = ['-m', requestedModel, '-c', `model_reasoning_effort="${effort}"`];

      const res = await codexAdapter.executeCodex(
        ['--sandbox', 'read-only', ...cliModelArgs, '-'],
        prompt,
        workspaceCwd,
        abortSignal,
        onProgress
      );
      return formatExecutionResult('codex', res);
    }

    // --- Legacy Codex Debug Error ---
    if (name === 'codex_debug_error') {
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
      const cliModelArgs = ['-m', requestedModel, '-c', `model_reasoning_effort="${effort}"`];

      const res = await codexAdapter.executeCodex(
        ['--sandbox', 'read-only', ...cliModelArgs, '-'],
        prompt,
        workspaceCwd,
        abortSignal,
        onProgress
      );
      return formatExecutionResult('codex', res);
    }

    // --- Legacy Codex Implement ---
    if (name === 'codex_implement') {
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
      const cliModelArgs = ['-m', requestedModel, '-c', `model_reasoning_effort="${effort}"`];

      const res = await codexAdapter.executeCodex(
        ['--sandbox', 'read-only', ...cliModelArgs, '-'],
        prompt,
        workspaceCwd,
        abortSignal,
        onProgress
      );
      return formatExecutionResult('codex', res);
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: `OmniAgent Execution Error: ${error.message}` }],
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('OmniAgent MCP Server v1.0.0 running on stdio');
}

run().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
