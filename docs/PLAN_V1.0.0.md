# OmniAgent MCP — Architecture & Release Roadmap (v1.0.0 & v1.1.0)

> **Architectural Specification & Release Roadmap (Audited & Approved by Codex Sol)**  
> **Status:** Steps 1–9 Complete | Step 10 (v1.0.0 Tagging & Publishing) & v1.1.0 Enhancements In Progress  
> **Author:** Oktawian Wybieralski  
> **NPM Package:** `omniagent-mcp` | **MCP ID:** `omniagent`

---

## 1. Architectural Hardening & Security (Codex Sol Maker-Checker)

During the architectural audit with **Codex Sol** (`gpt-6.1-sol`), the following security and compliance requirements were identified and enforced:

1. **Claude Code: `--permission-mode dontAsk` is NOT a read-only sandbox.**
   - In Claude Code, `dontAsk` merely suppresses user confirmation prompts; it does not restrict pre-authorized write tools.
   - **Enforced Solution:** Strict read-only tool whitelisting (`--tools "Read,Glob,Grep"`) to prohibit file modifications.
2. **Claude Code: `--bare` vs Subscription OAuth Profiles.**
   - Running `--bare` bypasses local user subscription tokens (`claude auth login`) and demands `ANTHROPIC_API_KEY`.
   - **Enforced Solution:** Use standard subscription profiles with strict tool sandboxing without forcing `--bare`.
3. **Code Privacy & No Silent Cross-Provider Fallback:**
   - Private repository code must never be transmitted across providers without explicit user consent.
   - If a backend encounters an error, outage, or rate limit, report the error directly rather than silently transferring code to another provider.
4. **Persistent Onboarding & Default Backend:**
   - When multiple agent CLIs are present, the default backend is chosen by the user and persisted in `~/.omniagent/config.json`.
   - If a configured default is uninstalled or unavailable, OmniAgent fails fast with actionable instructions rather than silently falling back and switching providers.
5. **Accurate Quota Telemetry (No Fabricated Metrics):**
   - Quotas remain honest and unmeasured (`usedPercent: null`, `resetsAt: null`) unless real telemetry or exhaustion is observed.
   - Active rate-limiting cooldowns (e.g. HTTP 429) are tracked locally in `quota-cache.json` and automatically cleared once expired.

---

## 2. Persistent Onboarding & Configuration (`~/.omniagent/config.json`)

Following established VS Code and MCP ecosystem conventions (Cline, Roo Code, Continue), user preferences are persisted in a validated JSON configuration file:

### Configuration Schema (`~/.omniagent/config.json`):
```json
{
  "schemaVersion": 1,
  "defaultBackend": "codex",
  "routing": {
    "strategy": "fixed",
    "allowedBackends": ["codex", "claude"]
  }
}
```

### First-Run Experience (Onboarding Flow):
1. **Explicit Request:** If a tool call specifies `backend: "claude"` or `backend: "codex"`, it is executed directly after checking `allowedBackends`.
2. **Single Installed CLI:** If only one CLI is installed (e.g. only Claude Code), OmniAgent automatically records it as `defaultBackend` on first run.
3. **Multiple Installed CLIs (No Default Set):**
   - The server throws a structured `[ONBOARDING_REQUIRED]` error listing all detected CLIs.
   - The user or IDE agent sets the default via the **`omniagent_set_default({ backend })`** MCP tool.
   - The selection is persisted to `~/.omniagent/config.json`.

---

## 3. Quota-Aware Routing (`smart_quota`)

Both **OpenAI Codex** and **Claude Code** operate on rolling 5-hour limit windows.

### Zero-Token Limit Tracking:
- **Telemetry & Cooldown Tracker:** Monitors runtime execution for rate-limit conditions (HTTP 429, usage limit errors) and assigns temporary cooldowns.
- **Immediate Expiry Sanitization:** Cooldown timestamps are continuously evaluated; expired cooldowns immediately restore operational status without waiting for cache invalidation.
- **Provider Allowlist Enforcement:** `smart_quota` candidate evaluation strictly respects `routing.allowedBackends`.

### Selection Algorithm in `smart_quota` Mode:
1. Identify all installed CLIs permitted by `routing.allowedBackends`.
2. Filter out exhausted or rate-limited backends (`usedPercent >= 100` or active `rate_limited` cooldown).
3. If only one healthy backend remains, select it immediately.
4. If multiple healthy backends have measured metrics:
   - Select the backend with significantly higher headroom (difference $\ge 10\%$).
   - Otherwise, select the backend with the earlier reset timestamp.
5. If metrics are unmeasured/null, select the first available backend in configured preference order.
6. If all backends are rate-limited, fail fast with a clear notification showing the earliest cooldown reset timestamp.

