const { createHmac } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { getApp } = require('firebase-admin/app');
const { HttpsError } = require('firebase-functions/v2/https');

const invalid = (message) => new HttpsError('invalid-argument', message);
const denied = (message) => new HttpsError('failed-precondition', message);
const roomPattern = /^[มป]\.\d{1,2}\/([1-9]\d?)$/;

function participationSnapshot(election, secret) {
  const roundId = election.activeRoundId ?? 1;
  const round = election.rounds?.[roundId] ?? {};
  const roster = Object.entries(election.privateVoters ?? {}).map(([studentId, voter]) => {
    const key = createHmac('sha256', secret).update(`${roundId}:${studentId}`).digest('hex');
    return {
      studentId, name: voter.name, room: voter.room, number: voter.number,
      eligible: voter.enabled === true && round.eligible?.[studentId] === true,
      voted: round.usedVoters?.[key] === true
    };
  });
  const eligible = roster.filter((voter) => voter.eligible);
  return {
    roundId, revision: election.adminRevision ?? 0, roster,
    votedCount: Object.values(round.usedVoters ?? {}).filter((value) => value === true).length,
    eligibleCount: eligible.length,
    pendingCount: eligible.filter((voter) => !voter.voted).length
  };
}

function adminSnapshot(election, secret) {
  const participation = participationSnapshot(election, secret);
  const round = election.rounds?.[participation.roundId] ?? {};
  return { ...participation, candidateColors: true, settings: round.public ?? {}, tallies: round.tallies ?? {}, history: election.history ?? {} };
}

function candidateData(candidate, roundId, previous, isLocalPhoto) {
  const { no, name, team = '', vision = '', room = '', photoURL = '', color = previous?.color } = candidate ?? {};
  if (!Number.isInteger(no) || no < 1 || no > 999 ||
      typeof name !== 'string' || !name.trim() || name.length > 150 ||
      ![team, vision, room].every((value) => typeof value === 'string' && value.length <= 2000) ||
      typeof photoURL !== 'string' || photoURL.length > 2048) throw invalid('ข้อมูลผู้สมัครไม่ถูกต้อง');
  if (color !== undefined && (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color))) {
    throw invalid('สีผู้สมัครต้องเป็นรหัสสี Hex 6 หลัก');
  }
  if (photoURL && photoURL !== previous?.photoURL && !isLocalPhoto(photoURL, roundId, no)) {
    let url;
    try { url = new URL(photoURL); } catch { throw invalid('URL รูปไม่ถูกต้อง'); }
    const bucket = getApp().options.storageBucket;
    const path = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(url.pathname);
    if (url.origin !== 'https://firebasestorage.googleapis.com' || !bucket ||
        path?.[1] !== bucket ||
        !new RegExp(`^candidate-photos/${roundId}/${no}/[a-f0-9-]{36}$`).test(decodeURIComponent(path[2]))) {
      throw invalid('รูปต้องมาจาก Cloud Storage ของผู้สมัครในรอบนี้');
    }
  }
  return { no, name: name.trim(), team, vision, room, photoURL, ...(color ? { color: color.toLowerCase() } : {}) };
}

function readRoster(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 1000) throw invalid('กรุณาตรวจจำนวนรายชื่อ');
  const seen = new Set();
  const seats = new Set();
  return rows.map((row) => {
    const { studentId, name, room, number } = row ?? {};
    const roomNumber = typeof room === 'string' && roomPattern.exec(room)?.[1];
    if (typeof studentId !== 'string' || !/^\d{5}$/.test(studentId) || seen.has(studentId) ||
        typeof name !== 'string' || !name.trim() || name.length > 150 || !roomNumber ||
        !Number.isInteger(number) || number < 1 || number > 99 || seats.has(`${room}:${number}`)) {
      throw invalid('ทะเบียนมีข้อมูลไม่ถูกต้อง เลขนักเรียนซ้ำ หรือเลขที่ซ้ำในห้อง');
    }
    seen.add(studentId);
    seats.add(`${room}:${number}`);
    return { studentId, name: name.trim(), room, number, roomNumber };
  });
}

function getCandidate(records, id) {
  return Object.hasOwn(records, id) ? records[id] : undefined;
}

