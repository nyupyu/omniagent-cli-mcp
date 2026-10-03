'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniagent-session-test-'));
const tempSessionsFile = path.join(tempDir, 'sessions.json');
process.env.OMNIAGENT_SESSIONS = tempSessionsFile;

const {
  createSession,
  getSession,
  updateSession,
  closeSession,
  resolveOrInitSession,
  acquireAndResolveSession,
  acquireSessionTurn,
  releaseSessionTurn,
  pruneExpiredSessions,
  getSessionsDir,
} = require('../src/services/session.service.ts');
const { formatCodexActivity, createCodexStreamCollector } = require('../src/adapters/codex.adapter.ts');
const { generateBugReport, sanitizeText, GITHUB_NEW_ISSUE_BASE } = require('../src/services/issue.service.ts');

test.after(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}
});

test('formatCodexActivity extracts human-readable streaming steps from JSONL events', () => {
  assert.equal(formatCodexActivity({ type: 'thread.started' }), 'Initializing session...');
  assert.equal(formatCodexActivity({ type: 'turn.started' }), 'Starting task analysis...');

  // Tool execution: command
  const cmdEvent = { type: 'item.started', item: { type: 'command', command: 'git diff HEAD~1' } };
  assert.equal(formatCodexActivity(cmdEvent), 'Running: git diff HEAD~1');

  // Tool execution: search
  const searchEvent = { type: 'item.started', item: { type: 'file_search', query: 'resolveBackend' } };
  assert.equal(formatCodexActivity(searchEvent), 'Searching: resolveBackend');

  // Tool execution: read file
  const readEvent = { type: 'item.started', item: { type: 'read_file', path: 'src/router.js' } };
  assert.equal(formatCodexActivity(readEvent), 'Reading: router.js');

  // Model reasoning / thought block
  const thoughtEvent = { type: 'item.started', item: { type: 'thought', summary: 'Auditing rate-limit regex boundary' } };
  assert.equal(formatCodexActivity(thoughtEvent), 'Reasoning: Auditing rate-limit regex boundary');

  // Agent message formulating
  const msgEvent = { type: 'item.started', item: { type: 'agent_message' } };
  assert.equal(formatCodexActivity(msgEvent), 'Formulating findings...');
});

