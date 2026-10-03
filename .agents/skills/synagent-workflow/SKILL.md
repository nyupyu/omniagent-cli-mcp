---
name: synagent-workflow
description: Standard operating procedures for building, testing, auditing, and releasing SynAgent MCP server.
---

# SynAgent MCP Workflow Guide

Use this skill when developing, testing, or releasing SynAgent.

## Local Quality Gate
Always run before committing:
```bash
npm run typecheck
npm run build
npm test
npm pack --dry-run
```

## Branch & Release Flow
1. Create a dedicated branch: `git checkout -b feat/<name>` or `fix/<name>`.
2. Implement and test changes locally.
3. Open PR: `gh pr create --base main --head <branch>`.
4. Wait for green CI (6/6 jobs on Ubuntu, macOS, Windows across Node 20 & 22).
5. Merge with squash: `gh pr merge --squash --delete-branch`.
