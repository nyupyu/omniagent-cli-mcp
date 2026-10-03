# SynAgent MCP - Cross-Agent CLI Bridge

<p align="center">
  <a href="https://oki.dev">
    <img src="https://raw.githubusercontent.com/nyupyu/synagent/main/assets/logo.png" width="128" height="128" alt="SynAgent Logo" />
  </a>
</p>

<p align="center">
  <a href="https://oki.dev"><img src="https://img.shields.io/badge/Website-oki.dev-007acc?style=flat-square&logo=googlechrome&logoColor=white" alt="Website" /></a>
  <a href="https://www.npmjs.com/package/synagent"><img src="https://img.shields.io/badge/npm-synagent-cb3837?style=flat-square&logo=npm&logoColor=white" alt="npm package" /></a>
  <a href="https://github.com/nyupyu/synagent/actions/workflows/ci.yml"><img src="https://img.shields.io/badge/CI-Passing-2ea44f?style=flat-square&logo=githubactions&logoColor=white" alt="CI Status" /></a>
  <a href="https://github.com/nyupyu/synagent/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-44cc11?style=flat-square" alt="License" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-Compatible-blueviolet?style=flat-square&logo=visualstudiocode&logoColor=white" alt="MCP Compatible" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20.0.0-informational?style=flat-square&logo=node.js&logoColor=white" alt="Node" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Codex%20CLI-Active%20Backend-10a37f?style=flat-square&logo=openai&logoColor=white" alt="Codex CLI Active" />
  <img src="https://img.shields.io/badge/Claude%20Code-Active%20Backend-d97706?style=flat-square&logo=anthropic&logoColor=white" alt="Claude Code Active" />
  <img src="https://img.shields.io/badge/Gemini%20CLI-Probed%20Backend-4285f4?style=flat-square&logo=google&logoColor=white" alt="Gemini CLI Probed" />
  <img src="https://img.shields.io/badge/Sandbox-Read--Only%20Guard-2ea44f?style=flat-square" alt="Sandbox Guard" />
</p>

An intelligent cross-agent orchestration bridge connecting IDEs (**VS Code**, **Cursor**, **Antigravity**) with local coding agent CLIs (**OpenAI Codex CLI**, **Claude Code**, and **Gemini CLI**) via the Model Context Protocol (MCP).

---

## ⚡ Prerequisites & Agent Status

SynAgent bridges your IDE with your local CLI agents. **You need at least one supported CLI installed and authenticated** on your machine:

| Provider | Status in v1.0 | Model Families | Installation | Interactive Sign-In |
| :--- | :--- | :--- | :--- | :--- |
| **OpenAI Codex** | **Active Backend** | Sol, Luna, Astra | `npm install -g @openai/codex` | `codex login` |
| **Claude Code** | **Active Backend** | Sonnet 3.7, Opus | `npm install -g @anthropic-ai/claude-code` | `claude auth login` |
| **Gemini CLI** | **Probed Backend** | Flash, Pro | `npm install -g @google/gemini-cli` | `gemini` (follow prompts) |

> [!NOTE]
> Run the **`synagent_doctor`** tool anytime to check your machine's environment, active versions, and authentication readiness.

> [!IMPORTANT]
> **Strict User Consent & Privacy Policy**:
> - **Zero Silent Downloads**: SynAgent **never** downloads, installs, or executes packages in the background. If a CLI is missing, `synagent_doctor` provides the exact terminal command.
> - **Read-Only Sandbox Guard**: All diagnostic, review, analysis, and consultation tasks run in enforced **`read-only`** mode (`--sandbox read-only` on Codex, `--permission-mode dontAsk --tools Read,Glob,Grep` on Claude) to protect your repository from unintended edits.

---

## Architecture: Maker–Checker Pattern

SynAgent establishes an automated **Maker–Checker (Builder–Auditor)** pair programming workflow:
- **Primary IDE Assistant** (**VS Code**, **Cursor**, **Antigravity**): Interactive development, file editing, test execution, and Git management.
- **Local CLI Reasoning Engines**: Deep independent verification, root-cause debugging, non-interactive audit, and second opinions running safely in read-only sandbox mode.

```text
[ VS Code / Cursor / Antigravity ]
               │
        (MCP over stdio)
               ▼
        synagent server (v0.9.0-dev)
               │
   ┌───────────┼───────────┐
   ▼           ▼           ▼
Codex CLI   Claude Code  Gemini CLI
(Active)    (Active)     (Probed)
```

---

## Tool Reference