test('session manager persists, updates, and closes multi-turn session handles cleanly', () => {
  // Create session
  const session = createSession('codex', process.cwd());
  assert.ok(session);
  assert.ok(session.sessionHandle.startsWith('omni_sess_'));
  assert.equal(session.backend, 'codex');
  assert.equal(session.threadId, null);

  // Retrieve session
  const loaded = getSession(session.sessionHandle);
  assert.ok(loaded);
  assert.equal(loaded.sessionHandle, session.sessionHandle);

  // Update session with captured CLI threadId
  const updated = updateSession(session.sessionHandle, { threadId: 'thread_xyz999' });
  assert.equal(updated.threadId, 'thread_xyz999');

  const reloaded = getSession(session.sessionHandle);
  assert.equal(reloaded.threadId, 'thread_xyz999');

  // Close session
  const closed = closeSession(session.sessionHandle);
  assert.equal(closed, true);
  assert.equal(getSession(session.sessionHandle), null);

  // Workspace and backend validation
  const sess2 = createSession('codex', path.join(tempDir, 'project-a'));
  assert.ok(getSession(sess2.sessionHandle, { backend: 'codex', workspace: path.join(tempDir, 'project-a') }));
  assert.equal(getSession(sess2.sessionHandle, { backend: 'claude' }), null);
  assert.equal(getSession(sess2.sessionHandle, { workspace: path.join(tempDir, 'project-b') }), null);

  // resolveOrInitSession tests
  const resolvedValid = resolveOrInitSession(sess2.sessionHandle, 'codex', path.join(tempDir, 'project-a'));
  assert.ok(resolvedValid.session);
  assert.equal(resolvedValid.session.sessionHandle, sess2.sessionHandle);

  const resolvedInvalid = resolveOrInitSession('omni_sess_nonexistent', 'codex', path.join(tempDir, 'project-a'));
  assert.ok(resolvedInvalid.error);
  assert.ok(resolvedInvalid.error.includes('Invalid or expired session handle'));

  const resolvedWrongDir = resolveOrInitSession(sess2.sessionHandle, 'codex', path.join(tempDir, 'project-b'));
  assert.ok(resolvedWrongDir.error);

  const resolvedFresh = resolveOrInitSession(null, 'codex', path.join(tempDir, 'project-a'));
  assert.ok(resolvedFresh.session);
  assert.ok(resolvedFresh.session.sessionHandle.startsWith('omni_sess_'));

  // Concurrency & process isolation test
  const sessA = createSession('codex', path.join(tempDir, 'workspace-1'));
  const sessB = createSession('codex', path.join(tempDir, 'workspace-2'));
  updateSession(sessA.sessionHandle, { threadId: 'thread_aaa' });
  updateSession(sessB.sessionHandle, { threadId: 'thread_bbb' });
  assert.equal(getSession(sessA.sessionHandle).threadId, 'thread_aaa');
  assert.equal(getSession(sessB.sessionHandle).threadId, 'thread_bbb');
  closeSession(sessA.sessionHandle);
  assert.equal(getSession(sessA.sessionHandle), null);
  assert.equal(getSession(sessB.sessionHandle).threadId, 'thread_bbb');

  // Turn serialization test
  const turn1 = acquireSessionTurn(sessB.sessionHandle);
  assert.equal(turn1.ok, true);

  // Competing turn on same session while busy
  const turn2 = acquireSessionTurn(sessB.sessionHandle);
  assert.equal(turn2.ok, false);
  assert.ok(turn2.error.includes('currently busy executing another turn'));

  // Attempting to close while busy throws
  assert.throws(() => {
    closeSession(sessB.sessionHandle);
  }, /Cannot close session.*busy executing another turn/);

  // Release turn
  releaseSessionTurn(sessB.sessionHandle);

  // acquireAndResolveSession acquires turn and returns session
  const turnResolved = acquireAndResolveSession(sessB.sessionHandle, 'codex', path.join(tempDir, 'workspace-2'));
  assert.ok(turnResolved.session);
  assert.equal(turnResolved.session.sessionHandle, sessB.sessionHandle);

  // A concurrent turn while resolved turn is open is rejected
  const turnConcurrent = acquireAndResolveSession(sessB.sessionHandle, 'codex', path.join(tempDir, 'workspace-2'));
  assert.ok(turnConcurrent.error);
  assert.ok(turnConcurrent.error.includes('currently busy executing another turn'));

  releaseSessionTurn(sessB.sessionHandle);

  // After turn release, closing succeeds
  const closedB = closeSession(sessB.sessionHandle);
  assert.equal(closedB, true);
});

test('pruneExpiredSessions cleans up expired session files and stale lock files', () => {
  const sessionsDir = getSessionsDir();
  const activeSess = createSession('codex', path.join(tempDir, 'active'));

  // Create an expired session file (> 2h old)
  const expiredHandle = 'omni_sess_expired123';
  const expiredFile = path.join(sessionsDir, `${expiredHandle}.json`);
  const twoHoursAndTenMinsAgo = new Date(Date.now() - 130 * 60 * 1000).toISOString();
  fs.writeFileSync(expiredFile, JSON.stringify({
    sessionHandle: expiredHandle,
    backend: 'codex',
    workspace: path.join(tempDir, 'active'),
    createdAt: twoHoursAndTenMinsAgo,
    lastUsedAt: twoHoursAndTenMinsAgo,
  }), 'utf8');

  // Create an expired busy lock
  const expiredBusy = path.join(sessionsDir, `${expiredHandle}.busy`);
  fs.writeFileSync(expiredBusy, JSON.stringify({ pid: 9999999, lockedAt: Date.now() - 130 * 60 * 1000 }), 'utf8');

  assert.ok(fs.existsSync(expiredFile));
  assert.ok(fs.existsSync(expiredBusy));

  // Run forced prune
  pruneExpiredSessions(true);

  // Expired files should be purged
  assert.equal(fs.existsSync(expiredFile), false);
  assert.equal(fs.existsSync(expiredBusy), false);

  // Active session should remain intact
  assert.ok(getSession(activeSess.sessionHandle));
});

