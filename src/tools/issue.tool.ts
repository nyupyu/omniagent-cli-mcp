import { generateBugReport } from '../services/issue.service.js';
import { runDoctor } from '../services/doctor.service.js';

export const reportBugToolDefinition = {
  name: 'omniagent_report_bug',
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

export async function handleOmniagentReportBug(args: any) {
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
