'use strict';

/**
 * Returns a human-readable stage description based on elapsed time and task type.
 */
function getProgressStage(elapsed, type = 'general', backend = 'Agent') {
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

/**
 * Creates an MCP-compliant progress reporter supporting indeterminate updates.
 */
function createProgressReporter(server, progressToken) {
  let observedUpdates = 0;

  return function reportProgress(message, progress = null, total = null) {
    if (progressToken == null) return;

    observedUpdates++;
    const params = {
      progressToken,
      progress: typeof progress === 'number' ? progress : observedUpdates,
      message,
    };

    if (typeof total === 'number') {
      params.total = total;
    }

    server
      .notification({
        method: 'notifications/progress',
        params,
      })
      .catch(() => {});
  };
}

module.exports = {
  getProgressStage,
  createProgressReporter,
};
