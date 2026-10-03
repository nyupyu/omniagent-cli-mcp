import * as codexAdapter from '../adapters/codex.adapter.js';
import * as claudeAdapter from '../adapters/claude.adapter.js';
import * as geminiAdapter from '../adapters/gemini.adapter.js';

export async function runDoctor(): Promise<any> {
  const [codex, claude, gemini] = await Promise.all([
    codexAdapter.probe(),
    claudeAdapter.probe(),
    geminiAdapter.probe(),
  ]);

  const activeBackends: string[] = [];
  if (codex.installed) activeBackends.push('codex');
  if (claude.installed) activeBackends.push('claude');

  let overallStatus = 'operational';
  if (activeBackends.length === 0) {
    overallStatus = 'degraded_no_active_backends';
  } else if (!codex.installed || !claude.installed) {
    overallStatus = 'partially_configured';
  }

  const recommendations: string[] = [];
  if (!codex.installed) {
    recommendations.push(
      `OpenAI Codex CLI is missing. Install via terminal: 'npm install -g @openai/codex' and run 'codex login'.`
    );
  }
  if (!claude.installed) {
    recommendations.push(
      `Claude Code CLI is missing. Install via terminal: 'npm install -g @anthropic-ai/claude-code' and run 'claude auth login'.`
    );
  }
  if (!gemini.installed) {
    recommendations.push(
      `Gemini CLI is missing. Install via terminal: 'npm install -g @google/gemini-cli' and run 'gemini'.`
    );
  }

  return {
    status: overallStatus,
    active_backends: activeBackends,
    default_backend: codex.installed ? 'codex' : (claude.installed ? 'claude' : 'none'),
    security_policy: {
      zero_silent_downloads: true,
      read_only_sandbox_guard: true,
      governed_models_require_confirmation: ['astra', 'claude-3-opus'],
    },
    backends: {
      codex,
      claude,
      gemini,
    },
    recommendations,
  };
}
