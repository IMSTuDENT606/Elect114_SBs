const { createHash, createHmac, randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { HttpsError } = require('firebase-functions/v2/https');

module.exports = (getDatabase, voterSecret, comparePassword = bcrypt.compare) => {
  const roundIdValid = (id) => Number.isSafeInteger(id) && id > 0;
  const digest = (value) => createHash('sha256').update(value).digest('hex');

  function requireOpenRound(election, roundId, now) {
    const round = election?.rounds?.[roundId];
    const { open, close } = round?.public?.schedule ?? {};
    if (!round || election.activeRoundId !== roundId || round.public?.manualClosed === true ||
        !Number.isFinite(open) || !Number.isFinite(close) || now < open || now >= close) {
      throw new HttpsError('failed-precondition', 'Polls are closed');
    }
    return round;
  }

  async function verifyVoter({ data }) {
    const { studentId, password, roundId } = data ?? {};
    if (typeof studentId !== 'string' || !/^\d{5}$/.test(studentId) ||
        typeof password !== 'string' || !/^\d{6,7}$/.test(password) || !roundIdValid(roundId)) {
      throw new HttpsError('invalid-argument', 'Invalid voter credentials or round');
    }

    const ref = getDatabase().ref('election');
    const voter = (await ref.child(`privateVoters/${studentId}`).get()).val();
    const denied = () => new HttpsError('permission-denied', 'Invalid voter credentials or eligibility');
    if (voter?.enabled !== true || typeof voter.passwordHash !== 'string') throw denied();

    const attempt = await ref.child(`attempts/${studentId}`).transaction((entry) => {
      const now = Date.now();
      if (!entry || now >= entry.until) return { count: 1, until: now + 15 * 60_000 };
      if (entry.count < 8) return { ...entry, count: entry.count + 1 };
    }, undefined, false);
    if (!attempt.committed) throw new HttpsError('resource-exhausted', 'Too many verification attempts');
    if (!await comparePassword(password, voter.passwordHash)) throw denied();

    const voterKey = createHmac('sha256', voterSecret.value()).update(`${roundId}:${studentId}`).digest('hex');
    const nonce = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 5 * 60_000;
    let failure;
    const issued = await ref.transaction((election) => {
      failure = null;
      try {
        const round = requireOpenRound(election, roundId, Date.now());
        const latestVoter = election.privateVoters?.[studentId];
        if (latestVoter?.enabled !== true || latestVoter.passwordHash !== voter.passwordHash ||
            round.eligible?.[studentId] !== true) throw denied();
        if (round.usedVoters?.[voterKey]) throw new HttpsError('already-exists', 'A vote has already been recorded');
        (round.sessions ??= {})[voterKey] = { studentId, tokenHash: digest(nonce), expiresAt };
        return election;
      } catch (error) {
        failure = error;
        return election === null ? null : undefined;
      }
    }, undefined, false);
    if (failure) throw failure;
    if (!issued.committed) throw new HttpsError('aborted', 'Could not issue a voting token');
    return { votingToken: `${voterKey}.${nonce}`, expiresAt };
  }

  async function castVote({ data }) {
    const { votingToken, roundId, candidateId } = data ?? {};
    if (!roundIdValid(roundId) || typeof candidateId !== 'string' || !/^[1-9]\d{0,8}$/.test(candidateId) ||
        typeof votingToken !== 'string' || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(votingToken)) {
      throw new HttpsError('invalid-argument', 'Invalid token, round, or candidate');
    }
    const [voterKey, nonce] = votingToken.split('.');
    const tokenHash = digest(nonce);
    let failure;
    const result = await getDatabase().ref('election').transaction((election) => {
      failure = null;
      try {
        const now = Date.now();
        const round = requireOpenRound(election, roundId, now);
        if (round.usedVoters?.[voterKey]) throw new HttpsError('already-exists', 'A vote has already been recorded');
        const session = round.sessions?.[voterKey];
        if (session?.tokenHash !== tokenHash || now >= session.expiresAt) {
          throw new HttpsError('unauthenticated', 'Voting token is invalid or expired');
        }
        const studentId = session.studentId;
        if (election.privateVoters?.[studentId]?.enabled !== true || round.eligible?.[studentId] !== true) {
          throw new HttpsError('permission-denied', 'Voter is not eligible');
        }
        if (typeof round.public?.candidates?.[candidateId]?.name !== 'string') {
          throw new HttpsError('invalid-argument', 'Candidate is not registered');
        }
        (round.usedVoters ??= {})[voterKey] = true;
        const tallies = (round.tallies ??= {});
        tallies[candidateId] = (tallies[candidateId] ?? 0) + 1;
        const roomNumber = /\/(1[0-2]|[1-9])$/.exec(election.privateVoters[studentId].room)?.[1];
        if (roomNumber) {
          const roomTallies = (round.roomTallies ??= {});
          const room = (roomTallies[roomNumber] ??= {});
          room[candidateId] = (room[candidateId] ?? 0) + 1;
        }
        delete round.sessions[voterKey];
        return election;
      } catch (error) {
        failure = error;
        return election === null ? null : undefined;
      }
    }, undefined, false);
    if (failure) throw failure;
    if (!result.committed) throw new HttpsError('aborted', 'Vote was not committed');
    return { success: true };
  }
  return { verifyVoter, castVote };
};
