import { AdapterProbeResult, ExecutionResult, ExecutionOptions, CliAdapter } from '../types/adapter.types.js';

export { CliAdapter };

export function truncateToByteLength(str: string, maxBytes: number, suffix = '...[truncated]'): string {
  const buf = Buffer.from(str, 'utf8');
  if (buf.length <= maxBytes) return str;
  const suffixBuf = Buffer.from(suffix, 'utf8');
  if (suffixBuf.length >= maxBytes) {
    return suffixBuf.subarray(0, maxBytes).toString('utf8');
  }
  const targetBytes = maxBytes - suffixBuf.length;
  let truncatedBuf = buf.subarray(0, targetBytes);
  while (truncatedBuf.length > 0) {
    try {
      const decoded = truncatedBuf.toString('utf8');
      if (Buffer.byteLength(decoded, 'utf8') === truncatedBuf.length) {
        return decoded + suffix;
      }
    } catch (_) {}
    truncatedBuf = truncatedBuf.subarray(0, truncatedBuf.length - 1);
  }
  return suffix;
}
