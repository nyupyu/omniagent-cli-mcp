import os from 'os';
import { BugReportOptions, BugReportResult } from '../types/issue.types.js';

export const REPO_OWNER = 'nyupyu';
export const REPO_NAME = 'omniagent';
export const GITHUB_NEW_ISSUE_BASE = `https://github.com/${REPO_OWNER}/${REPO_NAME}/issues/new`;
export const MAX_RAW_INPUT_LENGTH = 4096;

export function safeSlice(str?: string | null, maxLength = 80): string {
  if (!str || typeof str !== 'string') return '';
  const chars = Array.from(str);
  if (chars.length <= maxLength) return str;
  return chars.slice(0, maxLength).join('') + '\n\n...[truncated]';
}

export function redactCodeBlocks(text?: string | null): string {
  if (!text || typeof text !== 'string') return '';
  const lines = text.split(/\r?\n/);
  const result: string[] = [];
  let inBlock = false;
  let fenceChar = '';
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inBlock) {
      const match = line.match(/^[ ]{0,3}(`{3,}|~{3,})/);
      if (match) {
        inBlock = true;
        fenceChar = match[1][0];
        fenceLen = match[1].length;
        result.push('[code block redacted for privacy]');
        continue;
      }
      result.push(line);
    } else {
      const closeMatch = line.match(/^[ ]{0,3}(`{3,}|~{3,})[ ]*$/);
      if (closeMatch && closeMatch[1][0] === fenceChar && closeMatch[1].length >= fenceLen) {
        inBlock = false;
        fenceChar = '';
        fenceLen = 0;
        continue;
      }
    }
  }
  return result.join('\n');
}

/**
 * Strips secrets, API keys, Bearer/Basic tokens, private keys, and user home directory paths.
 * Bound to MAX_RAW_INPUT_LENGTH with strictly linear non-backtracking pattern matching.
 */