test('acquireSessionTurn safely reclaims lock held by dead process', () => {
  const sess = createSession('codex', path.join(tempDir, 'dead-proc-test'));
  const sessionsDir = getSessionsDir();
  const filePath = path.join(sessionsDir, `${sess.sessionHandle}.json`);

  // Simulate a turn belonging to a dead PID (e.g. 99999999)
  const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  sessionData.activePid = 99999999;
  sessionData.activeTurnAt = Date.now() - 20000;
  fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2), 'utf8');

  // acquireSessionTurn should detect dead PID, safely reclaim the turn, and succeed
  const turn = acquireSessionTurn(sess.sessionHandle);
  assert.equal(turn.ok, true);

  // We now own the turn
  const updated = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(updated.activePid, process.pid);

  releaseSessionTurn(sess.sessionHandle);
  const released = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(released.activePid, null);
});

test('issue reporting generates sanitized GitHub pre-filled issue URL and redacts secrets', () => {
  const secretText = `Error at ${os.homedir()}/projects/secret: connection failed with API key sk-proj12345678901234567890, AWS key AKIAIOSFODNN7EXAMPLE, Slack xoxb-1234567890-abcdefgh, and api_key="secretPassword123" and https://api.com?token=superSecretToken. Also Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.`;
  const sanitized = sanitizeText(secretText);

  assert.ok(!sanitized.includes('sk-proj12345678901234567890'));
  assert.ok(sanitized.includes('sk-***[REDACTED]***'));
  assert.ok(sanitized.includes('Bearer ***[REDACTED]***'));
  assert.ok(sanitized.includes('AKIA***[REDACTED]***'));
  assert.ok(sanitized.includes('xox-***[REDACTED]***'));
  assert.ok(sanitized.includes('api_key="***[REDACTED]***"'));
  assert.ok(sanitized.includes('token=***[REDACTED]***'));
  assert.ok(!sanitized.includes(os.homedir()));
  assert.ok(sanitized.includes('~'));

  // Test edge cases: JSON quoted keys, passwords with punctuation, short Bearer tokens, URL credentials
  const edgeSecretText = `Config: {"api_key":"abcd1234SECRET"}, env: password=abc!def123, header: Authorization: Bearer abc, json: {"password":"abc;def"}, git: https://alice:superSecret@host.com/repo.git, token_url: https://secretToken123@api.com, user_url: https://user:@host.com`;
  const sanitizedEdge = sanitizeText(edgeSecretText);
  assert.equal(
    sanitizedEdge,
    `Config: {"api_key":"***[REDACTED]***"}, env: password=***[REDACTED]***, header: Authorization: Bearer ***[REDACTED]***, json: {"password":"***[REDACTED]***"}, git: https://***[REDACTED]***@host.com/repo.git, token_url: https://***[REDACTED]***@api.com, user_url: https://***[REDACTED]***@host.com`
  );

  // Test safe surrogate handling with emojis
  const emojiError = 'Crash with rocket 🚀'.repeat(200);
  const emojiReport = generateBugReport({
    errorMessage: emojiError,
    context: 'Testing emoji surrogates',
  });
  assert.doesNotThrow(() => {
    decodeURIComponent(emojiReport.issueUrl);
  });

  const report = generateBugReport({
    errorMessage: 'Process failed with exit code 1',
    context: 'Running omniagent_review on uncommitted changes',
    doctorReport: {
      backends: {
        codex: { name: 'OpenAI Codex CLI', installed: true, version: '0.160.0' },
        claude: { name: 'Claude Code CLI', installed: false },
      },
    },
  });

  assert.ok(report.issueUrl.startsWith(GITHUB_NEW_ISSUE_BASE));
  assert.ok(report.issueUrl.includes('title='));
  assert.ok(report.issueUrl.includes('body='));
  assert.ok(report.prompt.includes('Would you like to report this issue to GitHub'));
  assert.ok(report.prompt.includes(GITHUB_NEW_ISSUE_BASE));
});