module.exports = (getDatabase, voterSecret, isLocalPhoto = () => false, hashPassword = bcrypt.hash) => async ({ auth, data }) => {
  if (auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'ต้องใช้บัญชีผู้ดูแลระบบ');
  const ref = getDatabase().ref('election');
  const { action, roundId, revision } = data ?? {};
  const current = (await ref.get()).val() ?? {};
  if (action === 'read') return adminSnapshot(current, voterSecret.value());
  if (!Number.isSafeInteger(roundId) || roundId < 1 ||
      !Number.isSafeInteger(revision) || revision < 0) throw invalid('ข้อมูลรอบไม่ถูกต้อง');

  function assertCurrent(election) {
    if ((election.activeRoundId ?? 1) !== roundId || (election.adminRevision ?? 0) !== revision) {
      throw new HttpsError('aborted', 'ข้อมูลเปลี่ยนในอีกหน้าหนึ่ง กรุณาโหลดข้อมูลใหม่');
    }
  }
  assertCurrent(current);
  let preparedRoster;
  if (action === 'roster') {
    const rows = readRoster(data.rows);
    preparedRoster = {};
    for (const { studentId, name, room, number, roomNumber } of rows) {
      const existing = current.privateVoters?.[studentId];
      const passwordHash = existing?.room === room && existing.number === number && existing.passwordHash
        ? existing.passwordHash : await hashPassword(`114${roomNumber}${String(number).padStart(2, '0')}`, 12);
      preparedRoster[studentId] = { name, room, number, enabled: true, passwordHash };
    }
  }

  let failure;
  const result = await ref.transaction((snapshot) => {
    failure = null;
    try {
      const election = snapshot ?? {};
      assertCurrent(election);
      election.activeRoundId = roundId;
      const rounds = (election.rounds ??= {});
      const round = (rounds[roundId] ??= {});
      const settings = (round.public ??= {});
      const now = Date.now();
      const schedule = settings.schedule;
      const started = Boolean(round.usedVoters && Object.keys(round.usedVoters).length) || Boolean(schedule && now >= schedule.open);
      const open = schedule && now >= schedule.open && now < schedule.close && settings.manualClosed !== true;

      switch (action) {
        case 'schedule': {
          const { open, close, publish } = data.schedule ?? {};
          if (![open, close, publish].every(Number.isSafeInteger) || open < 0 || open >= close || close > publish) {
            throw invalid('เวลาเปิดต้องอยู่ก่อนเวลาปิด และเวลาประกาศต้องอยู่หลังหรือเท่ากับเวลาปิด');
          }
          settings.schedule = { open, close, publish };
          settings.manualClosed = false;
          break;
        }
        case 'close':
          if (!open) throw denied('หีบไม่ได้เปิดอยู่');
          settings.manualClosed = true;
          break;
        case 'publish':
          if (!schedule || now <= schedule.open || open) throw denied('ปิดหีบก่อนประกาศผล');
          settings.schedule = { ...schedule, close: Math.min(schedule.close, now), publish: now };
          break;
        case 'candidate': {
          let records = (settings.candidates ??= {});
          if (Array.isArray(records)) records = settings.candidates = Object.fromEntries(Object.entries(records).filter(([, value]) => value));
          const candidateNo = data.candidate?.no;
          const existing = Number.isInteger(candidateNo) ? getCandidate(records, candidateNo) : undefined;
          const candidate = candidateData(data.candidate, roundId, existing, isLocalPhoto);
          if (started && (!existing || ['name', 'team', 'vision', 'room'].some((key) => (existing[key] ?? '') !== candidate[key]))) {
            throw denied('หลังเริ่มรอบแล้วแก้ได้เฉพาะรูปและสีของผู้สมัครเดิม');
          }
          records[candidate.no] = candidate;
          break;
        }
        case 'removeCandidate':
          if (started) throw denied('รอบนี้เริ่มแล้ว');
          if (!Number.isInteger(data.candidateId) || data.candidateId < 1 || data.candidateId > 999) throw invalid('หมายเลขผู้สมัครไม่ถูกต้อง');
          if (settings.candidates) delete settings.candidates[data.candidateId];
          break;
        case 'roster':
          if (started) throw denied('รอบนี้เริ่มแล้ว');
          election.privateVoters = preparedRoster;
          round.eligible = Object.fromEntries(Object.keys(preparedRoster).map((id) => [id, true]));
          break;
        case 'eligibility': {
          if (started) throw denied('รอบนี้เริ่มแล้ว');
          const { rooms } = data;
          if (!Array.isArray(rooms) || !rooms.length || !rooms.every((room) => typeof room === 'string' && roomPattern.test(room))) throw invalid('กรุณาเลือกห้อง');
          const enabled = new Set(rooms);
          round.eligible = Object.fromEntries(Object.entries(election.privateVoters ?? {})
            .filter(([, voter]) => voter.enabled === true && enabled.has(voter.room)).map(([id]) => [id, true]));
          break;
        }
        case 'archive': {
          if (open || !started) throw denied('เก็บประวัติได้หลังปิดหีบ');
          if (!Number.isSafeInteger(roundId + 1) || rounds[roundId + 1]) throw denied('หมายเลขรอบถัดไปถูกใช้งานแล้ว');
          (election.history ??= {})[roundId] = {
            ended: now, candidates: settings.candidates ?? {}, tallies: round.tallies ?? {}
          };
          election.activeRoundId = roundId + 1;
          rounds[roundId + 1] = {
            eligible: { ...round.eligible, ...election.nextRoundEligible },
            public: { manualClosed: false }
          };
          delete election.nextRoundEligible;
          if (settings.candidates) rounds[roundId + 1].public.candidates = settings.candidates;
          break;
        }
        default: throw invalid('ไม่รู้จักคำสั่ง');
      }
      election.adminRevision = revision + 1;
      return election;
    } catch (error) {
      failure = error;
      return snapshot === null ? null : undefined;
    }
  }, undefined, false);
  if (failure) throw failure;
  if (!result.committed) throw new HttpsError('aborted', 'บันทึกการเปลี่ยนแปลงไม่สำเร็จ');
  return adminSnapshot(result.snapshot.val(), voterSecret.value());
};

module.exports.participationSnapshot = participationSnapshot;
