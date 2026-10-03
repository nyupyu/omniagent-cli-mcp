'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runDoctor } = require('../src/services/doctor.service.ts');

test('runDoctor returns structured diagnostic report for all three CLIs', async () => {
  const report = await runDoctor();

  assert.ok(report);
  assert.ok(['operational', 'partially_configured', 'degraded_no_active_backends'].includes(report.status));
  assert.ok(Array.isArray(report.active_backends));
  assert.ok(report.security_policy.zero_silent_downloads === true);
  assert.ok(report.security_policy.read_only_sandbox_guard === true);

  // Backends
  assert.ok(report.backends.codex);
  assert.ok(report.backends.claude);
  assert.ok(report.backends.gemini);

  assert.equal(report.backends.codex.id, 'codex');
  assert.equal(report.backends.claude.id, 'claude');
  assert.equal(report.backends.gemini.id, 'gemini');

  // Verify recommendations exist if any backend is missing
  if (!report.backends.codex.installed || !report.backends.claude.installed || !report.backends.gemini.installed) {
    assert.ok(report.recommendations.length > 0);
  }
});
