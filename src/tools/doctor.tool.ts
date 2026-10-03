import { runDoctor } from '../services/doctor.service.js';
import * as codexAdapter from '../adapters/codex.adapter.js';

export const doctorToolDefinition = {
  name: 'omniagent_doctor',
  description:
    'Comprehensive multi-agent diagnostic tool. Audits installations, paths, versions, and auth status of OpenAI Codex CLI, Claude Code CLI, and Gemini CLI without running silent background downloads.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const codexStatusToolDefinition = {
  name: 'codex_status',
  description:
    'Diagnostic check: returns the OpenAI Codex CLI installation status, configuration, available models, reasoning efforts, and active policies.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export async function handleOmniagentDoctor() {
  const report = await runDoctor();
  return {
    content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
  };
}

export async function handleCodexStatus() {
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
              model: probe.config?.defaultModel,
              reasoning_effort: probe.config?.defaultReasoningEffort,
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
