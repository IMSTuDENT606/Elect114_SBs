import { createHash, createHmac, randomBytes } from 'node:crypto';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const reject = (code) => { throw Object.assign(new Error(code), { code }); };
const get = (path) => `json_extract(body, '${path}')`;
const clock = "(unixepoch('subsec') * 1000)";

function openRound(roundId) {
  const settings = `$.rounds.${roundId}.public`;
  return `${get('$.activeRoundId')} = ${roundId}
    AND coalesce(${get(settings + '.manualClosed')}, 0) = 0
    AND ${get(settings + '.schedule.open')} <= ${clock}
    AND ${get(settings + '.schedule.close')} > ${clock}`;
}

function setMember(objectPath, key, value) {
  return `'${objectPath}', json_set(coalesce(${get(objectPath)}, '{}'), '$.${key}', ${value})`;
}

// D1 checks and mutations run in one statement so simultaneous voters do not
// contend on a read/compare/write loop over the entire election document.
export function workerVoting(db, secret, comparePassword) {
  const validRound = (id) => Number.isSafeInteger(id) && id > 0;
  const changed = async (sql, ...args) => (await db.prepare(sql).bind(...args).run()).meta.changes === 1;
  const state = async () => JSON.parse((await db.prepare('SELECT body FROM election_state WHERE id = 1').first()).body);

  async function verifyVoter({ data }) {
    const { studentId, password, roundId } = data ?? {};
    if (typeof studentId !== 'string' || !/^\d{5}$/.test(studentId) ||
        typeof password !== 'string' || !/^\d{6,7}$/.test(password) || !validRound(roundId)) reject('invalid-argument');

    const voter = `$.privateVoters.${studentId}`;
    const attempt = `$.attempts.${studentId}`;
    const activeLimit = `${get(attempt + '.until')} > ${clock}`;
    const entry = await db.prepare(`
      UPDATE election_state SET body = json_set(body, ${setMember('$.attempts', studentId, `
        CASE WHEN ${activeLimit} THEN json_object('count', ${get(attempt + '.count')} + 1,
          'until', ${get(attempt + '.until')})
        ELSE json_object('count', 1, 'until', ${clock} + 900000) END`)})
      WHERE id = 1 AND ${get(voter + '.enabled')} = 1
        AND ${get(voter + '.passwordHash')} IS NOT NULL
        AND CASE WHEN ${activeLimit} THEN ${get(attempt + '.count')} < 8 ELSE 1 END
      RETURNING ${get(voter + '.passwordHash')} AS passwordHash
    `).first();
    if (!entry) {
      const record = (await state()).privateVoters?.[studentId];
      reject(record?.enabled && record.passwordHash ? 'resource-exhausted' : 'permission-denied');
    }
    if (!await comparePassword(password, entry.passwordHash)) reject('permission-denied');

    const voterKey = createHmac('sha256', secret).update(`${roundId}:${studentId}`).digest('hex');
    const nonce = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 300000;
    const round = `$.rounds.${roundId}`;
    const session = JSON.stringify({ studentId, tokenHash: digest(nonce), expiresAt });
    if (!await changed(`
      UPDATE election_state SET body = json_set(body, ${setMember(round + '.sessions', voterKey, 'json(?)')})
      WHERE id = 1 AND ${openRound(roundId)}
        AND ${get(voter + '.enabled')} = 1 AND ${get(voter + '.passwordHash')} = ?
        AND ${get(round + '.eligible.' + studentId)} = 1
        AND coalesce(${get(round + '.usedVoters.' + voterKey)}, 0) = 0
    `, session, entry.passwordHash)) {
      const current = requireOpen(await state(), roundId);
      if (current.eligible?.[studentId] !== true) reject('permission-denied');
      if (current.usedVoters?.[voterKey]) reject('already-exists');
      reject('permission-denied');
    }
    return { votingToken: `${voterKey}.${nonce}`, expiresAt };
  }

  async function castVote({ data }) {
    const { votingToken, roundId, candidateId } = data ?? {};
    if (!validRound(roundId) || typeof candidateId !== 'string' || !/^[1-9]\d{0,8}$/.test(candidateId) ||
        typeof votingToken !== 'string' || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(votingToken)) reject('invalid-argument');

    const [voterKey, nonce] = votingToken.split('.');
    const tokenHash = digest(nonce);
    const round = `$.rounds.${roundId}`;
    const session = `${round}.sessions.${voterKey}`;
    const studentId = get(session + '.studentId');
    const voter = `'$.privateVoters.' || ${studentId}`;
    const voterRoom = `json_extract(body, ${voter} || '.room')`;
    const room = `substr(${voterRoom}, instr(${voterRoom}, '/') + 1)`;
    const roomTallies = `'${round}.roomTallies.' || ${room}`;
    const withVote = `json_remove(json_set(body,
      ${setMember(round + '.usedVoters', voterKey, "json('true')")},
      ${setMember(round + '.receipts', voterKey, '?2')},
      ${setMember(round + '.tallies', candidateId, `coalesce(${get(round + '.tallies.' + candidateId)}, 0) + 1`)}
    ), '${session}')`;
    if (await changed(`
      UPDATE election_state SET body = CASE
        WHEN ${room} IN ('1','2','3','4','5','6','7','8','9','10','11','12')
        THEN json_set(${withVote}, '${round}.roomTallies',
          json_set(coalesce(${get(round + '.roomTallies')}, '{}'), '$.' || ${room},
            json_set(coalesce(json_extract(body, ${roomTallies}), '{}'), '$.${candidateId}',
              coalesce(json_extract(body, ${roomTallies} || '.${candidateId}'), 0) + 1)))
        ELSE ${withVote} END
      WHERE id = 1 AND ${openRound(roundId)}
        AND ${get(session + '.tokenHash')} = ?1 AND ${get(session + '.expiresAt')} > ${clock}
        AND coalesce(${get(round + '.usedVoters.' + voterKey)}, 0) = 0
        AND json_extract(body, ${voter} || '.enabled') = 1
        AND json_extract(body, '${round}.eligible.' || ${studentId}) = 1
        AND json_type(body, '${round}.public.candidates.${candidateId}.name') = 'text'
    `, tokenHash, tokenHash)) return { success: true };

    // A lost response can be retried even after closing. The receipt records
    // the token digest only and does not link the voter to a candidate.
    const election = await state();
    if (election.rounds?.[roundId]?.receipts?.[voterKey] === tokenHash) return { success: true };
    const current = requireOpen(election, roundId);
    const latest = current.sessions?.[voterKey];
    if (latest?.tokenHash !== tokenHash || Date.now() >= latest.expiresAt) reject('unauthenticated');
    if (!election.privateVoters?.[latest.studentId]?.enabled || current.eligible?.[latest.studentId] !== true) reject('permission-denied');
    if (typeof current.public.candidates?.[candidateId]?.name !== 'string') reject('invalid-argument');
    reject('aborted');
  }

  return { verifyVoter, castVote };
}

function requireOpen(election, roundId) {
  const round = election.rounds?.[roundId];
  const { open, close } = round?.public?.schedule ?? {};
  const now = Date.now();
  if (election.activeRoundId !== roundId || round?.public?.manualClosed ||
      !Number.isFinite(open) || !Number.isFinite(close) || now < open || now >= close) reject('failed-precondition');
  return round;
}
