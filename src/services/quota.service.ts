import fs from 'fs';
import path from 'path';
import os from 'os';
import * as codexAdapter from '../adapters/codex.adapter.js';
import * as claudeAdapter from '../adapters/claude.adapter.js';
import { loadConfig } from './config.service.js';
import { QuotaReport, QuotaCacheRecord } from '../types/quota.types.js';

export function getQuotaCacheFile(): string {
  return process.env.OMNIAGENT_QUOTA_CACHE || path.join(os.homedir(), '.omniagent', 'quota-cache.json');
}

export const QUOTA_CACHE_TTL_MS = 60 * 1000; // 60s cache TTL

/**
 * Sanitizes cached entries by immediately clearing expired rate-limiting cooldowns.
 */
export function sanitizeCacheData(data: any): QuotaReport {
  if (!data || typeof data !== 'object') return {};
  const now = Date.now();
  for (const id of Object.keys(data)) {
    const entry = data[id];
    if (entry && entry.status === 'rate_limited') {
      const expiry = entry.cooldownUntil || entry.resetsAt;
      if (!expiry || now >= new Date(expiry).getTime()) {
        entry.status = 'operational';
        entry.cooldownUntil = null;
        entry.resetsAt = null;
        entry.cooldownReason = null;
      }
    }
  }
  return data;
}

/**
 * Reads cached quota records from disk with active cooldown validation.
 */
export function readQuotaCache(): QuotaCacheRecord | null {
  const cacheFile = getQuotaCacheFile();
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (cached && cached.data) {
        cached.data = sanitizeCacheData(cached.data);
      }
      return cached;
    } catch (_) {}
  }
  return null;
}

/**
 * Writes quota records to disk.
 */
export function writeQuotaCache(data: QuotaReport): void {
  const cacheFile = getQuotaCacheFile();
  try {
    const dir = path.dirname(cacheFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({ timestamp: Date.now(), data }, null, 2),
      'utf8'
    );
  } catch (_) {}
}

/**
 * Inspects rate limits for active backends without burning generation tokens.
 * Quotas remain null unless recorded via real telemetry or runtime rate-limit events.
 */
export async function inspectQuotas(forceRefresh = false, probesOverride: any = null): Promise<QuotaReport> {
  const rawCache = readQuotaCache();
  const cachedData = rawCache?.data || {};
  const hasAllBackends = !!(cachedData.codex && cachedData.claude);
  const isFresh = rawCache && hasAllBackends && Date.now() - rawCache.timestamp < QUOTA_CACHE_TTL_MS;

  if (!forceRefresh && isFresh) {
    return cachedData;
  }

  const [codexProbe, claudeProbe] = probesOverride
    ? [probesOverride.codex, probesOverride.claude]
    : await Promise.all([codexAdapter.probe(), claudeAdapter.probe()]);

  const result: QuotaReport = {
    codex: {
      installed: !!codexProbe?.installed,
      status: codexProbe?.installed ? 'operational' : 'uninstalled',
      window: '5h',
      usedPercent: null,
      resetsAt: null,
      cooldownUntil: null,
      headroomPercent: null,
      measured: false,
    },
    claude: {
      installed: !!claudeProbe?.installed,
      status: claudeProbe?.installed ? 'operational' : 'uninstalled',
      window: '5h',
      usedPercent: null,
      resetsAt: null,
      cooldownUntil: null,
      headroomPercent: null,
      measured: false,
    },
  };

  // Re-read latest cache to avoid erasing cooldowns recorded concurrently during probe
  const latestCache = readQuotaCache()?.data || {};
  const now = Date.now();
  for (const id of ['codex', 'claude']) {
    const prior = latestCache[id] || cachedData[id];
    if (prior && prior.status === 'rate_limited') {
      const expiry = prior.cooldownUntil || prior.resetsAt;
      if (expiry && now < new Date(expiry).getTime()) {
        result[id].status = 'rate_limited';
        result[id].cooldownUntil = expiry;
        result[id].cooldownReason = prior.cooldownReason || 'Rate limit active';
      }
    }
  }

  writeQuotaCache(result);
  return result;
}

/**
 * Checks if an error output string indicates a rate limit or quota exhaustion.
 */