test('issue sanitization covers Basic auth, AWS secret keys, semicolons in unquoted passwords, and resists ReDoS', () => {
  // Test Basic auth, temporary AWS keys (ASIA), and complex passwords with semicolons and equals
  const leakedText = 'Authorization: Basic dXNlcjpwYXNzd29yZA== and AWS_ACCESS_KEY_ID=ASIA1234567890ABCDEF and AWS_SECRET_ACCESS_KEY=superSecretValue and password=abc;def=ghi and aws_session_token=xyz123';
  const sanitized = sanitizeText(leakedText);
  assert.ok(!sanitized.includes('dXNlcjpwYXNzd29yZA=='));
  assert.ok(!sanitized.includes('ASIA1234567890ABCDEF'));
  assert.ok(!sanitized.includes('superSecretValue'));
  assert.ok(!sanitized.includes('abc;def=ghi'));
  assert.ok(!sanitized.includes('def=ghi'));
  assert.ok(!sanitized.includes('xyz123'));
  assert.ok(sanitized.includes('Authorization: Basic ***[REDACTED]***'));
  assert.ok(sanitized.includes('AWS_ACCESS_KEY_ID=***[REDACTED]***'));
  assert.ok(sanitized.includes('AWS_SECRET_ACCESS_KEY=***[REDACTED]***'));
  assert.ok(sanitized.includes('password=***[REDACTED]***'));
  assert.ok(sanitized.includes('aws_session_token=***[REDACTED]***'));

  // Test code confidentiality: raw code blocks, unterminated blocks, tildes, and git diffs
  const codeText = 'Error occurred during test:\n```typescript\nconst proprietarySecret = "internal_secret_value";\n```\n~~~python\nsecret_python = 42\n~~~\ndiff --git a/src/secret.js b/src/secret.js\n+ secret diff\n';
  const sanitizedCode = sanitizeText(codeText);
  assert.ok(!sanitizedCode.includes('proprietarySecret'));
  assert.ok(!sanitizedCode.includes('secret_python'));
  assert.ok(!sanitizedCode.includes('+ secret diff'));
  assert.ok(sanitizedCode.includes('[code block redacted for privacy]'));
  assert.ok(sanitizedCode.includes('[git diff redacted for privacy]'));

  // Unterminated code block (e.g. truncated closing fence)
  const unterminatedCode = 'Prefix info:\n```typescript\nconst unterminatedSecret = "must_not_leak";';
  const sanitizedUnterminated = sanitizeText(unterminatedCode);
  assert.ok(!sanitizedUnterminated.includes('unterminatedSecret'));
  assert.ok(sanitizedUnterminated.includes('[code block redacted for privacy]'));

  // Embedded fence delimiter test: tilde block containing ``` must not terminate early
  const embeddedFenceCode = '~~~markdown\ncode here:\n```javascript\nconst leakedInner = "secret123";\n```\nconst leakedAfter = "secret456";\n~~~';
  const sanitizedEmbedded = sanitizeText(embeddedFenceCode);
  assert.ok(!sanitizedEmbedded.includes('leakedInner'));
  assert.ok(!sanitizedEmbedded.includes('leakedAfter'));

  // ReDoS test: 40,000 'a' characters must sanitize linearly in under 100ms
  const longA = 'a'.repeat(40000);
  const start = Date.now();
  const sanitizedA = sanitizeText(longA);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 100, `Sanitization took too long (${elapsed}ms), possible ReDoS`);
  assert.ok(sanitizedA.length <= 4096, 'Bounded length should be enforced');
});