---

## 4. Real-Time Observable Activity Streaming (v1.1.0 Roadmap)

### Problem Definition:
Displaying a generic elapsed-time ticker like `Processing with Codex CLI... (45s elapsed)` provides poor user feedback and looks like an unresponsive process. The user must clearly see what subagents are doing and thinking in real time.

### Architecture (`codex exec --json` & Streaming Decoder):
```text
CLI Process (stdout) ───► JSONL Stream Decoder ───► Event Normalizer ───► MCP notifications/progress
                                                                     ├──► Final Output Accumulator
```

1. **JSONL Event Normalization:**
   Run Codex with `--json` and stream newline-delimited JSON events:
   - `thread.started`: Captures `thread_id` immediately.
   - `turn.started`: Emits `[Codex] Initializing task analysis...`.
   - `item.started`: Emits real-time activities:
     - `command`: `[Codex] Running git diff...`
     - `file_search` / `read_file`: `[Codex] Reading src/router.js...`
     - `thought` / `summary`: `[Codex] Analyzing architecture & potential edge cases...`
   - `item.completed`: Emits step completion.
2. **MCP Progress Protocol Adherence:**
   - Increments an indeterminate progress counter (`observedUpdates++`) while omitting `total`.
   - Throttles progress notifications to 2–4 updates per second to avoid UI saturations.
   - Incorporates an idle heartbeat (`[Codex] Reasoning in progress... (15s since last action)`) when long model generation produces no interim tool events.
3. **Response Isolation:**
   - Raw JSONL streams are kept off stdout of the MCP server.
   - Final responses are extracted cleanly from completed agent messages or `-o <file>`.

---

## 5. Multi-Turn Session & Thread Persistence (v1.1.0 Roadmap)

### Problem Definition:
Spawning a brand new CLI process on every MCP request causes the agent to lose conversation context, forcing it to repeatedly re-index and re-read the repository during iterative code reviews.

### Architecture & Session Lifecycle:
1. **Opaque Session Handle (`session_handle`):**
   - MCP tool responses return an opaque `session_handle` (e.g. `omni_sess_a8f91c`).
   - Subsequent calls accept `session_handle: "omni_sess_a8f91c"`.
2. **Backend Thread Mapping:**
   - `session_handle` maps to Codex `thread_id` (or Claude session UUID).
   - In Codex: Spawns `codex exec resume <thread_id> -` via stdin.
   - In Claude: Spawns `claude --resume <session_id>`.
3. **Lifecycle Management:**
   - One active turn per thread to prevent race conditions.
   - Sandboxing and read-only policies are re-applied strictly on every resumed invocation.
   - Expired or completed sessions can be explicitly terminated using tool `omniagent_close_session`.

---

## 6. Zero-Friction Bug & Issue Reporting (v1.1.0 Roadmap)

### Problem Definition:
Users encounter errors or environment quirks and want to report bugs directly to GitHub (`nyupyu/omniagent-cli-mcp`), but the MCP server cannot authenticate to GitHub on behalf of the user without credentials.

### Dual-Channel Architecture:
1. **Channel A: Pre-Filled Issue URL (Zero-Auth / 1-Click Browser Workflow — Default):**
   - Constructs a standardized, pre-filled URL:
     `https://github.com/nyupyu/omniagent-cli-mcp/issues/new?title=...&body=...`
   - Formats a comprehensive, sanitized markdown bug report:
     - OmniAgent version, Node.js version, OS platform & architecture.
     - Installed CLI versions & diagnostic summary from `omniagent_doctor`.
     - Error category and sanitized stack trace.
     - **Strict Privacy Sanitization:** Strips all personal tokens (`*_API_KEY`, Bearer tokens), user home paths, and repository code.
   - User reviews the pre-filled issue in their browser and clicks "Submit new issue".
2. **Channel B: GitHub CLI Integration (`gh issue create` — Opt-In):**
   - Asynchronously probes `gh auth status`.
   - If authenticated, prompts the user: *"Would you like OmniAgent to submit this issue directly via GitHub CLI (`gh issue create`)?"*
   - Upon explicit consent, executes `gh issue create --repo nyupyu/omniagent-cli-mcp --title ... --body-file -` via stdin without opening external shells.

---

## 7. Modular Codebase Architecture (`src/`)

