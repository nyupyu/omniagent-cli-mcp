'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeGitRef, collectGitScope } = require('../src/services/git.service.ts');

test('sanitizeGitRef accepts valid git references', () => {
  assert.equal(sanitizeGitRef('main'), 'main');
  assert.equal(sanitizeGitRef('origin/main'), 'origin/main');
  assert.equal(sanitizeGitRef('feature/v1.0-auth'), 'feature/v1.0-auth');
  assert.equal(sanitizeGitRef('HEAD~1'), 'HEAD~1');
  assert.equal(sanitizeGitRef('a1b2c3d4e5f6'), 'a1b2c3d4e5f6');
});

test('sanitizeGitRef rejects invalid or dangerous git references', () => {
  assert.throws(() => sanitizeGitRef('--output=foo'), /cannot be empty or start with a dash/);
  assert.throws(() => sanitizeGitRef('; rm -rf /'), /invalid characters/);
  assert.throws(() => sanitizeGitRef('main | evil'), /invalid characters/);
  assert.throws(() => sanitizeGitRef(''), /cannot be empty/);
  assert.throws(() => sanitizeGitRef(null), /must be a string/);
});

test('collectGitScope resolves uncommitted scope without throwing', async () => {
  const scope = await collectGitScope('uncommitted', process.cwd());
  assert.equal(scope.type, 'uncommitted');
  assert.ok(typeof scope.diff === 'string');
});

test('collectGitScope resolves staged scope', async () => {
  const scope = await collectGitScope('staged', process.cwd());
  assert.equal(scope.type, 'staged');
  assert.ok(typeof scope.diff === 'string');
});