export function isRateLimitError(text?: string | null): boolean {
  if (!text || typeof text !== 'string') return false;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Partial output:') || trimmed.startsWith('Partial review:')) {
      break; // Stop parsing before generated model responses
    }

    if (/["'](?:status|code|statusCode)["']\s*:\s*(?:429(?!\d)|["']rate_limit_exceeded["'])/i.test(trimmed)) {
      return true;
    }

    if (/\b(?:http\s*status\s*[:=]?\s*|status\s*(?:code)?\s*[:=]?\s*|api\s*error\s*[:=]?\s*|http[\s/]+(?:1\.[01]|2(?:\.0)?)?\s*)429(?!\.[a-zA-Z0-9])(?:\s|$|[:,\r\n"]|too\s+many\s+requests)/i.test(trimmed)) {
      return true;
    }

    if (/\b429\s+too\s+many\s+requests\b/i.test(trimmed)) {
      return true;
    }

    if (/\b(?:rate[\s_-]?limit\s*(?:exceeded|reached)|usage\s*limit\s*reached|hit\s*(?:your\s*)?usage\s*limit)\b/i.test(trimmed)) {
      return true;
    }
    if (/\b(?:exceeded\s*your\s*(?:current\s*)?quota|insufficient_quota)\b/i.test(trimmed)) {
      return true;
    }
    if (/\b(?:credit\s*balance\s*is\s*too\s*low|organization\s*has\s*run\s*out\s*of\s*credits)\b/i.test(trimmed)) {
      return true;
    }
    if (/\brate_limit_error\b/i.test(trimmed)) {
      return true;
    }
  }

  return false;
}

/**
 * Records a rate-limiting cooldown (e.g. after receiving a 429 response or usage limit error).
 */
export function recordQuotaCooldown(backendId: string, cooldownMs = 15 * 60 * 1000, reason = 'Rate limit detected'): void {
  const rawCache = readQuotaCache();
  const current = rawCache?.data || {};
  const backend = current[backendId] || { installed: true, window: '5h', measured: false };

  backend.status = 'rate_limited';
  backend.cooldownUntil = new Date(Date.now() + cooldownMs).toISOString();
  backend.cooldownReason = reason;
  backend.usedPercent = null;
  backend.headroomPercent = null;
  backend.resetsAt = null;
  backend.measured = false;

  current[backendId] = backend;
  writeQuotaCache(current);
}

/**
 * Automatically inspects process execution output and records rate-limit cooldown if detected.
 */
export function checkAndRecordRateLimit(backendId: string, output?: string | null): boolean {
  if (isRateLimitError(output)) {
    recordQuotaCooldown(backendId, 15 * 60 * 1000, 'Rate limit detected in execution output');
    return true;
  }
  return false;
}

/**
 * Chooses the backend with the highest headroom or earliest reset in the 5h window.
 */
export async function selectSmartQuotaBackend(candidates: string[] | null = null, options: any = {}): Promise<string> {
  const config = options.config || loadConfig();
  const allowed = new Set(config.routing?.allowedBackends || ['codex', 'claude']);

  const baseCandidates = (candidates || ['codex', 'claude']).filter((id) => allowed.has(id));
  if (baseCandidates.length === 0) {
    throw new Error(
      `No allowed backends available for smart_quota routing. Allowed: [${Array.from(allowed).join(', ')}]`
    );
  }

  const quotas = options.quotasOverride || (await inspectQuotas(false, options.probesOverride));
  const installed = baseCandidates.filter((id) => quotas[id] && quotas[id].installed);

  if (installed.length === 0) {
    throw new Error('No active CLI backends installed for smart_quota routing.');
  }

  const unblocked = installed.filter((id) => {
    const q = quotas[id];
    if (q.status === 'rate_limited') return false;
    if (q.usedPercent !== null && q.usedPercent >= 100) return false;
    return true;
  });

  if (unblocked.length === 0) {
    const expiries = installed
      .map((id) => quotas[id]?.cooldownUntil || quotas[id]?.resetsAt)
      .filter(Boolean)
      .sort();
    const earliestMsg = expiries.length > 0 ? ` Earliest recovery cooldown resets at: ${expiries[0]}` : '';
    throw new Error(`All supported backends have currently exhausted their 5-hour limit windows.${earliestMsg}`);
  }

  if (unblocked.length === 1) {
    return unblocked[0];
  }

  const [first, second] = unblocked;
  const headroomA = quotas[first].headroomPercent;
  const headroomB = quotas[second].headroomPercent;

  if (headroomA !== null && headroomB !== null) {
    if (Math.abs(headroomA - headroomB) >= 10) {
      return headroomA > headroomB ? first : second;
    }
    const resetA = quotas[first].resetsAt ? new Date(quotas[first].resetsAt).getTime() : Infinity;
    const resetB = quotas[second].resetsAt ? new Date(quotas[second].resetsAt).getTime() : Infinity;
    return resetA <= resetB ? first : second;
  }

  if (headroomA !== null && headroomB === null) return first;
  if (headroomB !== null && headroomA === null) return second;

  return unblocked[0];
}