test('active session turn is strictly immune from TTL expiration while executing', () => {
  const sess = createSession('codex', path.join(tempDir, 'active-ttl-test'));
  const sessionsDir = getSessionsDir();
  const filePath = path.join(sessionsDir, `${sess.sessionHandle}.json`);

  // Simulate an active turn owned by this live process, but lastUsedAt is 3 hours ago (> 2h TTL)
  const threeHoursAgo = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
  const rawSession = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  rawSession.activePid = process.pid;
  rawSession.activeTurnAt = Date.now() - 3 * 3600 * 1000;
  rawSession.lastUsedAt = threeHoursAgo;
  fs.writeFileSync(filePath, JSON.stringify(rawSession, null, 2), 'utf8');

  // getSession MUST NOT delete an actively executing session
  const loaded = getSession(sess.sessionHandle);
  assert.ok(loaded, 'Actively executing session should not be expired or deleted by getSession');
  assert.equal(loaded.activePid, process.pid);
  assert.ok(fs.existsSync(filePath), 'Session file must remain on disk while executing');

  // While busy, concurrent turn is rejected
  const busyTurn = acquireSessionTurn(sess.sessionHandle);
  assert.equal(busyTurn.ok, false);

  // Release the turn
  releaseSessionTurn(sess.sessionHandle);

  // Now acquire a new turn cleanly
  const turn = acquireSessionTurn(sess.sessionHandle);
  assert.equal(turn.ok, true);
  assert.ok(fs.existsSync(filePath));

  // Release turn again
  releaseSessionTurn(sess.sessionHandle);

  // Now that turn is released (IDLE), backdate lastUsedAt to 3 hours ago
  const idleSession = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  idleSession.lastUsedAt = threeHoursAgo;
  fs.writeFileSync(filePath, JSON.stringify(idleSession, null, 2), 'utf8');

  // Now that it is idle, getSession strictly expires and cleans it up
  const expired = getSession(sess.sessionHandle);
  assert.equal(expired, null, 'Idle session older than 2 hours should expire');
  assert.equal(fs.existsSync(filePath), false, 'Expired idle session file should be unlinked');
});

test('createCodexStreamCollector accumulates message updates from created -> updated -> completed without losing findings', () => {
  const collector = createCodexStreamCollector();

  // 1. Thread started event
  collector.pushChunk(JSON.stringify({ type: 'thread.started', thread_id: 'thread_audit_123' }) + '\n');
  assert.equal(collector.getCapturedThreadId(), 'thread_audit_123');

  // 2. Stream partial message
  collector.pushChunk(JSON.stringify({
    type: 'item.created',
    item: { id: 'msg_0', type: 'agent_message', text: 'Partial analysis: checking lock mechanism...' }
  }) + '\n');
  assert.equal(collector.getFormattedOutput(), 'Partial analysis: checking lock mechanism...');

  // 3. Stream updated message
  collector.pushChunk(JSON.stringify({
    type: 'item.updated',
    item: { id: 'msg_0', type: 'agent_message', text: 'Partial analysis: identified race window in reclamation.' }
  }) + '\n');
  assert.equal(collector.getFormattedOutput(), 'Partial analysis: identified race window in reclamation.');

  // 4. Stream completed message with final audit findings
  collector.pushChunk(JSON.stringify({
    type: 'item.completed',
    item: { id: 'msg_0', type: 'agent_message', text: 'Audit Findings:\n- Mutual exclusion verified with reclaimMutex.\n- Zero P1/P2 issues.' }
  }) + '\n');
  collector.flush();

  const finalOutput = collector.getFormattedOutput();
  assert.ok(finalOutput.includes('Mutual exclusion verified with reclaimMutex'));
  assert.ok(finalOutput.includes('Zero P1/P2 issues'));
  assert.ok(!finalOutput.includes('checking lock mechanism'));
});

test('createCodexStreamCollector safely discards oversized records without corrupting JSONL boundaries', () => {
  const collector = createCodexStreamCollector({ maxLineBuffer: 1024 }); // 1KB test limit

  // Send a valid message chunk
  collector.pushChunk(JSON.stringify({
    type: 'item.completed',
    item: { id: 'm1', type: 'agent_message', text: 'First valid report' }
  }) + '\n');

  // Send an oversized record (> 1KB) without newline
  const bigChunk = '{"type":"raw_log","content":"' + 'X'.repeat(2000) + '"}';
  collector.pushChunk(bigChunk); // exceeds maxLineBuffer, gets discarded cleanly

  // Send the newline terminating the oversized record, followed immediately by another valid message
  collector.pushChunk('\n' + JSON.stringify({
    type: 'item.completed',
    item: { id: 'm2', type: 'agent_message', text: 'Second valid report after oversized skip' }
  }) + '\n');

  collector.flush();

  const output = collector.getFormattedOutput();
  assert.ok(output.includes('First valid report'));
  assert.ok(output.includes('Second valid report after oversized skip'));
  assert.ok(!output.includes('XXXXX'));
  assert.equal(collector.getRawFallbackLines().length, 0, 'No corrupted JSON fragments in fallback');
});

