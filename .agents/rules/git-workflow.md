# Git Workflow & Branch Protection

## 1. Strict `main` Branch Protection
* **Direct pushes to `main` are strictly forbidden.** Never commit or push directly to `main`.
* The `main` branch represents stable, production-ready releases.
* Every commit on `main` MUST have passed full continuous integration (CI) with 100% green status across all matrix jobs (6/6).

## 2. Branching Convention
All development must occur on dedicated branches created from `main`:
* `feat/<feature-name>` — New features, adapters, or capabilities.
* `fix/<bug-description>` — Bug fixes, error handling, edge cases.
* `release/v<version>` — Release candidate preparation, version bumps, final validation.
* `chore/<task-name>` — Toolchain updates, documentation, refactorings.

## 3. Pull Requests & Squash Merge
* All branches must be merged into `main` exclusively via **Pull Requests (PR)** using GitHub CLI:
  ```bash
  gh pr create --base main --head <branch> --title "..." --body "..."
  ```
* PRs must be merged using **Squash and Merge**:
  ```bash
  gh pr merge <pr_number> --squash --delete-branch
  ```
* Squash commit messages must follow Conventional Commits format:
  ```text
  <type>(<scope>): <clear, concise description>
  ```