export function sanitizeText(text?: string | null): string {
  if (!text || typeof text !== 'string') return '';

  // 1. Strip raw repository code blocks with CommonMark compliant fence parser
  let sanitized = redactCodeBlocks(text);
  sanitized = sanitized.replace(/diff --git [\s\S]*/g, '[git diff redacted for privacy]\n');
  sanitized = sanitized.replace(/--- a\/[\s\S]*?\+\+\+ b\/[\s\S]*/g, '[git diff redacted for privacy]\n');

  // 2. Bound raw input to prevent quadratic or regex denial-of-service
  sanitized = sanitized.length > MAX_RAW_INPUT_LENGTH ? sanitized.slice(0, MAX_RAW_INPUT_LENGTH) : sanitized;

  // 3. Mask home directory
  const home = os.homedir();
  if (home) {
    sanitized = sanitized.split(home).join('~');
    sanitized = sanitized.split(home.replace(/\\/g, '/')).join('~');
  }

  // 4. Mask private keys
  sanitized = sanitized.replace(/-----BEGIN [A-Z0-9 _-]+PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 _-]+PRIVATE KEY-----/gi, '-----BEGIN PRIVATE KEY-----\n***[REDACTED]***\n-----END PRIVATE KEY-----');

  // 5. Mask Authorization headers (Bearer, Basic, Token)
  sanitized = sanitized.replace(/Authorization\s*:\s*(Bearer|Basic|Token)\s+[^\s,;]+/gi, 'Authorization: $1 ***[REDACTED]***');
  sanitized = sanitized.replace(/Authorization\s*:\s*(?!Bearer|Basic|Token)[^\s,;]+/gi, 'Authorization: ***[REDACTED]***');
  sanitized = sanitized.replace(/\bBearer\s+[a-zA-Z0-9._~+/-]+=*/gi, 'Bearer ***[REDACTED]***');
  sanitized = sanitized.replace(/\bBasic\s+[a-zA-Z0-9+/=]{16,}/gi, 'Basic ***[REDACTED]***');

  // 6. Mask vendor-specific API tokens
  sanitized = sanitized.replace(/(?:sk-[a-zA-Z0-9_-]{20,})/g, 'sk-***[REDACTED]***');
  sanitized = sanitized.replace(/(?:AIza[0-9A-Za-z-_]{35})/g, 'AIza***[REDACTED]***');
  sanitized = sanitized.replace(/(?:ghp_[a-zA-Z0-9]{36})/g, 'ghp_***[REDACTED]***');
  sanitized = sanitized.replace(/(?:github_pat_[a-zA-Z0-9_]{80,})/g, 'github_pat_***[REDACTED]***');
  sanitized = sanitized.replace(/\b((?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16,20})\b/g, (_m, p) => p.slice(0, 4) + '***[REDACTED]***');
  sanitized = sanitized.replace(/\b(xox[baprs]-[a-zA-Z0-9-]+)\b/g, 'xox-***[REDACTED]***');

  // 7. Mask AWS secrets, access key IDs, and session tokens
  sanitized = sanitized.replace(/(aws_access_key_id|aws_secret_access_key|aws_session_token|aws_security_token)\s*[:=]\s*[^\s,;]+/gi, '$1=***[REDACTED]***');

  // 8. Mask quoted key-value credentials (e.g. {"password":"abc;def"}, 'api_key': "secret\"quoted")
  sanitized = sanitized.replace(
    /(["']?(?:api[_-]?key|token|secret|password|passwd|auth|access[_-]?key)["']?\s*[:=]\s*)(["'])(?:\\.|(?!\2)[^\\])*\2/gi,
    '$1$2***[REDACTED]***$2'
  );

  // 9. Mask unquoted key-value patterns (redacts entire token, avoiding any leak of semicolon-separated password suffixes)
  sanitized = sanitized.replace(
    /(["']?(?:api[_-]?key|token|secret|password|passwd|auth|access[_-]?key)["']?\s*[:=]\s*)(?!["'])([^"'\s,\r\n}{]+)/gi,
    '$1***[REDACTED]***'
  );

  // 10. Mask URL query parameters carrying credentials
  sanitized = sanitized.replace(/([?&](?:token|key|secret|apiKey)=)[^&\s]+/gi, '$1***[REDACTED]***');

  // 11. Mask credentials in URL userinfo with linear non-backtracking matching
  sanitized = sanitized.replace(/\b(https?|ftp|ssh|git):\/\/([^@\s\/?#]+)@/gi, '$1://***[REDACTED]***@');

  return sanitized;
}

/**
 * Builds a sanitized, pre-filled GitHub bug report URL and markdown preview.
 */
export function generateBugReport(options: BugReportOptions): BugReportResult {
  const { errorMessage, context, doctorReport = null } = options;
  try {
    const cleanError = sanitizeText(errorMessage || 'Unknown error occurred');
    const cleanContext = sanitizeText(context || 'Execution during MCP tool call');

    const firstLine = cleanError.split(/\r?\n/)[0] || 'Unknown error';
    const title = `[Bug]: ${safeSlice(firstLine, 80)}`;

    let doctorSummary = 'Not provided';
    if (doctorReport && doctorReport.backends) {
      doctorSummary = Object.entries(doctorReport.backends)
        .map(([id, b]: [string, any]) => `- **${b.name || id}**: ${b.installed ? `v${b.version}` : 'Not installed'}`)
        .join('\n');
    }

    const safeContext = safeSlice(cleanContext, 300);
    const safeDiag = safeSlice(cleanError, 800);

    const body = `### Description & Context
${safeContext}

### Error Diagnostic
\`\`\`text
${safeDiag}
\`\`\`

### Environment Details
- **OmniAgent MCP Version**: 1.0.0
- **Node.js**: ${process.version}
- **OS**: ${os.type()} ${os.release()} (${os.arch()})
- **Detected CLIs**:
${doctorSummary}

---
*Note: Best-effort automated redaction was applied. Please review the details above before submitting to ensure no sensitive or proprietary data is included.*
`;

    // Safely encode URL parameters
    let issueUrl: string;
    try {
      const encodedTitle = encodeURIComponent(title);
      const encodedBody = encodeURIComponent(body);
      issueUrl = `${GITHUB_NEW_ISSUE_BASE}?title=${encodedTitle}&body=${encodedBody}`;
    } catch (_) {
      issueUrl = GITHUB_NEW_ISSUE_BASE;
    }

    return {
      title,
      body,
      issueUrl,
      prompt:
        `Would you like to report this issue to GitHub to help improve OmniAgent?\n\n` +
        `Click the link below to review and submit the pre-filled issue in your browser (no tokens or extra login needed):\n\n` +
        `**[Submit Bug Report on GitHub](${issueUrl})**\n\n` +
        `<details><summary>Preview Sanitized Report</summary>\n\n${body}\n</details>`,
    };
  } catch (_err) {
    return {
      title: '[Bug]: Unhandled Error',
      body: String(errorMessage || ''),
      issueUrl: GITHUB_NEW_ISSUE_BASE,
      prompt:
        `An unexpected error occurred. You can submit feedback or a bug report here:\n\n` +
        `**[Submit Bug Report on GitHub](${GITHUB_NEW_ISSUE_BASE})**`,
    };
  }
}
