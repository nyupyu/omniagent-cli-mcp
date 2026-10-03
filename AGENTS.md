# SynAgent — Agent & Contributor Guidelines (`AGENTS.md`)

This repository defines strict engineering practices, Git branching workflows, quality gates, and architectural conventions for all AI coding agents (Antigravity, Cursor, Codex, Claude Code) and human contributors.

---

## 🧭 Quick Rule Index (`.agents/rules/`)

Detailed, modular instructions are maintained in [`.agents/rules/`](./.agents/rules/):

1. **[Git Workflow & Branch Protection](./.agents/rules/git-workflow.md)**:
   - **Direct pushes to `main` are strictly forbidden.**
   - All work happens on dedicated branches (`feat/*`, `fix/*`, `release/*`, `chore/*`).
   - Merge exclusively via **Pull Requests with Squash and Merge** (`gh pr merge --squash --delete-branch`).
   - `main` must strictly remain 100% green across all 6 CI matrix jobs.

2. **[Local Quality Verification Gate](./.agents/rules/quality-gate.md)**:
   - Run the 4-step local gate before opening a PR:
     1. `npm run typecheck` — 0 TypeScript errors.
     2. `npm run build` — Clean standalone bundle (`dist/index.cjs`).
     3. `npm test` — 100% pass rate (`tsx --test`).
     4. `npm pack --dry-run` — Verify bundle assets.

3. **[Maker–Checker Separation](./.agents/rules/maker-checker.md)**:
   - Primary author (Antigravity / Maker) writes code.
   - Independent auditor (Codex Sol / Checker) verifies changes in read-only sandbox before merging.
   - All P1 and P2 findings must be remediated before PR merge.

4. **[Cross-Platform & CI Matrix Guardrails](./.agents/rules/cross-platform.md)**:
   - Zero-argument `tsx --test` (no shell glob assumptions).
   - POSIX process group teardown (`process.kill(-proc.pid)`).
   - Buffer bounding (`maxBufferBytes: 512KB`).

5. **[Security & Read-Only Governance](./.agents/rules/security.md)**:
   - Enforce `--sandbox read-only` on Codex and `--permission-mode dontAsk` on Claude.
   - High-tier models (`astra`, `opus`) strictly require prior user confirmation (`user_confirmed: true`).
   - Automated secret redaction for API keys, tokens, and home paths.
