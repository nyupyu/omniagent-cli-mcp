# Security & Read-Only Governance

## 1. Read-Only Sandboxing
All multi-agent review, diagnostic, consultation, and codebase analysis operations must strictly enforce:
* `--sandbox read-only` on OpenAI Codex.
* `--permission-mode dontAsk --tools Read,Glob,Grep` on Claude Code.

## 2. High-Tier Model Governance
Models classified as top-tier reasoning engines (`astra` in Codex, `claude-3-opus` in Claude) strictly require prior user confirmation via an interactive modal (`ask_question`). Never pass `user_confirmed: true` without explicit user consent.

## 3. Secret Redaction
Any telemetry, bug reporting, or error output must redact API keys, Bearer tokens, AWS secrets, and user home directory paths.
