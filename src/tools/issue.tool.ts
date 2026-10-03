import { generateBugReport } from '../services/issue.service.js';
import { runDoctor } from '../services/doctor.service.js';
import { TOOL_NAMES, getLegacyAliasDescription } from '../constants/index.js';

export const reportBugToolDefinition = {
  name: TOOL_NAMES.REPORT_BUG,
  description:
    'Prepare a privacy-sanitized bug report and pre-filled GitHub issue URL to submit feedback or report issues to the maintainers.',
  inputSchema: {
    type: 'object',
    properties: {
      error_message: {
        type: 'string',
        description: 'Optional error description or stack trace to include in the bug report.',
      },
      context: {
        type: 'string',
        description: 'Optional description of what you were doing when the issue occurred.',
      },
    },
  },
};

export const legacyReportBugToolDefinition = {
  ...reportBugToolDefinition,
  name: TOOL_NAMES.LEGACY_REPORT_BUG,
  description: getLegacyAliasDescription(TOOL_NAMES.REPORT_BUG),
};

export async function handleReportBug(args: any) {
  const doctorReport = await runDoctor().catch(() => null);
  const report = generateBugReport({
    errorMessage: args.error_message,
    context: args.context,
    doctorReport,
  });
  return {
    content: [
      {
        type: 'text',
        text: report.prompt,
      },
    ],
  };
}

export const handleOmniagentReportBug = handleReportBug;
