const { createServer } = require('node:http');
const { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync } = require('node:fs');
const { join, dirname, extname } = require('node:path');
const { homedir } = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const functionDependencies = createRequire(join(__dirname, 'functions', 'package.json'));
const { initializeApp } = functionDependencies('firebase-admin/app');
const { getAuth } = functionDependencies('firebase-admin/auth');
const projectId = 'elec114-sbs';
initializeApp({ projectId });

const port = Number(process.env.ELECTION_PORT || 8081);
const loopback = `http://127.0.0.1:${port}`;
const publicURL = process.env.ELECTION_PUBLIC_URL ? new URL(process.env.ELECTION_PUBLIC_URL) : null;
const webOrigin = process.env.ELECTION_WEB_ORIGIN ? new URL(process.env.ELECTION_WEB_ORIGIN).origin : null;
if (webOrigin && !webOrigin.startsWith('https://')) throw new Error('ELECTION_WEB_ORIGIN must use HTTPS');
if (publicURL && (publicURL.protocol !== 'https:' || publicURL.pathname !== '/' || publicURL.search || publicURL.hash)) {
  throw new Error('ELECTION_PUBLIC_URL must be an HTTPS origin');
}

function electionDatabasePath() {
  if (process.env.ELECTION_DATA_FILE) return process.env.ELECTION_DATA_FILE;
  const appData = process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  const target = join(appData, 'OracleElection2569', 'election.private.sqlite');
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const legacy = join(__dirname, 'election.private.sqlite');
  if (!existsSync(target) && existsSync(legacy)) {
    const staging = mkdtempSync(join(dirname(target), 'migration-'));
    const copy = join(staging, 'election.sqlite');
    const existing = new DatabaseSync(legacy, { readOnly: true });
    try {
      existing.prepare('VACUUM INTO ?').run(copy);
      try { linkSync(copy, target); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    } finally {
      existing.close();
      if (existsSync(copy)) unlinkSync(copy);
      rmdirSync(staging);
    }
  }
  return target;
}

const db = new DatabaseSync(electionDatabasePath());
db.exec(`
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS election_state (id INTEGER PRIMARY KEY, body TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS election_secret (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS candidate_photos (path TEXT PRIMARY KEY, type TEXT NOT NULL, file BLOB NOT NULL);
`);
const findState = db.prepare('SELECT body FROM election_state WHERE id = 1');
const updateState = db.prepare('UPDATE election_state SET body = ? WHERE id = 1');
if (!findState.get()) {
  const seed = JSON.parse(readFileSync(join(__dirname, 'voters-import.private.json'), 'utf8'));
  const initial = { activeRoundId: 1, privateVoters: seed.privateVoters, rounds: {
    1: { eligible: seed.eligible, public: { manualClosed: false } }
  }};
  db.prepare('INSERT OR IGNORE INTO election_state VALUES (1, ?)').run(JSON.stringify(initial));
}
db.prepare('INSERT OR IGNORE INTO election_secret VALUES (1, ?)').run(randomBytes(48).toString('hex'));
const secret = db.prepare('SELECT value FROM election_secret WHERE id = 1').get().value;
const readState = () => JSON.parse(findState.get().body);
const findPhoto = db.prepare('SELECT type, file FROM candidate_photos WHERE path = ?');
const insertPhoto = db.prepare('INSERT INTO candidate_photos VALUES (?, ?, ?)');

function ref(parts = []) {
  const locate = (root) => parts.reduce((value, key) => value?.[key], root);
  return {
    child: (relativePath) => ref([...parts, ...relativePath.split('/')]),
    async get() { const value = locate(readState()); return { val: () => value ?? null }; },
    async transaction(update) {
      db.exec('BEGIN IMMEDIATE');
      try {
        let state = readState();
        const value = update(locate(state) ?? null);
        if (value === undefined) {
          db.exec('ROLLBACK');
          return { committed: false };
        }
        if (parts.length === 0) state = value;
        else {
          let parent = state;
          for (const key of parts.slice(0, -1)) parent = (parent[key] ??= {});
          if (value === null) delete parent[parts.at(-1)];
          else parent[parts.at(-1)] = value;
        }
        updateState.run(JSON.stringify(state));
        db.exec('COMMIT');
        return { committed: true, snapshot: { val: () => value } };
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

const getDatabase = () => ({ ref: (name) => {
  if (name !== 'election') throw new Error('Unexpected database path');
  return ref();
} });
const voterSecret = { value: () => secret };
const { verifyVoter, castVote } = require('./functions/voting')(getDatabase, voterSecret);
const adminElection = require('./functions/admin-election');
const manageElection = adminElection(getDatabase, voterSecret, (url, roundId, candidateId) =>
  new RegExp(`^/api/photos/${roundId}/${candidateId}/[a-f0-9-]{36}$`).test(url) && Boolean(findPhoto.get(url))
);
const assets = new Set([
  '/index.html', '/vote.html', '/styles.css', '/admin.css', '/election.css', '/results.css',
  '/script.js', '/results.js', '/firebase-config.js', '/cloud-admin.js', '/election-api.js', '/server-config.js',
  '/background-music.js', '/background-music.css', '/background-music.mp3'
]);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mp3': 'audio/mpeg'
};

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    .end(JSON.stringify(body));
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request too large'), { code: 'resource-exhausted' });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readAdmin(request) {
  const token = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '')?.[1];
  try {
    if (token) {
      const claims = await getAuth().verifyIdToken(token);
      if (claims.admin === true) return { uid: claims.uid, token: claims };
    }
  } catch { /* Return the same authorization error for invalid and missing tokens. */ }
  throw Object.assign(new Error('ต้องใช้บัญชีผู้ดูแลระบบ'), { code: 'permission-denied' });
}

function publicRound() {
  const state = readState();
  const roundId = state.activeRoundId;
  return { roundId, settings: state.rounds?.[roundId]?.public ?? {} };
}

const statuses = { 'permission-denied': 403, unauthenticated: 401, 'invalid-argument': 400,
  'already-exists': 409, aborted: 409, 'failed-precondition': 412, 'resource-exhausted': 429 };
const participationStreams = new Set();

function broadcastParticipation() {
  if (!participationStreams.size) return;
  const event = `data: ${JSON.stringify(adminElection.participationSnapshot(readState(), secret))}\n\n`;
  for (const stream of participationStreams) {
    if (!stream.writableEnded && !stream.destroyed && !stream.write(event)) stream.end();
  }
}

async function streamParticipation(request, response) {
  await readAdmin(request);
  if (response.destroyed) return;
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no'
  });
  participationStreams.add(response);
  const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15000);
  // Reconnect periodically so new requests verify the current authorization token.
  const expiry = setTimeout(() => response.end(), 90000);
  response.once('close', () => {
    participationStreams.delete(response);
    clearInterval(heartbeat);
    clearTimeout(expiry);
  });
  const data = adminElection.participationSnapshot(readState(), secret);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const requestHost = request.headers.host;
  const localHost = requestHost === new URL(loopback).host || requestHost === `localhost:${port}`;
  if (!localHost && requestHost !== publicURL?.host) return send(response, 403, {});
  const origin = request.headers.origin;
  const localPreview = !publicURL && localHost && /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin ?? '');
  const allowedOrigin = !origin || localPreview || [loopback, `http://localhost:${port}`, publicURL?.origin, webOrigin].includes(origin);
  if (!allowedOrigin) return send(response, 403, {});
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  const pathname = request.url.split('?')[0];
  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    return response.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }).end();
  }
  try {
    if (request.method === 'GET') {
      if (pathname === '/server-config.js') {
        return response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' })
          .end('window.electionAPIBase = location.origin;');
      }
      if (pathname === '/api/round') return send(response, 200, publicRound());
      if (pathname === '/api/admin/participation') return await streamParticipation(request, response);
      if (pathname === '/api/results') {
        const state = readState();
        const round = state.rounds?.[state.activeRoundId];
        const { schedule, manualClosed } = round?.public ?? {};
        const now = Date.now();
        if (!schedule || now < schedule.publish || (!manualClosed && now < schedule.close)) return send(response, 403, {});
        const eligible = Object.entries(state.privateVoters ?? {}).filter(([id, voter]) =>
          voter.enabled === true && round.eligible?.[id] === true);
        const roomMembers = {};
        for (const [, voter] of eligible) {
          const roomNumber = /\/(1[0-2]|[1-9])$/.exec(voter.room)?.[1];
          if (roomNumber) roomMembers[roomNumber] = (roomMembers[roomNumber] ?? 0) + 1;
        }
        const sum = (values) => Object.values(values ?? {}).reduce((total, count) => total + (Number(count) || 0), 0);
        const total = sum(round.tallies);
        const recordedByRoom = Object.values(round.roomTallies ?? {}).reduce((count, room) => count + sum(room), 0);
        return send(response, 200, {
          roundId: state.activeRoundId, tallies: round.tallies ?? {}, total,
          eligibleCount: eligible.length, roomMembers,
          roomTallies: recordedByRoom === total ? round.roomTallies ?? {} : null
        });
      }
      if (/^\/api\/photos\/\d+\/\d+\/[a-f0-9-]{36}$/.test(pathname)) {
        const photo = findPhoto.get(pathname);
        if (!photo) return send(response, 404, {});
        return response.writeHead(200, { 'Content-Type': photo.type, 'Cache-Control': 'public, max-age=86400' }).end(photo.file);
      }
      const asset = pathname === '/' ? '/index.html' : pathname;
      if (assets.has(asset)) {
        const file = readFileSync(join(__dirname, asset.slice(1)));
        return response.writeHead(200, { 'Content-Type': contentTypes[extname(asset)], 'Cache-Control': 'no-cache' }).end(file);
      }
    }
    if (request.method === 'POST') {
      const photoUpload = /^\/api\/photos\/([1-9]\d*)\/([1-9]\d{0,2})$/.exec(pathname);
      if (photoUpload) {
        await readAdmin(request);
        if (Number(photoUpload[1]) !== publicRound().roundId) return send(response, 409, {});
        const type = request.headers['content-type'];
        const photo = await readBody(request, 5 * 1024 * 1024);
        const valid = (type === 'image/jpeg' && photo.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) ||
          (type === 'image/png' && photo.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) ||
          (type === 'image/webp' && photo.subarray(0, 4).toString() === 'RIFF' && photo.subarray(8, 12).toString() === 'WEBP');
        if (!valid) return send(response, 400, { message: 'ไฟล์รูปไม่ถูกต้อง' });
        const photoPath = `${pathname}/${randomUUID()}`;
        insertPhoto.run(photoPath, type, photo);
        return send(response, 201, { photoURL: photoPath });
      }
      const handlers = { '/api/verifyVoter': verifyVoter, '/api/castVote': castVote, '/api/manageElection': manageElection };
      if (Object.hasOwn(handlers, pathname)) {
        if (request.headers['content-type'] !== 'application/json') return send(response, 415, {});
        const auth = pathname === '/api/manageElection' ? await readAdmin(request) : undefined;
        let data;
        try { data = JSON.parse((await readBody(request, 1_000_000)).toString('utf8')); }
        catch (error) { if (error.code) throw error; return send(response, 400, { code: 'invalid-argument' }); }
        const result = await handlers[pathname]({ auth, data });
        if (!response.destroyed) send(response, 200, result);
        if (pathname === '/api/castVote' || (auth && data?.action !== 'read')) broadcastParticipation();
        return;
      }
    }
    return send(response, 404, { code: 'not-found' });
  } catch (error) {
    const status = statuses[error.code];
    if (!status) console.error(error.message);
    if (!response.destroyed && !response.headersSent) send(response, status || 500, {
      code: status ? error.code : 'internal', message: status ? error.message : 'ระบบขัดข้อง'
    });
  }
}).listen(port, process.env.ELECTION_BIND || '127.0.0.1', () => console.log(loopback));
