/**
 * Returns a human-readable stage description based on elapsed time and task type.
 */
export function getProgressStage(elapsed: number, type = 'general', _backend = 'Agent'): string {
  let stage = 'Active';
  if (type === 'review') {
    if (elapsed < 6) stage = 'Collecting git diff & initializing sandbox';
    else if (elapsed < 18) stage = 'Analyzing code changes & AST impact';
    else if (elapsed < 40) stage = 'Deep reasoning & security audit';
    else if (elapsed < 75) stage = 'Evaluating edge cases & test regressions';
    else stage = 'Formulating final code review findings';
  } else {
    if (elapsed < 6) stage = 'Initializing CLI session & workspace context';
    else if (elapsed < 18) stage = 'Analyzing problem & specifications';
    else if (elapsed < 40) stage = 'Reasoning deeply & exploring solutions';
    else if (elapsed < 75) stage = 'Verifying architecture & edge cases';
    else stage = 'Synthesizing recommendations';
  }
  return `${stage} (${elapsed}s elapsed)`;
}

export type ProgressCallback = (message: string, progress?: number | null, total?: number | null) => void;

/**
 * Creates an MCP-compliant progress reporter supporting indeterminate updates.
 */
export function createProgressReporter(server: any, progressToken: string | number | undefined | null): ProgressCallback {
  let observedUpdates = 0;

  return function reportProgress(messageOrInfo: any, progress: number | null = null, total: number | null = null): void {
    if (progressToken == null) return;

    let message: string;
    let explicitProgress = progress;

    if (typeof messageOrInfo === 'string') {
      message = messageOrInfo;
    } else if (messageOrInfo && typeof messageOrInfo === 'object') {
      message = String(messageOrInfo.message || '');
      if (typeof messageOrInfo.percent === 'number') {
        explicitProgress = messageOrInfo.percent;
      }
    } else {
      message = String(messageOrInfo || '');
    }

    observedUpdates++;
    const params: any = {
      progressToken,
      progress: typeof explicitProgress === 'number' ? explicitProgress : observedUpdates,
      message,
    };

    if (typeof total === 'number') {
      params.total = total;
    }

    server
      ?.notification({
        method: 'notifications/progress',
        params,
      })
      ?.catch(() => {});
  };
}
