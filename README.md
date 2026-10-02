# Codex MCP (OpenAI Codex Bridge)

<p align="center">
  <img src="assets/logo.svg" width="128" height="128" alt="Codex Plugin Logo" />
</p>

An intelligent multi-agent orchestration plugin bridging **Antigravity (Gemini)** with the local **OpenAI Codex CLI** via the Model Context Protocol (MCP).

## Architecture

This plugin establishes a **Maker–Checker (Builder–Auditor)** workflow:
- **Antigravity (Gemini)**: Fast navigation, interactive pair-programming, direct file editing, test execution, and Git workflows.
- **OpenAI Codex CLI**: Deep reasoning engine executing non-interactively in safe read-only sandbox mode for root-cause diagnosis, code review, architectural design, and complex algorithmic synthesis.

---

## Supported Models

Configured dynamically via `~/.codex/config.toml` or per-tool overrides:

| Model | Tier | Default Reasoning | Purpose |
| :--- | :--- | :--- | :--- |
| **`gpt-6.1-sol`** | Flagship (Default) | `xhigh` | General-purpose deep reasoning, primary auditing and synthesis |
| **`gpt-6.0-sol`** | Standard | `high` | Stable baseline fallback |
| **`luna`** | Fast | `medium` | Quick advice, lightweight consultations, low latency |
| **`astra`** | Top-Tier | `xhigh` | Heavy architectural synthesis (Requires user confirmation) |

### Reasoning Effort Levels
- `light`
- `medium`
- `high`
- `xhigh` (Default in your environment)

---

## Tool Reference

### 1. `codex_status`
Retrieves live configuration from `~/.codex/config.toml`, active daemon status, default reasoning effort, available models, and active governance policies.

### 2. `codex_debug_error`
- **Purpose**: Root-cause analysis and actionable fix recommendations for runtime errors, stack traces, build failures, or failing test suites.
- **Parameters**: `error_message`, `context`, `file_paths`, `model`, `reasoning_effort`, `user_confirmed`.

### 3. `codex_analyze`
- **Purpose**: In-depth structural, architectural, and dependency analysis in safe read-only sandbox mode.
- **Parameters**: `task`, `file_paths`, `model`, `reasoning_effort`, `user_confirmed`.

### 4. `codex_review_code`
- **Purpose**: Automated code audit against uncommitted changes (`git diff`) or specific branches/commits.
- **Parameters**: `instructions`, `scope` (`uncommitted`, branch name, or commit SHA), `model`, `reasoning_effort`, `user_confirmed`.

### 5. `codex_implement`
- **Purpose**: Synthesis of complex algorithms, mathematical logic, or boilerplate contracts.
- **Parameters**: `specification`, `context_files`, `model`, `reasoning_effort`, `user_confirmed`.

### 6. `codex_consult`
- **Purpose**: Second opinion, sanity checks, and trade-off evaluations for proposed architectural refactors.
- **Parameters**: `proposal`, `specific_questions`, `model`, `reasoning_effort`, `user_confirmed`.

---

## Safety & Governance (Astra Guardrail)

To prevent accidental consumption of top-tier resources, the `astra` model is protected by a two-layer guardrail:
1. **Interactive Prompt**: Antigravity is instructed to display an interactive choice survey to the user before requesting Astra.
2. **Server-Side Enforcement**: The MCP server rejects calls requesting `astra` unless `user_confirmed: true` is passed.

---

## Installation & Registrations

- **VS Code MCP configuration**: Registered in `AppData/Roaming/Code/User/mcp.json`.
- **Antigravity MCP configuration**: Registered in `.gemini/config/mcp_config.json`.
- **Plugin Manifest**: `.gemini/config/plugins/codex/plugin.json`.

---

## Author & License

- **Author**: Oktawian Wybieralski ([oki.dev](https://oki.dev))
- **Website**: [https://oki.dev](https://oki.dev)
- **License**: MIT

