import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createProgressReporter } from './services/progress.service.js';
import { resolveWorkspacePath } from './services/policy.service.js';
import { generateBugReport } from './services/issue.service.js';
import * as codexAdapter from './adapters/codex.adapter.js';
import { BRAND, TOOL_NAMES } from './constants/index.js';

import {
  doctorToolDefinition,
  legacyDoctorToolDefinition,
  codexStatusToolDefinition,
  handleDoctor,
  handleCodexStatus,
} from './tools/doctor.tool.js';
import {
  setDefaultToolDefinition,
  legacySetDefaultToolDefinition,
  handleSetDefault,
} from './tools/config.tool.js';
import {
  quotaToolDefinition,
  legacyQuotaToolDefinition,
  handleQuotaStatus,
} from './tools/quota.tool.js';
import {
  reportBugToolDefinition,
  legacyReportBugToolDefinition,
  handleReportBug,
} from './tools/issue.tool.js';
import {
  closeSessionToolDefinition,
  legacyCloseSessionToolDefinition,
  handleCloseSession,
} from './tools/session.tool.js';
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
      name: BRAND.SERVER_NAME,
      version: BRAND.SERVER_VERSION,
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
        // Primary SynAgent Tools:
        doctorToolDefinition, // synagent_doctor
        setDefaultToolDefinition, // synagent_set_default
        quotaToolDefinition, // synagent_quota_status
        reportBugToolDefinition, // synagent_report_bug
        closeSessionToolDefinition, // synagent_close_session
        ...getReviewToolDefinitions(codexConfig).slice(0, 1), // synagent_review
        ...getConsultToolDefinitions(codexConfig).slice(0, 1), // synagent_consult
        ...getAnalyzeToolDefinitions(codexConfig).slice(0, 1), // synagent_analyze
        // Backward-compatible OmniAgent Aliases:
        legacyDoctorToolDefinition, // omniagent_doctor
        legacySetDefaultToolDefinition, // omniagent_set_default
        legacyQuotaToolDefinition, // omniagent_quota_status
        legacyReportBugToolDefinition, // omniagent_report_bug
        legacyCloseSessionToolDefinition, // omniagent_close_session
        ...getReviewToolDefinitions(codexConfig).slice(1, 2), // omniagent_review
        ...getConsultToolDefinitions(codexConfig).slice(1, 2), // omniagent_consult
        ...getAnalyzeToolDefinitions(codexConfig).slice(1, 2), // omniagent_analyze
        // Codex Legacy Tools:
        codexStatusToolDefinition,
        getDebugToolDefinition(codexConfig),
        ...getAnalyzeToolDefinitions(codexConfig).slice(2), // codex_analyze
        ...getReviewToolDefinitions(codexConfig).slice(2), // codex_review_code
        getImplementToolDefinition(codexConfig),
        ...getConsultToolDefinitions(codexConfig).slice(2), // codex_consult
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
      switch (name) {
        // 1. Doctor
        case TOOL_NAMES.DOCTOR:
        case TOOL_NAMES.LEGACY_DOCTOR:
          return await handleDoctor();

        // 2. Set Default Backend
        case TOOL_NAMES.SET_DEFAULT:
        case TOOL_NAMES.LEGACY_SET_DEFAULT:
          return await handleSetDefault(args);

        // 3. Quota Status
        case TOOL_NAMES.QUOTA_STATUS:
        case TOOL_NAMES.LEGACY_QUOTA_STATUS:
          return await handleQuotaStatus(args);

        // 4. Report Bug
        case TOOL_NAMES.REPORT_BUG:
        case TOOL_NAMES.LEGACY_REPORT_BUG:
          return await handleReportBug(args);

        // 5. Close Session
        case TOOL_NAMES.CLOSE_SESSION:
        case TOOL_NAMES.LEGACY_CLOSE_SESSION:
          return await handleCloseSession(args);

        // 6. Legacy Codex Status
        case TOOL_NAMES.CODEX_STATUS:
          return await handleCodexStatus();

        default: {
          // Resolve workspace strictly for execution tools
          const workspaceCwd = resolveWorkspacePath(args.workspace_path as string | undefined);

          // Review
          if (
            name === TOOL_NAMES.REVIEW ||
            name === TOOL_NAMES.LEGACY_REVIEW ||
            name === TOOL_NAMES.CODEX_REVIEW
          ) {
            return await handleReview(name, args, workspaceCwd, abortSignal, onProgress);
          }

          // Consult
          if (
            name === TOOL_NAMES.CONSULT ||
            name === TOOL_NAMES.LEGACY_CONSULT ||
            name === TOOL_NAMES.CODEX_CONSULT
          ) {
            return await handleConsult(name, args, workspaceCwd, abortSignal, onProgress);
          }

          // Analyze
          if (
            name === TOOL_NAMES.ANALYZE ||
            name === TOOL_NAMES.LEGACY_ANALYZE ||
            name === TOOL_NAMES.CODEX_ANALYZE
          ) {
            return await handleAnalyze(name, args, workspaceCwd, abortSignal, onProgress);
          }

          // Debug
          if (name === TOOL_NAMES.CODEX_DEBUG) {
            return await handleDebugError(args, workspaceCwd, abortSignal, onProgress);
          }

          // Implement
          if (name === TOOL_NAMES.CODEX_IMPLEMENT) {
            return await handleImplement(args, workspaceCwd, abortSignal, onProgress);
          }

          throw new Error(`Unknown tool: ${name}`);
        }
      }
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
            text: `${BRAND.NAME} Execution Error: ${error.message}${bugPrompt}`,
          },
        ],
      };
    }
  });

  return server;
}
