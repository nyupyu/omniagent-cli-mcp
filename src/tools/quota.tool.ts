import { inspectQuotas } from '../services/quota.service.js';

export const quotaToolDefinition = {
  name: 'omniagent_quota_status',
  description:
    'Check current 5-hour rolling limit headroom, usage percentages, and reset timestamps across active CLI backends without consuming generation tokens.',
  inputSchema: {
    type: 'object',
    properties: {
      refresh: {
        type: 'boolean',
        description: 'Force live refresh instead of reading cached telemetry.',
      },
    },
  },
};

export async function handleOmniagentQuotaStatus(args: any) {
  const quotas = await inspectQuotas(args.refresh === true);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(quotas, null, 2),
      },
    ],
  };
}
