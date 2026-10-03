import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createProgressReporter } from './services/progress.service.js';
import { resolveWorkspacePath } from './services/policy.service.js';
import { generateBugReport } from './services/issue.service.js';
import * as codexAdapter from './adapters/codex.adapter.js';

import {
  doctorToolDefinition,
  codexStatusToolDefinition,
  handleOmniagentDoctor,
  handleCodexStatus,
} from './tools/doctor.tool.js';
import { setDefaultToolDefinition, handleOmniagentSetDefault } from './tools/config.tool.js';
import { quotaToolDefinition, handleOmniagentQuotaStatus } from './tools/quota.tool.js';
import { reportBugToolDefinition, handleOmniagentReportBug } from './tools/issue.tool.js';
import { closeSessionToolDefinition, handleOmniagentCloseSession } from './tools/session.tool.js';
import { getReviewToolDefinitions, handleReview } from './tools/review.tool.js';
import { getConsultToolDefinitions, handleConsult } from './tools/consult.tool.js';
import { getAnalyzeToolDefinitions, handleAnalyze } from './tools/analyze.tool.js';
import { getDebugToolDefinition, handleDebugError } from './tools/debug.tool.js';
import { getImplementToolDefinition, handleImplement } from './tools/implement.tool.js';

const VALID_COMMON_BACKENDS = new Set(['auto', 'codex', 'claude', 'smart_quota']);

function validateToolArguments(args: unknown): Record<string, unknown> {
  if (args === undefined || args === null) {
    return {};
  }
  if (typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('Tool arguments must be a valid key-value object.');
  }
  const obj = args as Record<string, unknown>;

  if (obj.backend !== undefined) {
    if (typeof obj.backend !== 'string' || !VALID_COMMON_BACKENDS.has(obj.backend.toLowerCase())) {
      throw new Error(
        `Invalid argument 'backend': '${obj.backend}'. Supported options: 'auto', 'codex', 'claude', 'smart_quota'.`
      );
    }
  }

  if (obj.workspace_path !== undefined && typeof obj.workspace_path !== 'string') {
    throw new Error(`Invalid argument 'workspace_path': expected string, received ${typeof obj.workspace_path}.`);
  }

  if (obj.scope !== undefined && typeof obj.scope !== 'string') {
    throw new Error(`Invalid argument 'scope': expected string, received ${typeof obj.scope}.`);
  }

  if (obj.instructions !== undefined && typeof obj.instructions !== 'string') {
    throw new Error(`Invalid argument 'instructions': expected string, received ${typeof obj.instructions}.`);
  }

  if (obj.proposal !== undefined && typeof obj.proposal !== 'string') {
    throw new Error(`Invalid argument 'proposal': expected string, received ${typeof obj.proposal}.`);
  }

  if (obj.specific_questions !== undefined && typeof obj.specific_questions !== 'string') {
    throw new Error(`Invalid argument 'specific_questions': expected string, received ${typeof obj.specific_questions}.`);
  }

  if (obj.model !== undefined && typeof obj.model !== 'string') {
    throw new Error(`Invalid argument 'model': expected string, received ${typeof obj.model}.`);
  }

  if (obj.reasoning_effort !== undefined && typeof obj.reasoning_effort !== 'string') {
    throw new Error(`Invalid argument 'reasoning_effort': expected string, received ${typeof obj.reasoning_effort}.`);
  }

  if (obj.user_confirmed !== undefined && typeof obj.user_confirmed !== 'boolean') {
    throw new Error(`Invalid argument 'user_confirmed': expected boolean, received ${typeof obj.user_confirmed}.`);
  }

  if (obj.session_handle !== undefined && typeof obj.session_handle !== 'string') {
    throw new Error(`Invalid argument 'session_handle': expected string, received ${typeof obj.session_handle}.`);
  }

  return obj;
}

export function createServer(): Server {
  const server = new Server(
    {
      name: 'omniagent',
      version: '1.0.0-rc.1',
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
        doctorToolDefinition,
        setDefaultToolDefinition,
        quotaToolDefinition,
        reportBugToolDefinition,
        closeSessionToolDefinition,
        ...getReviewToolDefinitions(codexConfig).slice(0, 1), // omniagent_review
        ...getConsultToolDefinitions(codexConfig).slice(0, 1), // omniagent_consult
        ...getAnalyzeToolDefinitions(codexConfig).slice(0, 1), // omniagent_analyze
        codexStatusToolDefinition,
        getDebugToolDefinition(codexConfig),
        ...getAnalyzeToolDefinitions(codexConfig).slice(1), // codex_analyze
        ...getReviewToolDefinitions(codexConfig).slice(1), // codex_review_code
        getImplementToolDefinition(codexConfig),
        ...getConsultToolDefinitions(codexConfig).slice(1), // codex_consult
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (!request.params || typeof request.params !== 'object') {
      throw new Error('Invalid CallTool request: params must be an object.');
    }

    const { name } = request.params;
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error('Invalid CallTool request: tool name must be a non-empty string.');
    }

    const args = validateToolArguments(request.params.arguments);
    const abortSignal = extra?.signal;
    const progressToken = request.params._meta?.progressToken;
    const onProgress = createProgressReporter(server, progressToken);

    try {
      // 1. Doctor
      if (name === 'omniagent_doctor') {
        return await handleOmniagentDoctor();
      }

      // 2. Set Default Backend
      if (name === 'omniagent_set_default') {
        return await handleOmniagentSetDefault(args);
      }

      // 3. Quota Status
      if (name === 'omniagent_quota_status') {
        return await handleOmniagentQuotaStatus(args);
      }

      // 4. Report Bug
      if (name === 'omniagent_report_bug') {
        return await handleOmniagentReportBug(args);
      }

      // 5. Close Session
      if (name === 'omniagent_close_session') {
        return await handleOmniagentCloseSession(args);
      }

      // 6. Legacy Codex Status
      if (name === 'codex_status') {
        return await handleCodexStatus();
      }

      // Resolve workspace strictly
      const workspaceCwd = resolveWorkspacePath(args.workspace_path as string | undefined);

      // Review
      if (name === 'omniagent_review' || name === 'codex_review_code') {
        return await handleReview(name, args, workspaceCwd, abortSignal, onProgress);
      }

      // Consult
      if (name === 'omniagent_consult' || name === 'codex_consult') {
        return await handleConsult(name, args, workspaceCwd, abortSignal, onProgress);
      }

      // Analyze
      if (name === 'omniagent_analyze' || name === 'codex_analyze') {
        return await handleAnalyze(name, args, workspaceCwd, abortSignal, onProgress);
      }

      // Debug
      if (name === 'codex_debug_error') {
        return await handleDebugError(args, workspaceCwd, abortSignal, onProgress);
      }

      // Implement
      if (name === 'codex_implement') {
        return await handleImplement(args, workspaceCwd, abortSignal, onProgress);
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (error: any) {
      let bugPrompt = '';
      try {
        const bugReport = generateBugReport({
          errorMessage: error.message,
          context: `Tool execution: ${name}`,
        });
        if (bugReport?.prompt) {
          bugPrompt = `\n\n${bugReport.prompt}`;
        }
      } catch (_) {}

      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `OmniAgent Execution Error: ${error.message}${bugPrompt}`,
          },
        ],
      };
    }
  });

  return server;
}
