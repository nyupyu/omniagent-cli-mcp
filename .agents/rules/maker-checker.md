# Maker–Checker Separation & Automated Auditing

OmniAgent enforces the **Maker–Checker (Builder–Auditor)** paradigm:

## 1. Roles
* **Maker (Authoring Agent — Antigravity / Primary Assistant):**
  - Authoring TypeScript code, modifying schemas, managing tests, handling Git lifecycle.
* **Checker (Independent Auditor — Codex Sol / Claude Code):**
  - Independent code verification, security analysis, edge-case probing.

## 2. Mandatory Audit Protocol
* Before merging significant architectural changes or creating Release Candidates:
  - Invoke `omniagent_review` or `codex_review_code` in read-only sandbox mode against the working diff.
* **Severity Threshold:**
  - **P1 (Critical / Security / Correctness)**: MUST be remediated immediately.
  - **P2 (Robustness / Resource Leaks / Edge Cases)**: MUST be remediated before the PR is merged into `main`.
