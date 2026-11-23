import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { workerVoting } from './worker-voting.mjs';
import adminElection from './functions/admin-election.js';
import { requireAdmin } from './worker-auth.mjs';
import { electionStore } from './worker-state.mjs';
import { photoPath, photoUpload, readLimited, savePhoto } from './worker-photos.mjs';

const websiteOrigin = 'https://imstudent606.github.io';
const errorStatuses = { 'permission-denied': 403, unauthenticated: 401, 'invalid-argument': 400,
  'already-exists': 409, aborted: 409, 'failed-precondition': 412, 'resource-exhausted': 429 };

async function handlePost(request, env, pathname) {
  const upload = photoUpload.exec(pathname);
  const admin = pathname === '/api/manageElection' || upload ? await requireAdmin(request) : undefined;
  const store = electionStore(env.DB);
  if (upload) {
    const state = (await store.ref().get()).val();
    if (state?.activeRoundId !== Number(upload[1])) {
      throw Object.assign(new Error('รอบเลือกตั้งเปลี่ยนแล้ว'), { code: 'aborted' });
    }
    return { photoURL: await savePhoto(env.DB, request, pathname) };
  }

  if (request.headers.get('Content-Type') !== 'application/json') {
    throw Object.assign(new Error('ข้อมูลคำขอต้องเป็น JSON'), { code: 'invalid-argument' });
  }
  const body = await readLimited(request, 1_000_000);
  let data;
  try { data = JSON.parse(body.toString('utf8')); }
  catch { throw Object.assign(new Error('ข้อมูล JSON ไม่ถูกต้อง'), { code: 'invalid-argument' }); }
  const voterSecret = { value: () => env.VOTER_HASH_SECRET };
  const hashPassword = (password) => 'hmac-v1:' + createHmac('sha256', env.WORKER_PASSWORD_SECRET)
    .update(password).digest('hex');
  const comparePassword = (password, stored) => /^hmac-v1:[a-f0-9]{64}$/.test(stored) &&
    timingSafeEqual(Buffer.from(hashPassword(password)), Buffer.from(stored));
  if (!env.VOTER_HASH_SECRET || !env.WORKER_PASSWORD_SECRET) {
    throw new Error('Worker election configuration is incomplete');
  }
  const getDatabase = () => ({ ref: () => store.ref() });
  if (admin) {
    const proposed = data?.action === 'candidate' && data.candidate?.photoURL;
    const existing = typeof proposed === 'string' && photoPath.test(proposed) &&
      await env.DB.prepare('SELECT 1 FROM candidate_photo_chunks WHERE path = ? AND part = 0').bind(proposed).first();
    const manage = adminElection(getDatabase, voterSecret, (url, round, no) =>
      Boolean(existing && url === proposed && url.startsWith(`/api/photos/${round}/${no}/`)), hashPassword);
    return manage({ auth: admin, data });
  }
  const { verifyVoter, castVote } = workerVoting(env.DB, env.VOTER_HASH_SECRET, comparePassword);
  return (pathname === '/api/verifyVoter' ? verifyVoter : castVote)({ data });
}

function roomResults(state, round) {
  const roomMembers = {};
  let eligibleCount = 0;
  for (const [id, voter] of Object.entries(state.privateVoters ?? {})) {
    if (voter.enabled !== true || round.eligible?.[id] !== true) continue;
    eligibleCount++;
    const room = /\/(1[0-2]|[1-9])$/.exec(voter.room)?.[1];
    if (room) roomMembers[room] = (roomMembers[room] ?? 0) + 1;
  }
  const sum = (counts) => Object.values(counts ?? {}).reduce((total, count) => total + (Number(count) || 0), 0);
  const tallies = round.tallies ?? {};
  const total = sum(tallies);
  const roomTotal = Object.values(round.roomTallies ?? {}).reduce((count, room) => count + sum(room), 0);
  return {
    roundId: state.activeRoundId, tallies, total, eligibleCount, roomMembers,
    roomTallies: roomTotal === total ? round.roomTallies ?? {} : null
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const requestURL = new URL(request.url);
    const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
    const json = (body, status = 200) => Response.json(body, { status, headers });
    if (origin && origin !== websiteOrigin && origin !== requestURL.origin) {
      return json({ code: 'permission-denied' }, 403);
    }
    if (origin) headers.set('Access-Control-Allow-Origin', origin);

    const { pathname } = requestURL;
    if (pathname === '/' && request.method === 'GET') {
      return json({ service: 'elect114-api', round: '/api/round', results: '/api/results' });
    }
    const isPostRoute = ['/api/verifyVoter', '/api/castVote', '/api/manageElection'].includes(pathname) || photoUpload.test(pathname);
    const isGetRoute = ['/api/round', '/api/results', '/api/admin/participation'].includes(pathname) || photoPath.test(pathname);
    if (!isPostRoute && !isGetRoute) {
      return json({ code: 'not-found' }, 404);
    }
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', isPostRoute ? 'POST' : 'GET');
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, ngrok-skip-browser-warning');
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== (isPostRoute ? 'POST' : 'GET')) return json({ code: 'method-not-allowed' }, 405);

    try {
      if (isPostRoute) return json(await handlePost(request, env, pathname), photoUpload.test(pathname) ? 201 : 200);
      if (photoPath.test(pathname)) {
        const { results } = await env.DB.prepare('SELECT type, file FROM candidate_photo_chunks WHERE path = ? ORDER BY part')
          .bind(pathname).all();
        if (!results.length) return json({ code: 'not-found' }, 404);
        headers.set('Content-Type', results[0].type);
        headers.set('Cache-Control', 'public, max-age=86400');
        return new Response(Buffer.concat(results.map(({ file }) => Buffer.from(file))), { headers });
      }
      if (pathname === '/api/admin/participation') await requireAdmin(request);
      const row = await env.DB.prepare('SELECT body FROM election_state WHERE id = 1').first();
      if (!row) return json({ code: 'unavailable' }, 503);
      const state = JSON.parse(row.body);
      const round = state.rounds?.[state.activeRoundId];
      const settings = round?.public ?? {};
      if (pathname === '/api/round') return json({ roundId: state.activeRoundId, settings });
      if (pathname === '/api/admin/participation') {
        if (!env.VOTER_HASH_SECRET) throw new Error('Missing VOTER_HASH_SECRET');
        const snapshot = adminElection.participationSnapshot(state, env.VOTER_HASH_SECRET);
        headers.set('Content-Type', 'text/event-stream; charset=utf-8');
        return new Response(`data: ${JSON.stringify(snapshot)}\n\n`, { headers });
      }

      const { schedule, manualClosed } = settings;
      const now = Date.now();
      if (!schedule || now < schedule.publish || (!manualClosed && now < schedule.close)) {
        return json({ code: 'permission-denied' }, 403);
      }
      return json(roomResults(state, round));
    } catch (error) {
      if (Object.hasOwn(errorStatuses, error.code)) return json({ code: error.code, message: error.message }, errorStatuses[error.code]);
      return json({ code: 'unavailable' }, 503);
    }
  }
};
