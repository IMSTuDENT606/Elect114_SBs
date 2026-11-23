const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { once } = require('node:events');
const http = require('node:http');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const emulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
assert.match(emulator ?? '', /^127\.0\.0\.1:\d+$/, 'Start a Realtime Database Emulator on IPv4 loopback');
const projectId = 'demo-election-qa';
const namespace = `${projectId}-default-rtdb`;
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId, databaseURL: `https://${namespace}.firebaseio.com`
});
process.env.VOTER_HASH_SECRET = 'test-only-election-secret';

const { getApp, deleteApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { verifyVoter, castVote, manageElection } = require('..');
const db = getDatabase();
const admin = { uid: 'qa-admin', token: { admin: true } };
const roundId = 1;
const publicPath = 'election/rounds/1/public';
const tallyPath = 'election/rounds/1/tallies';
const pin = '114501';

function rest(resource, options) {
  return fetch(`http://${emulator}/${resource}.json?ns=${namespace}`, {
    signal: AbortSignal.timeout(12000), ...options
  });
}

function expectError(operation, code) {
  return assert.rejects(operation, { code });
}

const verify = (studentId) => verifyVoter.run({ data: { studentId, password: pin, roundId } });
const cast = (votingToken) => castVote.run({ data: { votingToken, roundId, candidateId: '1' } });
const manage = (action, fields = {}) => manageElection.run({ auth: admin, data: { action, roundId, ...fields } });

async function watchPublished() {
  const controller = new AbortController();
  const response = await rest(`${publicPath}/schedule/publish`, {
    headers: { Accept: 'text/event-stream' }, signal: controller.signal
  });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  async function nextValue() {
    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('data: {')) return JSON.parse(line.slice(6)).data;
        continue;
      }
      const chunk = await reader.read();
      if (chunk.done) throw new Error('The realtime stream closed unexpectedly');
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  }
  return { nextValue, close: () => controller.abort() };
}

async function loseVoteResponse(token) {
  const httpServer = http.createServer(async (_, response) => {
    try {
      await cast(token);
      // Drop the TCP connection after the database commit and before the response.
      response.destroy();
    } catch {
      response.writeHead(500).end();
    }
  });
  httpServer.listen(0, '127.0.0.1');
  await once(httpServer, 'listening');
  try {
    await assert.rejects(fetch(`http://127.0.0.1:${httpServer.address().port}/cast`, {
      method: 'POST', signal: AbortSignal.timeout(10000)
    }), { name: 'TypeError' });
  } finally {
    httpServer.closeAllConnections();
    httpServer.close();
  }
}

async function main() {
  const rules = await readFile(path.join(__dirname, '../../database.rules.json'), 'utf8');
  const rulesUpdate = await rest('.settings/rules', {
    method: 'PUT', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: rules
  });
  assert.equal(rulesUpdate.status, 200, await rulesUpdate.text());
  const passwordHash = await bcrypt.hash(pin, 4);
  const voter = { name: 'QA voter', room: 'ม.6/5', number: 1, enabled: true, passwordHash };
  const now = Date.now();
  const schedule = { open: now - 1000, close: now + 120000, publish: now + 180000 };
  await db.ref().set({ election: {
    activeRoundId: roundId,
    privateVoters: Object.fromEntries(['90001', '90002', '90003', '90004'].map((id) => [id, voter])),
    rounds: { [roundId]: {
      eligible: { '90001': true, '90003': true, '90004': true },
      public: { schedule, candidates: { 1: { name: 'QA candidate' } } }
    }}
  }});

  assert.ok([401, 403].includes((await rest('election/privateVoters')).status));
  console.log('03 PASS: anonymous roster read denied by deployed emulator rules');

  const { votingToken } = await verify('90001');
  assert.ok(votingToken);
  console.log('04 PASS: valid student number and PIN issue a voting token');
  await expectError(verify('90002'), 'permission-denied');
  console.log('05 PASS: an ineligible student receives no voting token');

  assert.equal((await cast(votingToken)).success, true);
  console.log('06 PASS: first ballot commits');
  await expectError(verify('90001'), 'already-exists');
  console.log('07 PASS: a fresh session cannot obtain another token');
  await expectError(cast(votingToken), 'already-exists');
  assert.equal((await db.ref(`${tallyPath}/1`).get()).val(), 1);
  console.log('08 PASS: a separate request replay cannot increment the tally');

  assert.ok([401, 403].includes((await rest('election/rounds/1/usedVoters')).status));
  assert.ok([401, 403].includes((await rest('election/rounds/1/sessions')).status));
  console.log('09 PASS: voter records and sessions cannot be read by a student');
  assert.ok([401, 403].includes((await rest(tallyPath)).status));
  console.log('10 PASS: tally read denied before publication');

  for (const [field, change] of Object.entries({
    candidates: { 1: { name: 'Unauthorized edit' } },
    schedule: { open: now }
  })) {
    const result = await rest(`${publicPath}/${field}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(change)
    });
    assert.ok([401, 403].includes(result.status), `${field}: HTTP ${result.status}`);
  }
  assert.equal((await db.ref(`${publicPath}/candidates/1/name`).get()).val(), 'QA candidate');
  assert.equal((await db.ref(`${publicPath}/schedule/open`).get()).val(), schedule.open);
  await expectError(manageElection.run({ data: { action: 'schedule' } }), 'permission-denied');
  console.log('11 PASS: direct student edits and the admin callable are denied');

  const changed = await manage('schedule', { revision: 0, schedule: { ...schedule, close: schedule.close + 1000 } });
  assert.equal(changed.settings.schedule.close, schedule.close + 1000);
  console.log('12 PASS: admin with the claim can edit a live schedule');

  const pending = await verify('90003');
  const closed = await manage('close', { revision: changed.revision });
  await expectError(cast(pending.votingToken), 'failed-precondition');
  console.log('13 PASS: closing the poll rejects a previously issued token');

  const watchers = await Promise.all([watchPublished(), watchPublished()]);
  let published;
  try {
    assert.deepEqual(await Promise.all(watchers.map((watcher) => watcher.nextValue())), [schedule.publish, schedule.publish]);
    published = await manage('publish', { revision: closed.revision });
    const updates = await Promise.race([
      Promise.all(watchers.map((watcher) => watcher.nextValue())),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Realtime delivery timed out')), 5000).unref())
    ]);
    assert.deepEqual(updates, [published.settings.schedule.publish, published.settings.schedule.publish]);
    const responses = await Promise.all([rest(tallyPath), rest(tallyPath)]);
    for (const response of responses) {
      assert.equal(response.status, 200);
      assert.equal((await response.json())[1], 1);
    }
    console.log('14 PASS: two realtime clients receive publication and can read the matching tally');
  } finally {
    watchers.forEach((watcher) => watcher.close());
  }

  await manage('schedule', { revision: published.revision, schedule });
  const session = await verify('90004');
  await loseVoteResponse(session.votingToken);
  await expectError(cast(session.votingToken), 'already-exists');
  assert.equal((await db.ref(`${tallyPath}/1`).get()).val(), 2);
  console.log('15 PASS: dropped response after commit followed by retry adds exactly one ballot');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => deleteApp(getApp()));
