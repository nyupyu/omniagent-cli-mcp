import { inspectQuotas } from '../services/quota.service.js';
import { TOOL_NAMES, getLegacyAliasDescription } from '../constants/index.js';

export const quotaToolDefinition = {
  name: TOOL_NAMES.QUOTA_STATUS,
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

export const legacyQuotaToolDefinition = {
  ...quotaToolDefinition,
  name: TOOL_NAMES.LEGACY_QUOTA_STATUS,
  description: getLegacyAliasDescription(TOOL_NAMES.QUOTA_STATUS),
};

export async function handleQuotaStatus(args: any) {
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

export const handleOmniagentQuotaStatus = handleQuotaStatus;
