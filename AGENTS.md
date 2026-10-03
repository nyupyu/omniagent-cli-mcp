# OmniAgent MCP — Agent & Contributor Guidelines (`AGENTS.md`)

This file defines the mandatory engineering practices, Git branching workflows, quality gates, and architectural conventions for all AI coding agents (Antigravity, Cursor, Codex, Claude Code) and human contributors working in this repository.

---

## 1. Git Workflow & Branch Protection (MANDATORY)

### 1.1 Strict `main` Branch Protection
* **Direct pushes to `main` are strictly forbidden.** Never commit or push directly to `main`.
* The `main` branch represents stable, production-ready releases. Every commit on `main` MUST have passed full continuous integration (CI) with 100% green status across all matrix jobs (6/6).

### 1.2 Branching Convention
All development must occur on dedicated branches created from `main`:
* `feat/<feature-name>` — New features, adapters, or capabilities.
* `fix/<bug-description>` — Bug fixes, error handling, edge cases.
* `release/v<version>` — Release candidate preparation, version bumps, final validation.
* `chore/<task-name>` — Toolchain updates, documentation, refactorings.

### 1.3 Pull Requests & Squash Merge
* All branches must be merged into `main` exclusively via **Pull Requests (PR)**.
* PRs must be merged using **Squash and Merge** (`gh pr merge --squash --delete-branch`).
* Squash commit messages must follow Conventional Commits format:
  ```text
  <type>(<scope>): <clear, concise description>
  ```
  *Examples:*
  - `feat(adapters): add persistent session handling for Claude Code CLI`
  - `fix(process): enforce POSIX process group termination on exit`
  - `release: v1.0.0-rc.1 modular TypeScript architecture and audit hardenings`

---

## 2. Local Quality Verification Gate (Pre-Push & Pre-PR)

Before pushing any branch or opening a Pull Request, the agent MUST run and verify the following 4-step local quality gate:

1. **Strict Typecheck:**
   ```bash
   npm run typecheck
   ```
   *Requirement:* Zero TypeScript errors (`tsc --noEmit`).

2. **Clean Fast Bundling:**
   ```bash
   npm run build
   ```
   *Requirement:* `tsdown` completes under 100ms producing a standalone `dist/index.cjs` bundle with valid source maps.

3. **Automated Test Suite:**
   ```bash
   npm test
   ```
   *Requirement:* 100% test pass rate across all suites using native `tsx --test`.

4. **Package Bundle Integrity:**
   ```bash
   npm pack --dry-run
   ```
   *Requirement:* Tarball contents strictly include required production assets (`dist/`, `index.js`, `src/`, `assets/`, `README.md`, `LICENSE`) without unneeded development artifacts or node_modules.

---

## 3. Maker–Checker Separation & Automated Auditing

OmniAgent enforces the **Maker–Checker (Builder–Auditor)** paradigm:

* **Maker (Authoring Agent — Antigravity / Primary Assistant):**
  - Authoring TypeScript code, modifying schemas, managing tests, handling Git lifecycle.
* **Checker (Independent Auditor — Codex Sol / Claude Code):**
  - Before merging significant architectural changes or creating Release Candidates, invoke `omniagent_review` or `codex_review_code` in read-only sandbox mode against the working diff.
  - All findings classified as **P1 (Critical / Security / Correctness)** and **P2 (Robustness / Resource Leaks / Edge Cases)** must be remediated before the PR is merged into `main`.

---

## 4. Cross-Platform & CI Matrix Guardrails

OmniAgent is tested and supported across a 6-job matrix:
* **Operating Systems:** Ubuntu (`ubuntu-latest`), macOS (`macos-latest`), Windows (`windows-latest`).
* **Node.js LTS Versions:** Node 20.x and Node 22.x.

### Rules for Cross-Platform Reliability:
1. **No Shell Glob Assumptions:** Never hardcode file globs (e.g. `test/*.test.js`) in npm scripts, as Windows `cmd.exe` does not expand globs and Node 20's test runner treats them literally. Use zero-argument `tsx --test` for cross-platform test discovery.
2. **Process Tree Teardown:**
   - On POSIX: Spawn with `detached: true` and terminate with `process.kill(-proc.pid, 'SIGTERM')` to cleanly kill child sub-trees.
   - On Windows: Use process termination with stream destruction (`proc.stdin/stdout/stderr.destroy()`).
3. **Memory Limits & Stream Safety:** Always enforce `maxBufferBytes` (e.g. 512 KB in `runCommand`, 4 MB in `runGit`) to prevent memory exhaustion from runaway CLI outputs.

---

## 5. Security & Read-Only Governance

1. **Read-Only Sandboxing:** All multi-agent review, diagnostic, consultation, and codebase analysis operations must strictly enforce `--sandbox read-only` (Codex) and `--permission-mode dontAsk` (Claude).
2. **High-Tier Model Governance:** Models classified as top-tier reasoning engines (`astra` in Codex, `claude-3-opus` in Claude) strictly require prior user confirmation via an interactive modal (`ask_question`). Never pass `user_confirmed: true` without explicit user consent.
3. **Secret Redaction:** Any telemetry, bug reporting, or error output must redact API keys, Bearer tokens, AWS secrets, and user home directory paths.
