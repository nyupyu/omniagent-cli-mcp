import { runCommand } from './process.service.js';

export interface GitScopeInfo {
  type: 'uncommitted' | 'staged' | 'range' | 'commit' | 'branch';
  label: string;
  diff: string;
  nativeArgs: string[] | null;
}

export async function runGit(
  args: string[],
  cwd = process.cwd(),
  abortSignal: AbortSignal | null = null,
  timeoutMs = 15000
): Promise<string> {
  const result = await runCommand('git', args, {
    cwd,
    abortSignal,
    timeoutMs,
    maxBufferBytes: 4 * 1024 * 1024,
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `Git exited with code ${result.exitCode}`);
  }
  if (result.isTruncated || result.stdout.includes('...[stdout truncated: buffer limit reached]')) {
    return result.stdout + '\n\n[Warning: Git diff exceeded buffer limit (4MB) and was truncated.]';
  }
  return result.stdout;
}

export function sanitizeGitRef(ref: unknown): string {
  if (typeof ref !== 'string') {
    throw new Error('Validation Error: Git ref must be a string.');
  }
  const clean = ref.trim();
  if (!clean || clean.startsWith('-')) {
    throw new Error(`Validation Error: Git ref cannot be empty or start with a dash ('${ref}').`);
  }
  if (/[\s;`$|<>&"'\0]/.test(clean)) {
    throw new Error(`Validation Error: invalid characters in Git ref '${ref}'.`);
  }
  return clean;
}

export async function collectGitScope(
  rawScope?: string | null,
  workspaceCwd = process.cwd(),
  abortSignal: AbortSignal | null = null
): Promise<GitScopeInfo> {
  const scope = typeof rawScope === 'string' && rawScope.trim() ? rawScope.trim() : 'uncommitted';

  if (scope !== 'uncommitted' && scope.startsWith('-')) {
    throw new Error('Validation Error: scope cannot start with a dash or flag.');
  }

  // 1. Uncommitted working changes (Default: staged + unstaged + untracked)
  if (scope === 'uncommitted' || scope === 'working' || scope === 'all') {
    let hasHead = true;
    try {
      await runGit(['rev-parse', '--verify', 'HEAD'], workspaceCwd, abortSignal);
    } catch (_) {
      hasHead = false;
    }

    const unstaged = await runGit(['diff', '--no-ext-diff', '--no-textconv', '--'], workspaceCwd, abortSignal);
    const staged = hasHead
      ? await runGit(['diff', '--no-ext-diff', '--no-textconv', '--cached', 'HEAD', '--'], workspaceCwd, abortSignal)
      : await runGit(['diff', '--no-ext-diff', '--no-textconv', '--cached', '--'], workspaceCwd, abortSignal);

    let diff = [staged.trim(), unstaged.trim()].filter(Boolean).join('\n\n');
    if (!diff && hasHead) {
      diff = (await runGit(['diff', '--no-ext-diff', '--no-textconv', 'HEAD', '--'], workspaceCwd, abortSignal)).trim();
    }

    let repoRoot = workspaceCwd;
    try {
      repoRoot = (await runGit(['rev-parse', '--show-toplevel'], workspaceCwd, abortSignal)).trim() || workspaceCwd;
    } catch (_) {}

    const untracked = (await runGit(['ls-files', '--others', '--exclude-standard'], repoRoot, abortSignal)).trim();
    if (untracked) {
      diff += `\n\n--- UNTRACKED FILES ---\n${untracked}\n`;
    }

    return {
      type: 'uncommitted',
      label: 'Uncommitted working changes (staged, unstaged, untracked)',
      diff: diff.trim(),
      nativeArgs: ['--uncommitted'],
    };
  }

  // 2. Staged index changes only
  if (scope === 'staged' || scope === 'cached' || scope === 'index') {
    const diff = await runGit(['diff', '--no-ext-diff', '--no-textconv', '--cached', '--'], workspaceCwd, abortSignal);
    return {
      type: 'staged',
      label: 'Staged index changes',
      diff: diff.trim(),
      nativeArgs: null,
    };
  }

  // 3. Revision ranges (e.g. main..feature, v1.0.0...v2.0.0, HEAD~3..HEAD)
  if (scope.includes('..')) {
    const cleanRange = scope.replace(/^(range|compare):/i, '').trim();
    if (cleanRange.startsWith('-')) {
      throw new Error(`Validation Error: range cannot start with a dash ('${scope}').`);
    }
    const parts = cleanRange.split('..').filter(Boolean);
    if (parts.length === 0 || parts.length > 2) {
      throw new Error(`Validation Error: invalid revision range '${scope}'.`);
    }
    for (const p of parts) {
      sanitizeGitRef(p);
    }
    const diff = await runGit(['diff', '--no-ext-diff', '--no-textconv', cleanRange, '--'], workspaceCwd, abortSignal);
    return {
      type: 'range',
      label: `Revision range (${cleanRange})`,
      diff: diff.trim(),
      nativeArgs: null,
    };
  }

  // 4. Specific commit (SHA hex, commit:prefix, or relative revision)
  const commitMatch = scope.match(/^commit:([0-9a-f]{7,40})$/i) || scope.match(/^([0-9a-f]{7,40})$/i);
  if (commitMatch) {
    const sha = commitMatch[1];
    const diff = await runGit(['show', '--no-ext-diff', '--no-textconv', sha, '--'], workspaceCwd, abortSignal);
    return {
      type: 'commit',
      label: `Commit ${sha}`,
      diff: diff.trim(),
      nativeArgs: ['--commit', sha],
    };
  }

  if (scope.startsWith('commit:') || /^HEAD([~^]\d*)*$/i.test(scope)) {
    const rawRev = scope.replace(/^commit:/i, '');
    const rev = sanitizeGitRef(rawRev);
    const diff = await runGit(['show', '--no-ext-diff', '--no-textconv', rev, '--'], workspaceCwd, abortSignal);
    return {
      type: 'commit',
      label: `Revision ${rev}`,
      diff: diff.trim(),
      nativeArgs: null,
    };
  }

  // 5. Branch comparison / PR diff against base (e.g. main, origin/main, feature/auth, base:main)
  const rawBranch = scope.replace(/^(base|branch):/i, '');
  const branchName = sanitizeGitRef(rawBranch);
  const diff = await runGit(['diff', '--no-ext-diff', '--no-textconv', `${branchName}...HEAD`, '--'], workspaceCwd, abortSignal);
  return {
    type: 'branch',
    label: `Branch comparison against ${branchName} (${branchName}...HEAD)`,
    diff: diff.trim(),
    nativeArgs: null,
  };
}