### Universal Multi-Agent Tools
| Primary Tool | Legacy Alias | Description | Key Parameters |
| :--- | :--- | :--- | :--- |
| **`synagent_doctor`** | `omniagent_doctor` | Comprehensive multi-agent diagnostic audit. Checks presence, versions, paths, and auth status of all 3 CLIs. | *None* |
| **`synagent_review`** | `omniagent_review` | Automated code review with full Git scope support across uncommitted, staged, commit, or branch diffs. | `scope`, `instructions`, `backend: "auto"\|"codex"\|"claude"` |
| **`synagent_consult`** | `omniagent_consult` | Second opinion and architectural evaluation for proposed refactoring plans or designs. | `proposal`, `specific_questions`, `backend: "auto"\|"codex"\|"claude"` |
| **`synagent_analyze`** | `omniagent_analyze` | In-depth structural, architectural, and dependency analysis in read-only mode. | `task`, `file_paths`, `backend: "auto"\|"codex"\|"claude"` |
| **`synagent_quota_status`** | `omniagent_quota_status` | Current rolling limit headroom and usage telemetry across backends. | `refresh` |
| **`synagent_set_default`** | `omniagent_set_default` | Persist default CLI backend in `~/.synagent/config.json`. | `backend` |
| **`synagent_close_session`** | `omniagent_close_session` | Cleanly terminate an active multi-turn session. | `session_handle` |
| **`synagent_report_bug`** | `omniagent_report_bug` | Privacy-sanitized bug report and pre-filled GitHub issue URL. | `error_message`, `context` |

### 100% Backward-Compatible Codex Tools
All existing `codex_*` tools are preserved with identical schemas and semantics:
- **`codex_status`** — Retrieves configuration, daemon status, and active model policies.
- **`codex_review_code`** — Automated code review pinned to Codex CLI.
- **`codex_consult`** — Architectural second opinion pinned to Codex CLI.
- **`codex_analyze`** — Codebase and structural analysis pinned to Codex CLI.
- **`codex_debug_error`** — Root-cause debugging and fix recommendations for error traces.
- **`codex_implement`** — Synthesis of complex algorithms and class scaffolds (read-only output).

---

## Review Scope Architecture (`synagent_review`)

SynAgent supports granular Git scope targeting:

| Scope Format | Example | Description |
| :--- | :--- | :--- |
| **Working Changes** *(Default)* | `"uncommitted"`, `""` | All unstaged, staged, and untracked changes across the working tree. |
| **Staged Index Only** | `"staged"`, `"cached"` | Only changes added to the Git staging index (`git diff --cached`). |
| **Single Commit** | `"c502bf5"`, `"commit:c502bf5"` | Diffs introduced by a specific commit SHA (`git show <sha>`). |
| **Relative Revision** | `"HEAD~1"`, `"HEAD^"` | Diffs introduced by a relative ancestor revision (`git show HEAD~1`). |
| **Branch / PR Comparison** | `"main"`, `"origin/main"` | Comparison of current branch against base branch (`git diff <base>...HEAD`). |
| **Revision Range** | `"main...feature"`, `"v1.0..v2.0"` | Diffs across any valid two-dot or three-dot revision range. |

All scope arguments are strictly sanitized to prevent option injection, and prompts are piped via standard input to eliminate command-line character limits on Windows.

---

## Safety & Governance Guardrails

To prevent accidental consumption of high-tier resources, top-tier models (`astra` in Codex, `claude-3-opus` in Claude) are strictly guarded:
1. **Interactive Prompt**: The caller must prompt the user before initiating requests with this tier.
2. **Server-Side Enforcement**: The server rejects calls requesting top-tier models unless `user_confirmed: true` is explicitly passed.

---

## Installation & Configuration

### 1. Install via npm
```bash
npm install -g synagent
# or run directly with npx:
npx synagent
```

### 2. Configure in your IDE

#### VS Code (`User/mcp.json`)
```json
{
  "servers": {
    "io.github.oki-dev/synagent": {
      "type": "stdio",
      "command": "synagent"
    }
  }
}
```

#### Antigravity & Cursor (`mcp_config.json`)
```json
{
  "mcpServers": {
    "synagent": {
      "command": "synagent"
    }
  }
}
```

---

## Automated Test Suite

SynAgent includes a test suite using the native Node.js test runner:

```bash
npm test
```

---

## Author & License

- **Author**: Oktawian Wybieralski ([oki.dev](https://oki.dev))
- **Website**: [https://oki.dev](https://oki.dev)
- **License**: MIT