test('stale lock reclamation safely serializes competing contenders via reclaimMutex', () => {
  const sess = createSession('codex', path.join(tempDir, 'competing-reclaim'));
  const sessionsDir = getSessionsDir();
  const lockFile = path.join(sessionsDir, `${sess.sessionHandle}.json.lock`);
  const reclaimMutex = `${lockFile}.reclaim`;

  // Write a stale lock file with dead PID
  const staleData = JSON.stringify({ token: 'dead_token', pid: 99999999, time: Date.now() - 10000 });
  fs.writeFileSync(lockFile, staleData, 'utf8');

  // acquireSessionTurn should acquire reclaimMutex exclusively, replace lockFile, and clean up reclaimMutex
  const turn = acquireSessionTurn(sess.sessionHandle);
  assert.equal(turn.ok, true, 'Turn should acquire cleanly via reclaimMutex');

  // Assert reclaimMutex is cleanly removed after critical section lock acquisition
  assert.equal(fs.existsSync(reclaimMutex), false, 'reclaimMutex must be cleanly unlinked');

  releaseSessionTurn(sess.sessionHandle);
});

test('createCodexStreamCollector retains bounded latest text under budget pressure rather than stale draft', () => {
  // Set a tight budget of 150 bytes total
  const collector = createCodexStreamCollector({ maxTotalMessageBytes: 150 });

  // Stream initial partial draft (60 bytes)
  collector.pushChunk(JSON.stringify({
    type: 'item.created',
    item: { id: 'm1', type: 'agent_message', text: 'Initial partial analysis draft from turn.' }
  }) + '\n');
  assert.equal(collector.getFormattedOutput(), 'Initial partial analysis draft from turn.');

  // Stream final large findings (250 bytes), which exceeds the 150 bytes budget
  const finalFindings = 'Final comprehensive findings: identified 0 vulnerabilities in review, confirmed mutual exclusion and strict secret masking. '.repeat(2);
  collector.pushChunk(JSON.stringify({
    type: 'item.completed',
    item: { id: 'm1', type: 'agent_message', text: finalFindings }
  }) + '\n');
  collector.flush();

  const output = collector.getFormattedOutput();
  // It must NOT keep the stale "Initial partial analysis draft"
  assert.ok(!output.includes('Initial partial analysis draft'));
  // It MUST keep the latest final findings with explicit truncation marker
  assert.ok(output.includes('Final comprehensive findings'));
  assert.ok(output.includes('[truncated]'));

  // Reduced budget test (40 bytes total): 5-byte draft + 35-byte message leaves 0 bytes available
  const tightCollector = createCodexStreamCollector({ maxTotalMessageBytes: 40 });
  tightCollector.pushChunk(JSON.stringify({
    type: 'item.created',
    item: { id: 'm1', type: 'agent_message', text: 'draft' }
  }) + '\n');
  tightCollector.pushChunk(JSON.stringify({
    type: 'item.created',
    item: { id: 'm2', type: 'agent_message', text: '01234567890123456789012345678901234' } // 35 bytes
  }) + '\n');
  // Final text arrives for m1
  tightCollector.pushChunk(JSON.stringify({
    type: 'item.completed',
    item: { id: 'm1', type: 'agent_message', text: 'final text for m1' }
  }) + '\n');
  tightCollector.flush();
  const tightOutput = tightCollector.getFormattedOutput();
  assert.ok(!tightOutput.includes('draft'), 'Stale draft must never survive under tight budget');
  assert.ok(tightOutput.includes('[truncated]'), 'Must indicate truncation');
});