```text
omniagent-cli-mcp/
├── index.js                  # Main MCP server (tool registration, lifecycle, handlers)
├── src/
│   ├── config.js             # ~/.omniagent/config.json management & strict schema validation
│   ├── quota.js              # 5-hour limit tracking, cooldown sanitization & smart_quota selection
│   ├── policy.js             # Security policy, read-only guardrails & model governance
│   ├── process.js            # Cross-platform process supervisor (stdin piping, taskkill/SIGTERM)
│   ├── git.js                # Git scope collection (collectGitScope) & ref sanitization (sanitizeGitRef)
│   ├── progress.js           # MCP progress notifications (indeterminate observedUpdates)
│   ├── doctor.js             # omniagent_doctor: zero-download diagnostics for Codex, Claude, Gemini
│   ├── router.js             # Multi-agent router enforcing privacy guards & onboarding
│   ├── session.js            # [v1.1.0] Session handle mapping & thread resumption manager
│   ├── issue.js              # [v1.1.0] Sanitized GitHub issue URL & gh CLI reporting
│   └── adapters/
│       ├── codex.js          # OpenAI Codex CLI adapter (exec, review, status, JSONL streaming)
│       ├── claude.js         # Claude Code CLI adapter (--tools Read,Glob,Grep, streaming)
│       └── gemini.js         # Gemini CLI prober (version, auth, config)
├── test/
│   ├── config.test.js        # Config schema, test isolation, quota cooldowns & smart routing
│   ├── git.test.js           # Git scope parsing & injection sanitization tests
│   ├── doctor.test.js        # Doctor diagnostic engine & CLI probe tests
│   └── policy.test.js        # Model governance (astra/opus) & workspace path verification
├── .github/
│   └── workflows/
│       └── ci.yml            # Multi-OS CI matrix (Ubuntu, macOS, Windows on Node 20 & 22)
├── package.json              # files: ["index.js", "src/", "assets/", "README.md", "LICENSE"]
└── README.md                 # Documentation, badges, and quick-start reference
```

---

## 8. MCP Tool Catalog

### Primary Multi-Agent Tools:
1. **`omniagent_doctor`** — Comprehensive multi-agent diagnostics (CLI availability, versions, paths, auth profiles, and non-intrusive install instructions).
2. **`omniagent_review`** — Cross-model code review (`backend: "auto" | "codex" | "claude" | "smart_quota"`, with session continuation).
3. **`omniagent_consult`** — Cross-model architectural consultation and second opinion.
4. **`omniagent_analyze`** — Cross-model codebase and dependency analysis in read-only mode.
5. **`omniagent_set_default`** — Persistently sets the default backend in `~/.omniagent/config.json`.
6. **`omniagent_quota_status`** — Fast inspection of active rate limits and cooldown statuses.
7. **`omniagent_report_bug`** — [v1.1.0] Generates sanitized GitHub issue report URL / submits via GitHub CLI with user consent.
8. **`omniagent_close_session`** — [v1.1.0] Closes and clears active multi-turn session handle.

### Legacy Codex Tools (100% Backward Compatible):
- `codex_status` $\rightarrow$ `src/adapters/codex.js:status`
- `codex_review_code` $\rightarrow$ `src/adapters/codex.js:review`
- `codex_consult` $\rightarrow$ `src/adapters/codex.js:consult`
- `codex_analyze` $\rightarrow$ `src/adapters/codex.js:analyze`
- `codex_debug_error` $\rightarrow$ `src/adapters/codex.js:debug`
- `codex_implement` $\rightarrow$ `src/adapters/codex.js:implement`

---

## 9. Execution Checklist

- [x] **Step 1: Core utility modules** (`src/process.js`, `src/git.js`, `src/progress.js`, `src/policy.js`).
- [x] **Step 2: Backend adapters** (`src/adapters/codex.js`, `src/adapters/claude.js`, `src/adapters/gemini.js`).
- [x] **Step 3: Diagnostic engine** (`src/doctor.js`).
- [x] **Step 4: Unified server integration** (`index.js`) maintaining 100% legacy schema compatibility.
- [x] **Step 5: Package configuration** (`package.json`, `files: ["index.js", "src/", ...]`, test script).
- [x] **Step 6: Unit & contract tests** (`test/*.test.js` — 9/9 passing).
- [x] **Step 7: GitHub Actions CI workflow** (`.github/workflows/ci.yml`).
- [x] **Step 8: Persistent onboarding & config schema** (`src/config.js`, tool `omniagent_set_default`).
- [x] **Step 9: Quota tracking & smart routing** (`src/quota.js`, tool `omniagent_quota_status`).
- [x] **Step 10: Maker-Checker audit verification & clean sign-off with Codex Sol**.
- [ ] **Step 11: Release v1.0.0 (Git commit, tag v1.0.0, push to remote, npm publish)**.
- [ ] **Step 12: v1.1.0 Milestone: JSONL thought/activity streaming (`--json`), multi-turn session persistence (`resume`), and GitHub bug reporting**.
