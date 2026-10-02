'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const codexAdapter = require('./adapters/codex.js');
const claudeAdapter = require('./adapters/claude.js');
const { loadConfig } = require('./config.js');

function getQuotaCacheFile() {
  return process.env.OMNIAGENT_QUOTA_CACHE || path.join(os.homedir(), '.omniagent', 'quota-cache.json');
}

const QUOTA_CACHE_TTL_MS = 60 * 1000; // 60s cache TTL

/**
 * Sanitizes cached entries by immediately clearing expired rate-limiting cooldowns.
 */
function sanitizeCacheData(data) {
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
function readQuotaCache() {
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
function writeQuotaCache(data) {
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
async function inspectQuotas(forceRefresh = false, probesOverride = null) {
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

  const result = {
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
 * Splits text into diagnostic lines, stops before generated partial output,
 * and strictly verifies authoritative status and error signatures.
 */
function isRateLimitError(text) {
  if (!text || typeof text !== 'string') return false;

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('Partial output:') || trimmed.startsWith('Partial review:')) {
      break; // Stop parsing before generated model responses
    }

    // JSON formatted error responses: {"status": 429...} or {"code": "rate_limit_exceeded"...}
    if (/["'](?:status|code|statusCode)["']\s*:\s*(?:429(?!\d)|["']rate_limit_exceeded["'])/i.test(trimmed)) {
      return true;
    }

    // Status code 429 (ensuring no trailing file extensions like .txt)
    if (/\b(?:http\s*status\s*[:=]?\s*|status\s*(?:code)?\s*[:=]?\s*|api\s*error\s*[:=]?\s*|http[\s/]+(?:1\.[01]|2(?:\.0)?)?\s*)429(?!\.[a-zA-Z0-9])(?:\s|$|[:,\r\n"]|too\s+many\s+requests)/i.test(trimmed)) {
      return true;
    }

    // Plain 429 Too Many Requests
    if (/\b429\s+too\s+many\s+requests\b/i.test(trimmed)) {
      return true;
    }

    // Usage limit / quota exhaustion messages
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
 * Tracks cooldownUntil separately from unknown provider resetsAt.
 */
function recordQuotaCooldown(backendId, cooldownMs = 15 * 60 * 1000, reason = 'Rate limit detected') {
  const rawCache = readQuotaCache();
  const current = rawCache?.data || {};
  const backend = current[backendId] || { installed: true, window: '5h' };

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
function checkAndRecordRateLimit(backendId, output) {
  if (isRateLimitError(output)) {
    recordQuotaCooldown(backendId, 15 * 60 * 1000, 'Rate limit detected in execution output');
    return true;
  }
  return false;
}

/**
 * Chooses the backend with the highest headroom or earliest reset in the 5h window.
 * Strictly respects allowedBackends and filters exhausted/rate-limited backends before selection.
 */
async function selectSmartQuotaBackend(candidates = null, options = {}) {
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

  // Filter out any provider explicitly rate_limited or at 100% BEFORE returning single candidate
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

  // Compare headrooms if measured
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

  // If one is measured and unblocked while other is unmeasured, prefer measured
  if (headroomA !== null && headroomB === null) return first;
  if (headroomB !== null && headroomA === null) return second;

  // If neither is measured, fall back to candidate preference order
  return unblocked[0];
}

module.exports = {
  inspectQuotas,
  recordQuotaCooldown,
  isRateLimitError,
  checkAndRecordRateLimit,
  selectSmartQuotaBackend,
  getQuotaCacheFile,
};
