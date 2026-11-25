const candidateThemes = [
  {
    "color": "#9a5874",
    "icon": "✧"
  },
  {
    "color": "#6a668f",
    "icon": "☾"
  },
  {
    "color": "#ac8440",
    "icon": "✦"
  }
];
const retiredSampleCandidates = [[1,"พิมพ์ชนก ใจดี","ทีมก้าวไปด้วยกัน"],[2,"ณัฐวุฒิ แสงทอง","ทีมพลังฝัน"],[3,"กัญญาภัค รุ่งเรือง","ทีมวันใหม่"]];

const storageKeys = {
  rosterChanged: 'election2569-roster-changed',
  open: 'election2569-open',
  started: 'election2569-started',
  votes: 'election2569-votes',
  candidates: 'election2569-candidates',
  control: 'election2569-control'
};
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

function readControl() {
  const defaults = { round: 1, roundId: 1, rooms: null, schedule: null, manual: null, published: false, history: [] };
  if (useCloudRound) return { ...defaults, ...cloudRound };
  try {
    const stored = JSON.parse(localStorage.getItem(storageKeys.control));
    const saved = { ...defaults, ...stored };
    delete saved.roster;
    if (Array.isArray(saved.rooms) && rosterAvailable) {
      const rosterRooms = new Set(roster.map((voter) => voter.room));
      const rooms = saved.rooms.filter((room) => rosterRooms.has(room));
      saved.rooms = rooms.length ? rooms : null;
    }
    saved.history = Array.isArray(saved.history) ? saved.history : [];
    const round = Number(saved.round);
    saved.round = Number.isSafeInteger(round) && round > 0 ? round : 1;
    const roundId = Number(stored?.roundId);
    if (Number.isSafeInteger(roundId) && roundId > 0) {
      saved.roundId = roundId;
    } else {
      for (const entry of saved.history) {
        const archivedRound = Number(entry?.number);
        if (Number.isSafeInteger(archivedRound) && archivedRound >= saved.round) saved.round = archivedRound + 1;
      }
      saved.roundId = saved.round;
    }
    return saved;
  }
  catch { return defaults; }
}

function showNotice({ title, message, action = '', tone = 'info' }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'system-notice';
    dialog.dataset.tone = tone;
    dialog.setAttribute('aria-labelledby', 'systemNoticeTitle');
    dialog.setAttribute('aria-describedby', 'systemNoticeMessage');
    if (action) dialog.setAttribute('role', 'alertdialog');
    dialog.innerHTML = `<form method="dialog">
      <div class="system-notice-content">
        <span class="system-notice-icon" aria-hidden="true">${tone === 'danger' ? '!' : 'i'}</span>
        <h2 id="systemNoticeTitle"></h2>
        <p id="systemNoticeMessage"></p>
      </div>
      <div class="system-notice-actions">
        ${action ? '<button type="submit" value="cancel" autofocus>ยกเลิก</button>' : ''}
        <button type="submit" value="accept" class="system-notice-primary" ${action ? '' : 'autofocus'}></button>
      </div>
    </form>`;
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('p').textContent = message;
    dialog.querySelector('.system-notice-primary').textContent = action || 'รับทราบ';
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(dialog.returnValue === 'accept');
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
}

function confirmAction(message, action) {
  return showNotice({ title: 'คุณแน่ใจไหม?', message, action, tone: 'danger' });
}

function showFeedback(element, message, tone = 'error') {
  element.classList.add('system-feedback');
  element.dataset.tone = tone;
  element.textContent = message;
}

document.addEventListener('invalid', async (event) => {
  const field = event.target;
  event.preventDefault();
  if (document.querySelector('.system-notice[open]')) return;
  const message = field.validity.valueMissing ? 'กรุณากรอกข้อมูลในช่องที่ระบุ'
    : field.validity.typeMismatch && field.type === 'email' ? 'กรุณาตรวจสอบรูปแบบอีเมล'
    : field.validationMessage;
  await showNotice({ title: 'ตรวจสอบข้อมูลที่กรอก', message });
  if (field.isConnected) field.focus();
}, true);

let roster = window.initialVoterRoster ?? [];
let rosterAvailable = Array.isArray(window.initialVoterRoster);
const voterDatabaseAvailable = window.voterDatabaseAvailable === true;
const cloudReadEnabled = true;
const useCloudRound = cloudReadEnabled && Boolean(document.querySelector('#electionContent'));
let cloudRound = null;
let cloudCandidates = [];
let displayedCloudPhase;
let roundServiceUnavailable = false;
let control = readControl();
function loadCandidates() {
  if (useCloudRound) return cloudCandidates;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKeys.candidates) || 'null');
    return Array.isArray(saved) ? saved.filter((candidate) => !retiredSampleCandidates.some(([no, name, team]) =>
      candidate.no === no && candidate.name === name && candidate.team === team)) : [];
  } catch { return []; }
}
let candidates = loadCandidates();
const getRoster = () => roster;
const eligibleVoters = () => getRoster().filter((voter) => !control.rooms || control.rooms.includes(voter.room));
const voteKey = () => control.roundId === 1 ? storageKeys.votes : `${storageKeys.votes}-${control.roundId}`;
let votingSession = null;
let recordedRound = null;
let ballotDropRound = null;

function getElectionPhase(now = Date.now(), state = useCloudRound ? cloudRound : control) {
  if (!state) return 'waiting';
  const schedule = state.schedule;
  if (state.manual === 'closed') {
    return state.published || !schedule || now >= schedule.publish ? 'published' : 'closed';
  }
  if (schedule) {
    if (now < schedule.open) return 'waiting';
    if (now < schedule.close) return 'open';
    return state.published || now >= schedule.publish ? 'published' : 'closed';
  }
  if (useCloudRound || state === cloudRound) return 'waiting';
  const legacyStarted = control.roundId === 1 && localStorage.getItem(storageKeys.started) === 'true';
  if (control.published || (legacyStarted && localStorage.getItem(storageKeys.open) !== 'true')) return 'published';
  return getVotes().length ? 'closed' : 'waiting';
}

let electionPhase = getElectionPhase();
let electionOpen = electionPhase === 'open';
let selectedCandidate = null;

const adminDialog = document.querySelector('#adminDialog');
adminDialog?.addEventListener('close', stopAdminParticipation);
const electionContent = document.querySelector('#electionContent');
const gatewayStatus = document.querySelector('#gatewayStatus');
const planetLink = document.querySelector('.planet-link');

planetLink?.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey
    || event.shiftKey || event.altKey || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  event.preventDefault();
  if (planetLink.querySelector('.vote-sparks')) return;

  const sparks = document.createElement('span');
  sparks.className = 'vote-sparks';
  sparks.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 10; index += 1) {
    const spark = document.createElement('i');
    const angle = index * Math.PI / 5;
    const distance = index % 2 ? 72 : 98;
    spark.style.setProperty('--spark-x', `${Math.cos(angle) * distance}px`);
    spark.style.setProperty('--spark-y', `${Math.sin(angle) * distance}px`);
    spark.textContent = index % 2 ? '✧' : '✦';
    sparks.append(spark);
  }
  planetLink.append(sparks);
  window.setTimeout(() => {
    sparks.remove();
    window.location.assign(planetLink.href);
  }, 240);
});

function getVotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(voteKey()) || '[]');
    return Array.isArray(saved) ? saved : [];
  }
  catch { return []; }
}

const adminOpen = document.querySelector('#adminOpen');
adminOpen?.addEventListener('click', () => {
  renderAdminLogin();
  adminDialog.showModal();
});
if (window.location.hash === '#admin' && rosterAvailable) adminOpen?.click();
document.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => document.querySelector(`#${button.dataset.close}`).close());
});

function electionNotice(title, message, icon = '☾') {
  return `<div class="election-notice"><div class="notice-icon">${icon}</div><small>ORACLE ELECTION · 2569</small><h3>${title}</h3><p>${message}</p><span>หนึ่งสิทธิ · หนึ่งเสียง · หนึ่งคำพยากรณ์</span></div>`;
}

function countdownMarkup(deadline, labelId) {
  return `<div class="countdown-clock" role="timer" aria-labelledby="${labelId}" data-deadline="${deadline}">
    ${['ชั่วโมง', 'นาที', 'วินาที'].map((unit) => `<div><b>00</b><span>${unit}</span></div>`).join('')}
  </div>`;
}

function updateCountdown() {
  const timer = document.querySelector('.countdown-clock[data-deadline]');
  if (!timer) return;
  const deadline = Number(timer.dataset.deadline);
  if (!Number.isFinite(deadline)) return;
  const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const finale = String(seconds <= 10);
  if (timer.dataset.finale !== finale) timer.dataset.finale = finale;
  const units = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  timer.querySelectorAll('b').forEach((digit, index) => {
    const value = String(units[index]).padStart(2, '0');
    if (digit.textContent === value) return;
    digit.textContent = value;
    digit.dataset.tick = String(units[index] % 2);
  });
}

function renderResultsWaiting(voteRecorded) {
  const waitingForClose = electionPhase === 'open';
  const deadline = waitingForClose ? control.schedule?.close : control.schedule?.publish;
  const label = waitingForClose ? 'ปิดหีบ' : 'ประกาศผล';
  const title = voteRecorded ? 'บันทึกเสียงของคุณแล้ว' : 'ปิดหีบเลือกตั้งแล้ว';
  electionContent.innerHTML = `<section class="election-notice election-countdown">
    <div class="countdown-orbit" aria-hidden="true"><i></i><i></i><div class="notice-icon">☾</div></div>
    <h3>${title}</h3>
    ${deadline ? `<p id="countdownLabel">เหลือเวลาอีกก่อน${label}</p>
      ${countdownMarkup(deadline, 'countdownLabel')}
      <p>${label} <time datetime="${new Date(deadline).toISOString()}">${formatBangkok(deadline)}</time> น. (เวลาไทย)</p>`
      : '<p>โปรดติดตามกำหนดการประกาศผลจากโรงเรียน</p>'}
    <a class="small-action result-vote-link" href="index.html#vote">กลับหน้าแรก</a>
  </section>`;
  updateCountdown();
}

let resultsRequest = 0;
let revealedResultsRound = null;

function revealElectionResults(aggregate) {
  if (revealedResultsRound === control.roundId) return;
  revealedResultsRound = control.roundId;
  animateResultsOpening(electionContent, aggregate);
}

async function renderCloudResults() {
  const request = ++resultsRequest;
  const dashboard = electionContent.querySelector('.results-dashboard');
  if (!dashboard) electionContent.innerHTML = electionNotice('ผลการเลือกตั้ง', 'กำลังโหลดผลคะแนน');
  const roundId = control.roundId;
  try {
    const result = await electionRequest('/api/results');
    if (request !== resultsRequest || result.roundId !== roundId || control.roundId !== roundId || getElectionPhase() !== 'published') return;
    renderResultsDashboard(electionContent, [], result);
    revealElectionResults(result);
  } catch {
    if (request === resultsRequest && !dashboard && control.roundId === roundId && getElectionPhase() === 'published') {
      electionContent.innerHTML = electionNotice('ผลการเลือกตั้ง', 'โหลดผลคะแนนไม่ได้ กรุณาโหลดหน้าใหม่');
    }
  }
}

function renderElection() {
  if (!electionContent) return;
  if (ballotDropRound === control.roundId) return;
  if (electionPhase === 'published' && revealedResultsRound === control.roundId &&
      electionContent.querySelector('.results-reveal')) return;
  resultsRequest++;
  const heading = document.querySelector('.voting-heading h1');
  document.body.classList.toggle('results-page', electionPhase === 'published');
  heading.textContent = electionPhase === 'published' ? 'ผลการเลือกตั้ง' : 'ใช้สิทธิ์เลือกตั้ง';
  if (electionPhase === 'published') {
    if (useCloudRound) void renderCloudResults();
    else {
      renderResultsDashboard(electionContent, getVotes());
      revealElectionResults();
    }
    return;
  }
  if (electionPhase === 'waiting') {
    electionContent.innerHTML = roundServiceUnavailable
      ? electionNotice('ระบบลงคะแนนยังไม่พร้อม', 'เชื่อมต่อเซิร์ฟเวอร์เลือกตั้งไม่ได้ กรุณาแจ้งผู้ดูแล')
      : electionNotice('ยังไม่เปิดหีบเลือกตั้ง', 'ผู้ดูแลยังไม่ได้เปิดระบบเลือกตั้ง โปรดกลับมาตรวจสอบอีกครั้ง');
    return;
  }
  const voteRecorded = recordedRound === control.roundId;
  if (electionPhase === 'closed' || voteRecorded) {
    renderResultsWaiting(voteRecorded);
    return;
  }
  if (!candidates.length) {
    electionContent.innerHTML = electionNotice('ยังไม่มีรายชื่อผู้สมัคร', 'กรุณารอผู้ดูแลบันทึกรายชื่อผู้สมัครจริง');
    return;
  }
  if (votingSession?.roundId === control.roundId && votingSession.expiresAt > Date.now()) renderCandidates();
  else renderLogin();
}

function renderLogin() {
  electionContent.innerHTML = `<div class="election-register">
    <div class="register-visual"><span class="register-kicker">ELECTION · 2569</span><div class="register-orbit"><i>✦</i><b>หนึ่งสิทธิ<br>หนึ่งเสียง</b></div><h3>เสียงของคุณ<br><em>กำหนดอนาคต</em></h3><p>ยืนยันตัวตนก่อนเปิดไพ่ผู้สมัคร และเข้าสู่คูหาเลือกตั้ง</p></div>
    <div class="election-login"><div class="step-chip">ขั้นตอน 1 จาก 3 · ลงทะเบียน</div><h3>ลงทะเบียนใช้สิทธิ</h3><p>กรอกข้อมูลเพื่อเข้าสู่การเลือกตั้งประธานรุ่น</p><form id="loginForm">
      <div class="field"><label for="studentId">เลขประจำตัวนักเรียน</label><input id="studentId" name="studentId" required inputmode="numeric" maxlength="5" pattern="[0-9]{5}" autocomplete="username" placeholder="เลขประจำตัว 5 หลัก"></div>
      <div class="field"><label for="password">รหัสผ่าน</label><input id="password" name="voterPassword" required type="password" inputmode="numeric" minlength="6" maxlength="7" pattern="[0-9]{6,7}" autocomplete="current-password" aria-describedby="voterPasswordHelp" placeholder="รหัสผ่าน 6–7 หลัก"></div>
      <div class="note password-help" id="voterPasswordHelp">
        <strong>114 + เลขห้อง + เลขที่สองหลัก</strong>
        <span>พิมพ์ตัวเลขต่อกัน ถ้าเลขที่มีหลักเดียวให้เติม 0 ข้างหน้า</span>
        <span>ห้อง 5 เลขที่ 1 ใช้ <b>114501</b> · ห้อง 10 เลขที่ 1 ใช้ <b>1141001</b></span>
      </div>
      <div class="error" id="loginError" aria-live="polite"></div><button class="primary election-action" type="submit">ตรวจสอบสิทธิ์และลงทะเบียน <b>→</b></button></form></div>
  </div>`;
  document.querySelector('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    syncElectionPage();
    if (!electionOpen || !form.isConnected) return;
    const studentId = document.querySelector('#studentId').value.trim();
    const password = document.querySelector('#password').value.trim();
    if (!/^\d{5}$/.test(studentId) || !/^\d{6,7}$/.test(password)) {
      showFeedback(document.querySelector('#loginError'), 'กรุณากรอกเลขประจำตัว 5 หลัก และรหัสผ่าน 6–7 หลัก');
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    const roundId = control.roundId;
    try {
      const data = await electionRequest('/api/verifyVoter', { data: { studentId, password, roundId } });
      if (!form.isConnected || control.roundId !== roundId) return;
      if (typeof data?.votingToken !== 'string' || !Number.isFinite(data.expiresAt)) throw new Error('Invalid voting session');
      votingSession = { token: data.votingToken, expiresAt: data.expiresAt, roundId };
      form.reset();
      renderElection();
    } catch (error) {
      if (error.code === 'functions/already-exists' && control.roundId === roundId && form.isConnected) {
        form.reset();
        votingSession = null;
        recordedRound = roundId;
        renderElection();
        return;
      }
      const messages = {
        'functions/not-found': 'บริการตรวจสอบสิทธิ์ยังไม่เปิดใช้งาน กรุณาแจ้งผู้ดูแล',
        'functions/unavailable': 'ขณะนี้ติดต่อบริการตรวจสอบสิทธิ์ไม่ได้ กรุณาลองอีกครั้ง',
        'functions/unauthenticated': 'ระบบยังยืนยันการเชื่อมต่อกับบริการตรวจสอบสิทธิ์ไม่ได้ กรุณาแจ้งผู้ดูแล',
        'functions/permission-denied': 'เลขประจำตัวหรือรหัสผ่านไม่ถูกต้อง หรือไม่มีสิทธิ์ในรอบนี้',
        'functions/failed-precondition': 'ขณะนี้หีบเลือกตั้งไม่เปิดรับคะแนน',
        'functions/resource-exhausted': 'ลองรหัสหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่'
      };
      showFeedback(form.querySelector('#loginError'), messages[error.code] ?? 'ยืนยันตัวตนไม่ได้ กรุณาลองอีกครั้ง');
    } finally {
      button.disabled = false;
    }
  });
}

const galleryPortraits = new Map();

function prepareVotingPortraits(selector) {
  for (const image of electionContent.querySelectorAll(selector)) {
    const key = image.dataset.electionPhoto || image.src;
    if (!galleryPortraits.has(key)) {
      const task = candidatePortraitSource(image)
        .then((source) => source ? resolveResultPortrait(source, '', 1200, 0) : null)
        .catch(() => null);
      galleryPortraits.set(key, task);
    }
    const task = galleryPortraits.get(key);
    void task.then(async (portrait) => {
      if (!portrait?.hasTransparency) {
        if (galleryPortraits.get(key) === task) galleryPortraits.delete(key);
        return;
      }
      if (!image.isConnected) return;
      const decoded = await loadResultPhoto(portrait.src).catch(() => null);
      if (!decoded || !image.isConnected) return;
      image.closest('.candidate-profile-image')?.classList.add('has-cutout');
      image.src = portrait.src;
    });
  }
}

function renderCandidates() {
  electionContent.innerHTML = `<section class="candidate-gallery" aria-labelledby="candidateGalleryTitle">
    <header class="candidate-gallery-header">
      <p>ขั้นตอน 2 จาก 3</p>
      <h3 id="candidateGalleryTitle">รู้จักผู้สมัคร</h3>
    </header>
    <div class="candidate-gallery-grid">${candidates.map((candidate) => {
      const room = candidate.room?.trim();
      const team = candidate.team?.trim();
      const vision = candidate.vision?.trim();
      const details = [...new Set([room, team].filter(Boolean))];
      const color = /^#[\da-f]{6}$/i.test(candidate.color) ? candidate.color : '#8568a3';
      return `<article class="candidate-profile" style="--profile-color:${color}">
        <div class="candidate-profile-image">
          <span class="candidate-profile-orbit" aria-hidden="true"><i>✦</i><i>✧</i></span>
          ${candidatePhoto(candidate)}
          <span class="candidate-profile-number">หมายเลข <b>${escapeHTML(candidate.no)}</b></span>
        </div>
        <div class="candidate-profile-content">
          <h4>${escapeHTML(candidate.name)}</h4>
          ${details.length ? `<p class="candidate-profile-meta">${details.map(escapeHTML).join(' · ')}</p>` : ''}
          ${vision ? `<div class="candidate-profile-vision"><h5>วิสัยทัศน์</h5><p>${escapeHTML(vision)}</p></div>` : ''}
        </div>
      </article>`;
    }).join('')}</div>
    <footer class="candidate-gallery-actions"><button class="primary election-action" id="openBallot" type="button">เข้าสู่คูหา <b aria-hidden="true">→</b></button></footer>
  </section>`;
  prepareVotingPortraits('.candidate-profile-image img');
  document.querySelector('#openBallot').addEventListener('click', renderBallot);
}

function renderBallot() {
  selectedCandidate = null;
  electionContent.innerHTML = `<div class="ballot-room"><div class="step-chip">ขั้นตอน 3 จาก 3 · บัตรเลือกตั้ง</div><div class="official-ballot"><div class="ballot-watermark">2569</div><header><span>บัตรเลือกตั้งประธานรุ่น</span><b>เลือกได้เพียงหมายเลขเดียว</b></header>${candidates.map((candidate) => `<button class="ballot-option" type="button" data-candidate="${candidate.no}" aria-pressed="false"><span class="ballot-box" aria-hidden="true"><i class="ink-one"></i><i class="ink-two"></i><span class="animated-pen" aria-hidden="true">&#x2712;&#xFE0E;</span></span><span class="ballot-no">${candidate.no}</span><span class="ballot-name">${candidatePhoto(candidate)}<small>ผู้สมัครหมายเลข ${candidate.no}</small><b>${escapeHTML(candidate.name)}</b><small>${escapeHTML(candidate.team)}</small></span></button>`).join('')}<button class="primary election-action" id="submitVote" type="button">พับบัตรและหย่อนลงหีบ <b>→</b></button><div class="error" id="voteError" aria-live="polite"></div></div></div>`;
  prepareVotingPortraits('.ballot-name img');
  document.querySelectorAll('.ballot-option').forEach((option) => option.addEventListener('click', () => {
    if (document.querySelector('#submitVote').disabled || selectedCandidate === option.dataset.candidate) return;
    document.querySelectorAll('.ballot-option').forEach((item) => {
      const checked = item === option;
      item.classList.toggle('selected', checked);
      item.setAttribute('aria-pressed', String(checked));
    });
    selectedCandidate = option.dataset.candidate;
  }));
  document.querySelector('#submitVote').addEventListener('click', submitVote);
}

function playBallotDrop(roundId) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    renderElection();
    return;
  }
  ballotDropRound = roundId;
  electionContent.innerHTML = `<section class="ballot-drop" aria-labelledby="ballotDropTitle" tabindex="-1">
    <div class="ballot-drop-stage" aria-hidden="true">
      <div class="ballot-drop-orbit"></div>
      <div class="ballot-drop-paper"><span>✕</span></div>
      <div class="ballot-drop-box"><div class="ballot-drop-slot"></div><span>☾</span></div>
      <div class="ballot-drop-flare"><span>✦</span><span>✧</span><span>✦</span></div>
    </div>
    <h3 id="ballotDropTitle">บันทึกเสียงของคุณแล้ว</h3>
  </section>`;
  const scene = electionContent.querySelector('.ballot-drop');
  scene.focus({ preventScroll: true });
  scene.scrollIntoView({ block: 'start' });
  const timeout = setTimeout(finish, 2400);
  function finish() {
    clearTimeout(timeout);
    if (!scene.isConnected || ballotDropRound !== roundId) return;
    ballotDropRound = null;
    renderElection();
  }
  scene.addEventListener('animationend', (event) => {
    if (event.target === scene && event.animationName === 'ballot-drop-scene') finish();
  });
}

async function submitVote() {
  syncElectionPage();
  const error = document.querySelector('#voteError');
  const button = document.querySelector('#submitVote');
  if (!error || !button || button.disabled) return;
  if (!selectedCandidate) { showFeedback(error, 'กรุณากากบาทเลือกผู้สมัคร 1 คนก่อนส่งบัตร'); return; }
  if (readControl().roundId !== control.roundId || getElectionPhase() !== 'open') {
    syncElectionPage();
    return;
  }
  if (!candidates.some((candidate) => String(candidate.no) === selectedCandidate)) {
    showFeedback(error, 'กรุณาเลือกผู้สมัครจากบัตรใบปัจจุบัน');
    return;
  }
  const roundId = control.roundId;
  if (votingSession?.roundId !== roundId || votingSession.expiresAt <= Date.now()) {
    votingSession = null;
    renderElection();
    const loginError = document.querySelector('#loginError');
    if (loginError) showFeedback(loginError, 'หมดเวลายืนยันสิทธิ์ กรุณากรอกข้อมูลอีกครั้ง');
    return;
  }
  const { token: votingToken } = votingSession;
  button.disabled = true;
  let confirmedNow = false;
  try {
    await sendBallot({ votingToken, roundId, candidateId: selectedCandidate });
    confirmedNow = true;
  } catch (failure) {
    if (failure.code !== 'functions/already-exists') {
      if (failure.code === 'functions/unauthenticated' && control.roundId === roundId) {
        votingSession = null;
        renderElection();
        const loginError = document.querySelector('#loginError');
        if (loginError) showFeedback(loginError, 'หมดเวลายืนยันสิทธิ์ กรุณากรอกข้อมูลอีกครั้ง');
        return;
      }
      const messages = {
        'functions/permission-denied': 'บัญชีนี้ไม่มีสิทธิ์ลงคะแนนในรอบนี้',
        'functions/failed-precondition': 'ขณะนี้หีบเลือกตั้งไม่เปิดรับคะแนน',
        'functions/invalid-argument': 'กรุณาตรวจสอบผู้สมัครและรอบเลือกตั้ง',
        'functions/unauthenticated': 'กรุณาเข้าสู่ระบบใหม่ก่อนลงคะแนน'
      };
      showFeedback(error, messages[failure.code] ?? 'บันทึกบัตรไม่ได้ กรุณาลองอีกครั้ง');
      button.disabled = false;
      return;
    }
  }
  if (control.roundId === roundId) {
    votingSession = null;
    recordedRound = roundId;
    if (confirmedNow) playBallotDrop(roundId);
    else renderElection();
  }
}

const candidatePhotoRequests = new Map();

async function candidatePortraitSource(image) {
  const pendingURL = image.dataset.electionPhoto;
  return pendingURL ? loadCandidatePhoto(pendingURL) : image.src;
}

function loadCandidatePhoto(url) {
  if (!candidatePhotoRequests.has(url)) {
    const request = fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true' } })
      .then(async (response) => {
        if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/')) {
          throw new Error('Candidate photo unavailable');
        }
        return URL.createObjectURL(await response.blob());
      })
      .catch(() => {
        candidatePhotoRequests.delete(url);
        return '';
      });
    candidatePhotoRequests.set(url, request);
  }
  return candidatePhotoRequests.get(url);
}

function candidatePhoto(candidate) {
  if (candidate.photoURL) {
    try {
      const photo = candidate.photoURL;
      const localPath = /^\/api\/photos\/\d+\/\d+\/[a-f0-9-]{36}$/.test(photo);
      const url = new URL(localPath ? electionAPIURL(photo) : photo);
      if (localPath && /\.ngrok-free\.(dev|app)$/.test(url.hostname)) {
        void loadCandidatePhoto(url.href).then((source) => {
          if (!source) return;
          for (const image of document.querySelectorAll('img[data-election-photo]')) {
            if (image.dataset.electionPhoto === url.href && !image.hasAttribute('src')) image.src = source;
          }
        });
        return `<img class="candidate-portrait" data-election-photo="${escapeHTML(url.href)}" alt="" decoding="async">`;
      }
      if (localPath || url.origin === 'https://firebasestorage.googleapis.com') {
        return `<img class="candidate-portrait" src="${escapeHTML(url.href)}" alt="" decoding="async">`;
      }
    } catch { return ''; }
  }
  const photo = candidate.photo || '';
  return /^data:image\/(?:webp|png);base64,[a-z0-9+/=]+$/i.test(photo)
    ? `<img class="candidate-portrait" src="${photo}" alt="" decoding="async">` : '';
}

async function preparePortrait(file) {
  if (!/^image\/(?:jpeg|png|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) {
    throw new Error('เลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 10 MB');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', .95);
  } finally { bitmap.close(); }
}

async function portraitStorage(mode, action) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open('election2569-portraits', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('originals');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('originals', mode);
      const request = action(transaction.objectStore('originals'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function saveCandidatePortrait(file) {
  const photo = await preparePortrait(file);
  const originalPhotoId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  await portraitStorage('readwrite', (store) => store.add(file, originalPhotoId));
  return {photo, originalPhotoId};
}

const portraitCutoutKey = (id) => `winner-cutout-v1:${id}`;

function discardUnlinkedPortraits(ids) {
  const linked = new Set(loadCandidates().map(({originalPhotoId}) => originalPhotoId));
  for (const id of ids) {
    if (id && !linked.has(id)) {
      void portraitStorage('readwrite', (store) => {
        store.delete(portraitCutoutKey(id));
        return store.delete(id);
      }).catch(() => {});
    }
  }
}

function updateElectionStatus() {
  const phase = cloudReadEnabled ? getElectionPhase(Date.now(), cloudRound) : electionPhase;
  if (cloudReadEnabled) displayedCloudPhase = phase;
  const round = cloudReadEnabled ? cloudRound : control;
  if (gatewayStatus) {
    gatewayStatus.textContent = {
      open: 'เปิดให้ลงคะแนนแล้ว',
      waiting: 'ยังไม่เปิดหีบเลือกตั้ง',
      closed: 'ปิดหีบแล้ว กำลังรอประกาศผล',
      published: 'ประกาศผลการเลือกตั้งแล้ว'
    }[phase];
    planetLink.querySelector('.planet-label').textContent = {
      open: 'ใช้สิทธิ์เลือกตั้ง',
      waiting: 'ใช้สิทธิ์เลือกตั้ง',
      closed: 'ดูเวลาประกาศผล',
      published: 'ดูผลการเลือกตั้ง'
    }[phase];
  }
  const label = document.querySelector('#statusLabel');
  const status = document.querySelector('#electionStatus');
  const result = document.querySelector('#resultContent');
  if (!label || !status || !result) return;
  const votes = cloudReadEnabled ? [] : getVotes();
  const dot = label.previousElementSibling;
  if (phase === 'open') {
    label.textContent = 'กำลังเปิดหีบเลือกตั้ง';
    dot.style.background = '#82c993';
    status.textContent = 'ขณะนี้เปิดให้ใช้สิทธิแล้ว ลงทะเบียนและเลือกผู้สมัครที่คุณเชื่อมั่น';
    result.innerHTML = `<div class="waiting-icon" aria-hidden="true">☾</div>
      <h3 id="homeCloseCountdown">เหลือเวลาก่อนปิดหีบ</h3>
      ${countdownMarkup(round.schedule.close, 'homeCloseCountdown')}
      <p>ปิดหีบ <time datetime="${new Date(round.schedule.close).toISOString()}">${formatBangkok(round.schedule.close)}</time> น. (เวลาไทย)</p>
      <a class="small-action result-vote-link" href="vote.html">ไปใช้สิทธิ์เลือกตั้ง</a>`;
    updateCountdown();

    return;
  }
  if (phase === 'waiting') {
    label.textContent = 'รอเปิดการเลือกตั้ง';
    dot.style.background = '#e0b849';
    status.textContent = 'การเลือกตั้งยังไม่เปิด — โปรดติดตามประกาศจากโรงเรียน';
    result.innerHTML = `<div class="waiting-icon">☾</div><p class="result-kicker">THE PROPHECY IS WAITING</p><h3>รอเวลาเปิดม่านฟ้า</h3><p>เมื่อถึงเวลาการเลือกตั้ง<br>ผลคะแนนและผู้ชนะจะปรากฏที่นี่</p><a class="small-action result-vote-link" href="vote.html">ดูขั้นตอนเลือกตั้ง</a>`;

    return;
  }
  dot.style.background = '#a788d5';
  if (phase === 'closed') {
    label.textContent = 'ปิดหีบ · รอประกาศผล';
    status.textContent = 'ปิดหีบแล้ว กำลังรอประกาศผล';
    result.innerHTML = `<div class="waiting-icon" aria-hidden="true">☾</div><h3>รอประกาศผล</h3><p>${round?.schedule ? formatBangkok(round.schedule.publish) : 'โปรดติดตามประกาศจากโรงเรียน'}</p><a class="small-action result-vote-link" href="#vote">ไปยังปุ่มดูเวลาประกาศผล</a>`;
    return;
  }
  label.textContent = 'ประกาศผลแล้ว';
  status.textContent = `ประกาศผลการเลือกตั้งรอบที่ ${round.round} แล้ว`;
  result.innerHTML = cloudReadEnabled
    ? '<div class="waiting-icon" aria-hidden="true">✦</div><h3>ประกาศผลแล้ว</h3><a class="small-action result-vote-link" href="vote.html">ดูผลการเลือกตั้ง</a>'
    : electionResultsMarkup(votes);
}

function electionResultsMarkup(votes) {
  const totals = tallyVotes(votes);
  const leaders = totals.filter((candidate) => candidate.count > 0 && candidate.count === totals[0]?.count);
  const heading = leaders.length === 1 ? `ผู้ได้คะแนนสูงสุด · ${escapeHTML(leaders[0].name)}`
    : leaders.length > 1 ? 'คะแนนสูงสุดเสมอกัน' : 'ไม่มีผู้ได้รับคะแนน';
  return `<div class="waiting-icon" aria-hidden="true">✦</div><h3>${heading}</h3><p>คะแนนรวม ${votes.length} เสียง</p><div class="score-list">${totals.map((candidate) => `<div class="score-line ${leaders.includes(candidate) ? 'winner' : ''}"><b>หมายเลข ${escapeHTML(candidate.no)} · ${escapeHTML(candidate.name)}</b><span>${candidate.count} เสียง</span></div>`).join('')}</div><p class="demo-note">ผลจากข้อมูลในเบราว์เซอร์นี้</p>`;
}

function tallyVotes(votes = getVotes()) {
  const counts = new Map();
  for (const vote of votes) {
    const number = String(vote.candidate);
    counts.set(number, (counts.get(number) || 0) + 1);
  }
  return candidates.map(({ no, name }) => ({ no, name, count: counts.get(String(no)) || 0 }))
    .sort((a, b) => b.count - a.count || a.no - b.no);
}

const bangkokDate = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short'
});
function formatBangkok(timestamp) { return bangkokDate.format(timestamp); }

function renderAdminLogin() {
  adminDialog.classList.add('admin-sign-in');
  adminDialog.setAttribute('aria-label', 'เข้าสู่ศูนย์ควบคุม');
  document.querySelector('#adminApp').innerHTML = `
    <form id="adminLoginForm" class="admin-sign-in-form">
      <header>
        <span class="admin-login-moon" aria-hidden="true">☾</span>
        <span class="admin-login-brand">ORACLE</span>
        <h2>เข้าสู่ศูนย์ควบคุม</h2>
      </header>
      <label for="adminEmail">อีเมลผู้ดูแล</label>
      <input id="adminEmail" type="email" autocomplete="username" required autofocus>
      <label for="adminPass">รหัสผ่าน</label>
      <input id="adminPass" type="password" autocomplete="current-password" required>
      <p id="adminLoginError" role="alert"></p>
      <button class="primary" id="adminLogin" type="submit">เข้าสู่ระบบ <span aria-hidden="true">✦</span></button>
    </form>`;
  document.querySelector('#adminLoginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = document.querySelector('#adminEmail').value.trim();
    const password = document.querySelector('#adminPass').value;
    const button = form.querySelector('button[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    try {
      const backend = await electionRequest('/api/round');
      if (!Number.isSafeInteger(backend.roundId)) throw new Error('เซิร์ฟเวอร์เลือกตั้งยังไม่พร้อม กรุณาแจ้งผู้ดูแล');
      await signInElectionAdmin(email, password);
      const adminState = cloudReadEnabled ? await callElectionAdmin({ action: 'read' }) : null;
      if (!form.isConnected || !adminDialog.open) return;
      adminDialog.classList.remove('admin-sign-in');
      adminDialog.setAttribute('aria-label', 'ศูนย์ควบคุมการเลือกตั้ง');
      if (adminState) renderCloudAdmin(adminState);
      else renderAdmin();
      adminDialog.querySelector('.close').focus();
    } catch (error) {
      if (form.isConnected) showFeedback(form.querySelector('#adminLoginError'),
        error.code === 'auth/network-request-failed' ? 'เชื่อมต่อ Firebase Authentication ไม่ได้ กรุณาตรวจอินเทอร์เน็ต'
          : error.code?.startsWith('auth/') ? 'เข้าสู่ระบบไม่ได้ กรุณาตรวจอีเมลและรหัสผ่าน' : error.message);
    } finally {
      button.disabled = false;
    }
  });
}

function getAdminData() {
  const votes = getVotes();
  const eligible = eligibleVoters();
  const eligibleIds = new Set(eligible.map((voter) => voter.studentId));
  const registeredVotes = votes.filter((vote) => eligibleIds.has(vote.studentId));
  const registeredVotedIds = new Set(registeredVotes.map((vote) => vote.studentId));
  const unvoted = eligible.filter((voter) => !registeredVotedIds.has(voter.studentId));
  return { votes, registeredVotes, votedIds: registeredVotedIds, unvoted };
}

function adminStatusText() {
  if (electionPhase === 'waiting' && !control.schedule) return 'ยังไม่กำหนดวันเลือกตั้ง';
  return { open: 'กำลังเปิดหีบ', closed: 'ปิดหีบแล้ว', published: 'ประกาศผลแล้ว', waiting: 'รอเปิดระบบ' }[electionPhase];
}

function saveControl(changes) {
  if (JSON.stringify(readControl()) !== JSON.stringify(control)) {
    syncElectionPage(true);
    throw new Error('การตั้งค่าเปลี่ยนจากอีกแท็บ กรุณาเปิดเมนูใหม่แล้วลองอีกครั้ง');
  }
  const next = { ...control, ...changes };
  localStorage.setItem(storageKeys.control, JSON.stringify(next));
  syncElectionPage();
}

function canEditSetup() { return getElectionPhase() === 'waiting' && getVotes().length === 0; }

function getRooms(voters = eligibleVoters()) {
  return [...new Set(voters.map((voter) => voter.room))].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
}

function parseRoster(text) {
  const seen = new Set();
  const rows = text.trim().split(/\r?\n/).filter((line) => line.trim());
  if (rows[0]?.startsWith('studentId\t')) rows.shift();
  if (!rows.length) throw new Error('กรุณาใส่รายชื่อนักเรียนอย่างน้อยหนึ่งคน');
  return rows.map((line, index) => {
    const [studentId, name, room, number, extra] = line.split('\t').map((value) => value.trim());
    if (!/^\d{5}$/.test(studentId) || !name || !/^[มป]\.\d{1,2}\/[1-9]\d?$/.test(room) ||
      !/^\d{1,2}$/.test(number) || Number(number) < 1 || extra !== undefined || seen.has(studentId)) {
      throw new Error(`ข้อมูลนักเรียนแถวที่ ${index + 1} ไม่ครบ รูปแบบไม่ถูกต้อง หรือรหัสนักเรียนซ้ำ`);
    }
    seen.add(studentId);
    return { studentId, name, room, number: Number(number) };
  });
}

function renderEligibilityAdmin() {
  const panel = document.querySelector('#adminPanel');
  const rooms = getRooms(getRoster());
  const grades = [...new Set(rooms.map((room) => room.split('/')[0]))];
  panel.innerHTML = `<section class="admin-settings-card"><h3>กำหนดผู้มีสิทธิ์เลือกตั้ง</h3>
    ${rosterAvailable
      ? `<p>${voterDatabaseAvailable ? 'ทะเบียนในฐานข้อมูล' : 'ทะเบียนจากฐานข้อมูลที่บันทึกไว้ในเครื่อง'} · ${getRoster().length} คน · มีสิทธิ์ในรอบนี้ ${eligibleVoters().length} คน</p>`
      : '<p>ยังไม่พบทะเบียนผู้มีสิทธิ์ กรุณาโหลดหน้านี้ใหม่หลังระบบเตรียมข้อมูล</p>'}
    ${rosterAvailable ? `<details><summary>ดูทะเบียนทั้งหมด (${getRoster().length} คน)</summary>
    <div class="voter-table-wrap"><table><thead><tr><th>รหัสนักเรียน</th><th>ชื่อ</th><th>ห้อง</th><th>เลขที่</th></tr></thead><tbody>
    ${getRoster().map((voter) => `<tr><td>${voter.studentId}</td><td>${escapeHTML(voter.name)}</td><td>${voter.room}</td><td>${voter.number}</td></tr>`).join('')}
    </tbody></table></div></details>` : ''}
    ${rosterAvailable && canEditSetup() ? `<form id="eligibilityForm"><div class="admin-grade-grid">${grades.map((grade) => `<fieldset>
      <legend>${grade}</legend><button type="button" class="text-action" data-select-grade>เลือก / ยกเลิกทั้งชั้น</button>
      ${rooms.filter((room) => room.split('/')[0] === grade).map((room) => `<label class="admin-room-choice"><input type="checkbox" name="room" value="${room}" ${!control.rooms || control.rooms.includes(room) ? 'checked' : ''}> ${room}</label>`).join('')}
      </fieldset>`).join('')}</div><button class="admin-main-action" type="submit">บันทึกผู้มีสิทธิ์</button></form>
    ${voterDatabaseAvailable ? `<form id="rosterForm"><h3>นำเข้าทะเบียนนักเรียน</h3><p>คัดลอก 4 คอลัมน์จากตารางแล้ววางตามลำดับ รหัส 5 หลัก ชื่อ ห้อง เช่น ม.6/1 และเลขที่</p>
    <label for="rosterText">รายชื่อนักเรียนคั่นด้วยแท็บ</label>
    <textarea id="rosterText" name="roster" rows="5" required></textarea>
    <button class="admin-main-action" type="submit">แทนที่ทะเบียนนักเรียน</button></form>` : ''}
    <p id="eligibilityMessage" role="status"></p>` : rosterAvailable ? '<p>เริ่มรอบใหม่เพื่อแก้ไขทะเบียนหรือห้องที่มีสิทธิ์</p>' : ''}</section>`;
  panel.querySelectorAll('[data-select-grade]').forEach((button) => button.addEventListener('click', () => {
    const choices = [...button.closest('fieldset').querySelectorAll('input')];
    const select = choices.some((input) => !input.checked);
    choices.forEach((input) => { input.checked = select; });
  }));
  const message = panel.querySelector('#eligibilityMessage');
  panel.querySelector('#eligibilityForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const selected = new FormData(form).getAll('room');
    if (!selected.length) { showFeedback(message, 'กรุณาเลือกอย่างน้อยหนึ่งห้อง'); return; }
    try {
      if (!canEditSetup()) throw new Error('รอบนี้เริ่มแล้ว');
      const removesEligibility = eligibleVoters().some((voter) => !selected.includes(voter.room));
      if (removesEligibility && !await confirmAction('ห้องที่นำออกจะไม่มีสิทธิ์ลงคะแนนในรอบนี้', 'ยืนยันการเปลี่ยนสิทธิ์')) return;
      if (!form.isConnected || !canEditSetup()) return;
      saveControl({ rooms: selected });
      renderAdmin('eligibility');
      showFeedback(document.querySelector('#eligibilityMessage'), 'บันทึกผู้มีสิทธิ์แล้ว', 'success');
    } catch (error) { showFeedback(message, error.message); }
  });
  panel.querySelector('#rosterForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      if (!canEditSetup()) throw new Error('รอบนี้เริ่มแล้ว');
      const voters = parseRoster(panel.querySelector('#rosterText').value);
      if (!await confirmAction('ระบบจะแทนที่ทะเบียนนักเรียนเดิม และเปิดให้ทุกห้องในทะเบียนใหม่มีสิทธิ์', 'แทนที่ทะเบียน')) return;
      if (!form.isConnected || !canEditSetup()) return;
      const response = await fetch('/api/voters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voters)
      });
      if (!response.ok) throw new Error('บันทึกทะเบียนไม่ได้ กรุณาตรวจรหัสนักเรียนและเลขที่ซ้ำในห้อง');
      roster = await response.json();
      localStorage.setItem(storageKeys.rosterChanged, String(Date.now()));
      syncElectionPage();
      saveControl({ rooms: null });
      renderAdmin('eligibility');
      showFeedback(document.querySelector('#eligibilityMessage'), 'นำเข้าสำเร็จ ทุกห้องมีสิทธิ์จนกว่าจะเลือกห้องใหม่', 'success');
    } catch (error) { showFeedback(message, error.message); }
  });
}

function dateInputValue(timestamp) {
  return timestamp ? new Date(timestamp + 7 * 3600000).toISOString().slice(0, 16) : '';
}

function parseSchedule(form) {
  const [open, close, publish] = ['open', 'close', 'publish'].map((field) => {
    const date = form.get(`${field}Date`);
    const time = form.get(`${field}Time`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) {
      throw new Error('กรุณาเลือกวันที่และเวลาให้ครบทั้งสามช่วง');
    }
    const timestamp = Date.parse(`${date}T${time}:00+07:00`);
    if (dateInputValue(timestamp) !== `${date}T${time}`) throw new Error('วันที่หรือเวลาไม่ถูกต้อง');
    return timestamp;
  });
  if (!(open < close && close <= publish)) throw new Error('เวลาเปิดต้องอยู่ก่อนเวลาปิด และเวลาประกาศต้องตรงกับหรืออยู่หลังเวลาปิด');
  return { open, close, publish };
}

function renderRoundAdmin() {
  const panel = document.querySelector('#adminPanel');
  const schedule = control.schedule;
  const fields = [['open', 'เปิดหีบ'], ['close', 'ปิดหีบ'], ['publish', 'ประกาศผล']];
  panel.innerHTML = `<section class="admin-settings-card"><h3>รอบที่ ${control.round} · ${adminStatusText()}</h3>
    <h3>กำหนดการตามเวลาไทย</h3>
    <form id="scheduleForm">
      <p>แก้ไขได้ทุกสถานะ เมื่อบันทึก ระบบจะใช้กำหนดการใหม่ทันทีและเก็บคะแนนที่ลงไปแล้วในรอบนี้</p>
      <div class="admin-schedule-grid">${fields.map(([key, label]) => {
        const [date = '', time = ''] = dateInputValue(schedule?.[key]).split('T');
        return `<fieldset class="admin-schedule-slot"><legend>${label}</legend>
          <label>วันที่<input name="${key}Date" type="date" value="${date}" required></label>
          <label>เวลา<input name="${key}Time" type="time" value="${time}" required></label>
        </fieldset>`;
      }).join('')}</div><button class="admin-main-action" type="submit">บันทึกกำหนดการ</button>
      <p id="scheduleMessage" role="status"></p>
    </form>
  </section><section class="admin-settings-card">
    <h3>ควบคุมการเลือกตั้ง</h3>
    <div class="admin-actions">
      ${electionOpen ? '<button class="admin-add" id="manualPoll">ปิดหีบตอนนี้</button>' : ''}
      ${electionPhase === 'closed' ? '<button class="admin-main-action" id="publishNow">ประกาศผลตอนนี้</button>' : ''}
    </div>
    ${electionPhase === 'waiting' ? `<p>${schedule ? `หีบจะเปิดวันที่ ${formatBangkok(schedule.open)} น.` : 'บันทึกกำหนดการก่อน ระบบจึงจะเปิดหีบตามเวลาที่กำหนด'}</p>` : ''}
    ${electionPhase === 'published' ? '<p>ผลเผยแพร่ในโซนผลแห่งดวงดาวบนหน้าแรกแล้ว</p>' : ''}
    <p id="roundMessage" role="status"></p>
  </section><section class="admin-settings-card"><h3>รีเซ็ตรอบเลือกตั้ง</h3>
    <p>ระบบจะเก็บสรุปคะแนนรอบเดิมและเริ่มรอบใหม่โดยใช้รายชื่อกับผู้สมัครชุดปัจจุบัน</p>
    ${electionOpen ? '<p>ปิดหีบก่อนเริ่มรอบใหม่</p>' : ''}
    <button class="admin-danger" id="newRound" ${electionOpen ? 'disabled' : ''}>รีเซ็ตและเริ่มรอบใหม่</button>
    <p id="resetMessage" role="status"></p>
  </section>`;
  const update = (action, message = '#roundMessage') => {
    try { action(); renderAdmin('status'); }
    catch (error) { showFeedback(panel.querySelector(message), error.message); }
  };
  panel.querySelector('#scheduleForm').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const schedule = parseSchedule(new FormData(event.currentTarget));
      saveControl({ schedule, manual: null, published: false });
      showFeedback(panel.querySelector('#scheduleMessage'), `บันทึกกำหนดการแล้ว · ${adminStatusText()}`, 'success');
    } catch (error) {
      showFeedback(panel.querySelector('#scheduleMessage'), error.message);
    }
  });
  panel.querySelector('#manualPoll')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!await confirmAction('เมื่อปิดหีบแล้ว ผู้มีสิทธิ์จะลงคะแนนต่อไม่ได้', 'ปิดหีบ')) return;
    if (!button.isConnected) return;
    update(() => {
      if (getElectionPhase() === 'open') saveControl({ manual: 'closed' });
    });
  });
  panel.querySelector('#publishNow')?.addEventListener('click', () => update(() => {
    if (getElectionPhase() === 'closed') saveControl({ published: true });
  }));
  panel.querySelector('#newRound').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const round = control.round;
    const phase = getElectionPhase();
    if (phase === 'waiting') {
      await showNotice({ title: 'ยังไม่มีการเลือกตั้งในรอบนี้', message: 'รอบปัจจุบันยังไม่เริ่ม ระบบจะคงเลขรอบและข้อมูลเดิมไว้' });
      return;
    }
    if (phase === 'open' || !await confirmAction(`ระบบจะเก็บสรุปคะแนนรอบที่ ${round} ไว้ในประวัติ แล้วเริ่มรอบใหม่ที่ต้องบันทึกกำหนดการ`, 'รีเซ็ตและเริ่มรอบใหม่')) return;
    if (!button.isConnected || control.round !== round || !['closed', 'published'].includes(getElectionPhase())) return;
    update(() => {
      const votes = getVotes();
      const history = [...control.history, { number: control.round, total: votes.length, ended: Date.now(), results: tallyVotes(votes) }];
      saveControl({ round: control.round + 1, roundId: control.roundId + 1, history, schedule: null, manual: null, published: false });
    }, '#resetMessage');
  });
}

function renderHistoryAdmin(feedback = '') {
  const rounds = [...control.history].reverse();
  const panel = document.querySelector('#adminPanel');
  panel.innerHTML = `<p class="admin-history-current">รอบปัจจุบัน <strong>รอบที่ ${control.round}</strong></p><p id="historyMessage" role="status"></p>` + (rounds.length ? `
    <div class="admin-history-list">
      ${rounds.map((round) => `<details class="admin-history-round">
        <summary>
          <span class="admin-history-title"><strong>รอบที่ ${round.number}</strong>
            <span>บันทึกเมื่อ ${formatBangkok(round.ended)} น.</span></span>
          <span class="admin-history-total">${round.total} เสียง</span>
        </summary>
        ${round.results.length ? `<table class="admin-history-results" aria-label="คะแนนรอบที่ ${round.number}">
          <thead><tr><th scope="col">ผู้สมัคร</th><th scope="col">คะแนน</th></tr></thead>
          <tbody>${round.results.map((result) => `<tr>
            <td>${result.no == null ? '' : `<span class="admin-history-number">เบอร์ ${escapeHTML(String(result.no))}</span> `}${escapeHTML(result.name)}</td><td>${result.count}</td>
          </tr>`).join('')}</tbody>
        </table>` : '<p class="admin-history-empty">ไม่มีข้อมูลคะแนนในรอบนี้</p>'}
        <div class="admin-history-actions">
          <button type="button" class="admin-danger" data-delete-round="${round.number}">ลบประวัติรอบที่ ${round.number}</button>
        </div>
      </details>`).join('')}
    </div>` : '<section class="admin-settings-card"><h3>ยังไม่มีประวัติการเลือกตั้ง</h3><p>เมื่อเริ่มรอบใหม่ สรุปคะแนนของรอบก่อนหน้าจะแสดงที่นี่</p></section>') + `
    <section class="admin-settings-card admin-reset-history">
      <h3>เริ่มใหม่จากรอบที่ 1</h3>
      <p>ล้างประวัติทั้งหมด คะแนนของรอบปัจจุบัน และกำหนดการ แล้วเริ่มตั้งค่ารอบที่ 1</p>
      ${electionOpen ? '<p>ปิดหีบก่อนเริ่มใหม่จากรอบที่ 1</p>' : ''}
      <button type="button" class="admin-danger" id="resetToFirstRound" ${electionOpen ? 'disabled' : ''}>รีเซ็ตเป็นรอบที่ 1</button>
    </section>`;
  if (feedback) showFeedback(panel.querySelector('#historyMessage'), feedback, 'success');
  panel.querySelectorAll('[data-delete-round]').forEach((button) => button.addEventListener('click', async () => {
    const number = Number(button.dataset.deleteRound);
    if (!await confirmAction(`สรุปคะแนนรอบที่ ${number} จะถูกลบ และเลขรอบปัจจุบันจะลดลง 1`, 'ลบประวัติ')) return;
    if (!button.isConnected) return;
    try {
      if (!control.history.some((entry) => Number(entry.number) === number)) return;
      const history = control.history.filter((entry) => Number(entry.number) !== number)
        .map((entry) => Number(entry.number) > number ? { ...entry, number: Number(entry.number) - 1 } : entry);
      saveControl({ round: Math.max(1, control.round - 1), history });
      renderHistoryAdmin(`ลบประวัติรอบที่ ${number} แล้ว`);
      document.querySelector('.oracle-admin-hero h2').focus();
    } catch (error) { showFeedback(panel.querySelector('#historyMessage'), error.message); }
  }));
  panel.querySelector('#resetToFirstRound').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (!await confirmAction('ประวัติทั้งหมด คะแนนของรอบปัจจุบัน และกำหนดการจะถูกล้าง ระบบจะใช้ทะเบียนและผู้สมัครชุดเดิมสำหรับรอบที่ 1', 'รีเซ็ตเป็นรอบที่ 1')) return;
    if (!button.isConnected || getElectionPhase() === 'open') return;
    try {
      saveControl({ round: 1, roundId: control.roundId + 1, history: [], schedule: null, manual: null, published: false });
      renderHistoryAdmin('เริ่มรอบที่ 1 แล้ว กรุณาบันทึกกำหนดการในเมนูจัดการรอบ');
      document.querySelector('.oracle-admin-hero h2').focus();
    } catch (error) { showFeedback(panel.querySelector('#historyMessage'), error.message); }
  });
}

function renderAdmin(activeTab = 'overview') {
  const { registeredVotes, unvoted } = getAdminData();
  const tabs = [
    ['overview', '✦', 'ภาพรวม', 'ภาพรวมการเลือกตั้ง', 'ดูจำนวนผู้ใช้สิทธิ์และความคืบหน้าของแต่ละห้อง'],
    ['status', '☾', 'จัดการรอบ', 'กำหนดการและรอบเลือกตั้ง', 'ตั้งเวลาเปิดหีบ ปิดหีบ และประกาศผล'],
    ['candidates', '♙', 'จัดการผู้สมัคร', 'จัดการผู้สมัคร', 'แก้ไขรายละเอียดและรูปที่จะแสดงบนบัตรเลือกตั้ง'],
    ['eligibility', '✧', 'กำหนดผู้มีสิทธิ์', 'กำหนดผู้มีสิทธิ์', 'จัดการทะเบียนนักเรียนและเลือกห้องที่มีสิทธิ์ลงคะแนน'],
    ['voters', '◉', 'ผู้ยังไม่ใช้สิทธิ์', 'ผู้ยังไม่ใช้สิทธิ์', 'ค้นหาด้วยรหัสนักเรียนหรือกรองรายชื่อตามห้อง'],
    ['history', '◷', 'ประวัติการเลือกตั้ง', 'ประวัติการเลือกตั้ง', 'เปิดดูสรุปคะแนนของแต่ละรอบ']
  ];
  const [, , , title, description] = tabs.find(([id]) => id === activeTab);
  document.querySelector('#adminApp').innerHTML = `<div class="oracle-admin">
    <aside class="oracle-admin-side">
      <div class="admin-brand"><span aria-hidden="true">☾</span><div><b>ORACLE</b><small>ระบบเลือกตั้ง 2569</small></div></div>
      <div class="admin-side-status"><i class="${electionOpen ? 'is-live' : ''}" aria-hidden="true"></i>รอบที่ ${control.round} · ${adminStatusText()}</div>
      <nav aria-label="เมนูผู้ดูแล">${tabs.map(([id, icon, name]) => `<button type="button" data-admin-tab="${id}" ${activeTab === id ? 'class="active" aria-current="page"' : ''}><span aria-hidden="true">${icon}</span>${name}</button>`).join('')}</nav>
    </aside>
    <main class="oracle-admin-main">
      <header class="oracle-admin-hero"><div><h2 tabindex="-1">${title}</h2><p>${description}</p></div></header>
      <div id="adminPanel"></div>
    </main>
  </div>`;
  document.querySelectorAll('[data-admin-tab]').forEach((button) => button.addEventListener('click', () => {
    renderAdmin(button.dataset.adminTab);
    document.querySelector('.oracle-admin-hero h2').focus();
  }));
  if (activeTab === 'candidates') renderCandidateAdmin();
  else if (activeTab === 'status') renderRoundAdmin();
  else if (activeTab === 'voters') renderVoterAdmin();
  else if (activeTab === 'eligibility') renderEligibilityAdmin();
  else if (activeTab === 'history') renderHistoryAdmin();
  else renderOverviewAdmin(registeredVotes, unvoted);
}

function renderOverviewAdmin(votes, unvoted) {
  const turnout = Math.round((votes.length / Math.max(1, eligibleVoters().length)) * 100);
  document.querySelector('#adminPanel').innerHTML = `<section class="admin-stat-grid"><article><span>ผู้มีสิทธิทั้งหมด</span><b>${eligibleVoters().length}</b><small>${getRooms().length} ห้องเรียน</small></article><article><span>บันทึกเสียงแล้ว</span><b>${votes.length}</b><small>${turnout}% ของผู้มีสิทธิ</small></article><article><span>ยังไม่ใช้สิทธิ</span><b>${unvoted.length}</b><small>ตรวจรายชื่อได้ทันที</small></article><article class="status-stat"><span>สถานะหีบเลือกตั้ง</span><b>${adminStatusText()}</b><small>${electionOpen ? 'เปิดรับการลงคะแนน' : 'รอคำสั่งจากผู้ดูแล'}</small></article></section><section class="admin-command-card"><div><h3>ควบคุมหีบเลือกตั้ง</h3><p>${electionOpen ? 'ขณะนี้นักเรียนสามารถยืนยันสิทธิและหย่อนบัตรได้' : 'เมื่อเปิดหีบ ระบบจะแสดงขั้นตอนลงทะเบียนให้ผู้มีสิทธิทันที'}</p></div><button class="admin-main-action" id="toggleElection">จัดการหีบและประกาศผล <span>${electionOpen ? '☾' : '✦'}</span></button></section><section class="admin-room-summary"><div class="panel-title"><div><h3>สรุปการใช้สิทธิแยกตามห้อง</h3></div><button class="text-action" id="showVoters">ดูผู้ยังไม่ใช้สิทธิ์</button></div><div class="admin-room-grid">${getRooms().map((room) => { const total = eligibleVoters().filter((voter) => voter.room === `${room}`).length; const used = votes.filter((vote) => eligibleVoters().find((voter) => voter.studentId === vote.studentId)?.room === `${room}`).length; return `<article><span>${room}</span><b>${used}<i> / ${total}</i></b><div><i style="width:${(used / total) * 100}%"></i></div><small>ยังไม่ใช้สิทธิ ${total - used} คน</small></article>`; }).join('')}</div></section>`;
  document.querySelector('#toggleElection').addEventListener('click', () => document.querySelector('[data-admin-tab="status"]').click());
  document.querySelector('#showVoters').addEventListener('click', () => document.querySelector('[data-admin-tab="voters"]').click());
}

function renderCandidateAdmin() {
  const panel = document.querySelector('#adminPanel');
  if (!canEditSetup()) {
    const published = getElectionPhase() === 'published';
    panel.innerHTML = `<section class="admin-settings-card"><h3>ผู้สมัครรอบที่ ${control.round}</h3>
      <p>${published ? 'อัปโหลดรูปต้นฉบับใหม่เพื่อเพิ่มความคมชัดในหน้าประกาศผล'
        : 'รอบนี้เริ่มแล้ว การแก้ไขรายชื่อ หมายเลข และรูปทำได้ก่อนเปิดหีบรอบถัดไป'}</p>
      <ul class="admin-candidate-list">${candidates.map((candidate) => `<li>
        <div class="candidate-orb" aria-hidden="true">${candidatePhoto(candidate) || escapeHTML(candidate.icon || '✦')}</div>
        <div><strong>หมายเลข ${candidate.no} · ${escapeHTML(candidate.name)}</strong><p>${escapeHTML(candidate.team)}${candidate.room ? ` · ${escapeHTML(candidate.room)}` : ''}</p>
          ${published ? `<form class="admin-result-photo" data-candidate="${candidate.no}">
            <label>รูปสำหรับหน้าประกาศผล <input type="file" accept="image/jpeg,image/png,image/webp" required></label>
            <button type="submit" class="admin-add">บันทึกรูป</button>
            <p role="status"></p>
          </form>` : ''}</div>
      </li>`).join('')}</ul>
      <button class="admin-main-action" id="candidateRoundSettings" type="button">ไปที่กำหนดการและรอบเลือกตั้ง</button></section>`;
    panel.querySelectorAll('.admin-result-photo').forEach((form) => {
      form.addEventListener('submit', savePublishedPortrait);
    });
    panel.querySelector('#candidateRoundSettings').addEventListener('click', () => renderAdmin('status'));
    return;
  }
  panel.innerHTML = `<form id="candidateForm" class="admin-settings-card"><h3>จัดการผู้สมัคร</h3>
    <p>รองรับรูป JPG, PNG และ WebP ขนาดไม่เกิน 10 MB ต่อรูป</p>
    <div id="candidateEditor" class="candidate-editor-list"></div>
    <div class="admin-actions">
      <button type="button" class="admin-add" id="addCandidate">เพิ่มผู้สมัคร</button>
      <button class="admin-main-action" type="submit">บันทึกผู้สมัคร</button>
    </div>
    <p id="candidateSaveMessage" role="status"></p></form>`;
  const form = panel.querySelector('#candidateForm');
  const editor = panel.querySelector('#candidateEditor');
  const message = panel.querySelector('#candidateSaveMessage');
  const addRow = (candidate) => {
    const row = document.createElement('article');
    row.className = 'candidate-editor-row';
    row.dataset.icon = candidate.icon || '✦';
    row.dataset.photo = candidate.photo || '';
    row.dataset.originalPhotoId = candidate.originalPhotoId || '';
    row.innerHTML = `<div class="candidate-orb">${candidatePhoto(candidate) || escapeHTML(row.dataset.icon)}</div>
      <div class="admin-candidate-fields">
        <label>หมายเลข<input name="no" type="number" min="1" max="999" required value="${candidate.no}"></label>
        <label>ชื่อ<input name="name" required value="${escapeHTML(candidate.name)}"></label>
        <label>ทีม<input name="team" required value="${escapeHTML(candidate.team)}"></label>
        <label>สี<input name="color" type="color" value="${candidate.color}"></label>
        <label class="admin-candidate-wide">วิสัยทัศน์<textarea name="vision" rows="2" required>${escapeHTML(candidate.vision)}</textarea></label>
        <label class="admin-candidate-wide">รูปผู้สมัคร<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>
        <label>ห้อง<input name="room" maxlength="20" placeholder="M.6/5" value="${escapeHTML(candidate.room || '')}"></label>
        ${candidate.photo ? '<label class="admin-room-choice"><input name="removePhoto" type="checkbox"> ลบรูปเดิม</label>' : ''}
      </div><button type="button" class="remove-candidate" aria-label="ลบผู้สมัคร">×</button>`;
    row.querySelector('.remove-candidate').addEventListener('click', async () => {
      if (editor.children.length > 1 && await confirmAction('รายชื่อจะเปลี่ยนเมื่อกดบันทึกผู้สมัคร', 'ลบผู้สมัคร') &&
        row.isConnected && editor.children.length > 1) row.remove();
    });
    row.querySelector('[name="removePhoto"]')?.addEventListener('change', async (event) => {
      if (event.target.checked && !await confirmAction('รูปเดิมจะถูกลบเมื่อกดบันทึกผู้สมัคร', 'ลบรูปผู้สมัคร')) event.target.checked = false;
    });
    editor.append(row);
  };
  candidates.forEach(addRow);
  panel.querySelector('#addCandidate').addEventListener('click', () => {
    const numbers = new Set([...editor.querySelectorAll('[name="no"]')].map((field) => Number(field.value)));
    let no = 1;
    while (numbers.has(no)) no += 1;
    addRow({ no, name: '', team: '', vision: '', color: '#8568a3' });
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const roundId = control.roundId;
    const originalCandidates = localStorage.getItem(storageKeys.candidates);
    const rows = [...editor.children];
    const replacesPhoto = rows.some((row) => row.dataset.photo && row.querySelector('[name="photo"]').files.length);
    if (replacesPhoto && !await confirmAction('ไฟล์ที่เลือกจะแทนที่รูปผู้สมัครเดิมเมื่อบันทึก', 'แทนที่รูป')) return;
    if (!form.isConnected || roundId !== control.roundId) return;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    const savedPhotoIds = [];
    try {
      const draft = [];
      for (const row of rows) {
        const input = (name) => row.querySelector(`[name="${name}"]`);
        const file = input('photo').files[0];
        const remove = input('removePhoto')?.checked;
        const portrait = file ? await saveCandidatePortrait(file) : {
          photo: remove ? '' : row.dataset.photo,
          originalPhotoId: remove ? '' : row.dataset.originalPhotoId
        };
        if (file) savedPhotoIds.push(portrait.originalPhotoId);
        draft.push({
          no: Number(input('no').value), name: input('name').value.trim(),
          team: input('team').value.trim(), vision: input('vision').value.trim(),
          color: input('color').value, icon: row.dataset.icon, room: input('room').value.trim(),
          ...portrait
        });
      }
      if (draft.some((item) => !item.name || !item.team || !item.vision)) throw new Error('กรุณากรอกชื่อ ทีม และวิสัยทัศน์');
      if (new Set(draft.map((item) => item.no)).size !== draft.length) throw new Error('หมายเลขผู้สมัครต้องไม่ซ้ำกัน');
      syncElectionPage();
      if (roundId !== control.roundId || !canEditSetup()) throw new Error('รอบนี้เริ่มแล้ว กรุณาเปิดหน้าจัดการผู้สมัครใหม่');
      if (localStorage.getItem(storageKeys.candidates) !== originalCandidates) {
        throw new Error('ข้อมูลผู้สมัครเปลี่ยนจากอีกหน้าหนึ่ง กรุณาเปิดเมนูใหม่แล้วลองอีกครั้ง');
      }
      const previousPhotoIds = loadCandidates().map(({originalPhotoId}) => originalPhotoId);
      localStorage.setItem(storageKeys.candidates, JSON.stringify(draft));
      candidates = draft;
      discardUnlinkedPortraits(previousPhotoIds);
      if (form.isConnected) {
        renderAdmin('candidates');
        showFeedback(document.querySelector('#candidateSaveMessage'), 'บันทึกผู้สมัครและรูปแล้ว', 'success');
      }
    } catch (error) {
      showFeedback(message, error.name === 'QuotaExceededError' ? 'พื้นที่จัดเก็บเต็ม กรุณาลดจำนวนหรือขนาดรูป' : error.message);
    } finally {
      discardUnlinkedPortraits(savedPhotoIds);
      button.disabled = false;
    }
  });
}

async function savePublishedPortrait(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.querySelector('input');
  const file = input.files[0];
  const submit = form.querySelector('button');
  const message = form.querySelector('[role="status"]');
  const roundId = control.roundId;
  if (!file || getElectionPhase() !== 'published') return;
  submit.disabled = true;
  let portrait;
  try {
    portrait = await saveCandidatePortrait(file);
    syncElectionPage();
    if (!form.isConnected || control.roundId !== roundId || electionPhase !== 'published') return;
    const latest = loadCandidates();
    const candidate = latest.find(({no}) => String(no) === form.dataset.candidate);
    if (!candidate) throw new Error('ไม่พบผู้สมัคร กรุณาเปิดเมนูใหม่แล้วลองอีกครั้ง');
    const previousPhotoId = candidate.originalPhotoId;
    Object.assign(candidate, portrait);
    localStorage.setItem(storageKeys.candidates, JSON.stringify(latest));
    candidates = latest;
    discardUnlinkedPortraits([previousPhotoId]);
    form.closest('li').querySelector('.candidate-orb').innerHTML = candidatePhoto(candidate);
    input.value = '';
    showFeedback(message, 'บันทึกรูปสำหรับหน้าประกาศผลแล้ว', 'success');
  } catch (error) {
    showFeedback(message, error.name === 'QuotaExceededError' ? 'พื้นที่จัดเก็บเต็ม กรุณาใช้ไฟล์รูปขนาดเล็กลง' : error.message);
  } finally {
    if (portrait) discardUnlinkedPortraits([portrait.originalPhotoId]);
    submit.disabled = false;
  }
}

function renderVoterAdmin() {
  const { votedIds, unvoted } = getAdminData();
  document.querySelector('#adminPanel').innerHTML = `<section class="voter-panel"><div class="voter-panel-head"><div><h3>ผู้ยังไม่มาใช้สิทธิ <b>${unvoted.length}</b> คน</h3><p>ค้นหาจากรหัสนักเรียน หรือกรองตามห้องเพื่อประสานงานได้ทันที</p></div><div class="voter-tools"><label><span>⌕</span><input id="voterSearch" type="search" placeholder="ค้นหารหัสนักเรียน"></label><select id="roomFilter"><option value="all">ทุกห้อง</option>${getRooms().map((room) => `<option value="${room}">${room}</option>`).join('')}</select></div></div><div class="voter-summary"><span><i class="voter-dot used"></i>ใช้สิทธิแล้ว ${votedIds.size}</span><span><i class="voter-dot"></i>ยังไม่ใช้สิทธิ ${unvoted.length}</span><b>ทะเบียนผู้มีสิทธิ ${eligibleVoters().length} คน</b></div><div class="voter-table-wrap"><table><thead><tr><th>รหัสนักเรียน</th><th>ผู้มีสิทธิ</th><th>ห้อง</th><th>เลขที่</th><th>สถานะ</th></tr></thead><tbody id="voterTable"></tbody></table></div></section>`;
  const table = document.querySelector('#voterTable');
  const updateTable = () => {
    const query = document.querySelector('#voterSearch').value.trim();
    const room = document.querySelector('#roomFilter').value;
    const rows = eligibleVoters().filter((voter) => !votedIds.has(voter.studentId) && (!query || voter.studentId.includes(query)) && (room === 'all' || voter.room === room));
    table.innerHTML = rows.length ? rows.map((voter) => `<tr><td><b>${voter.studentId}</b></td><td>${escapeHTML(voter.name)}</td><td>${voter.room}</td><td>${voter.number}</td><td><span class="pending-badge">ยังไม่ใช้สิทธิ</span></td></tr>`).join('') : '<tr><td colspan="5" class="empty-voter">ไม่พบรายชื่อที่ตรงกับเงื่อนไข</td></tr>';
  };
  document.querySelector('#voterSearch').addEventListener('input', updateTable);
  document.querySelector('#roomFilter').addEventListener('change', updateTable);
  updateTable();
}

function syncElectionPage(force = false) {
  const oldRound = control.round;
  const oldRoundId = control.roundId;
  const oldPhase = electionPhase;
  const oldSchedule = control.schedule;
  control = readControl();
  electionPhase = getElectionPhase();
  electionOpen = electionPhase === 'open';
  const roundChanged = oldRound !== control.round || oldRoundId !== control.roundId;
  const scheduleChanged = JSON.stringify(oldSchedule) !== JSON.stringify(control.schedule);
  if (oldRoundId !== control.roundId) {
    votingSession = null;
    recordedRound = null;
    ballotDropRound = null;
    selectedCandidate = null;
  }
  if (force || roundChanged || scheduleChanged || oldPhase !== electionPhase) {
    const oldCandidates = candidates;
    candidates = loadCandidates();
    const keepOpenScreen = !roundChanged && oldPhase === 'open' && electionOpen &&
      !(scheduleChanged && electionContent?.querySelector('.countdown-clock')) &&
      (useCloudRound ? oldCandidates === candidates || electionContent?.querySelector('#loginForm') : scheduleChanged);
    if (!keepOpenScreen) renderElection();
    updateCountdown();
    updateElectionStatus();
    const active = document.querySelector('[data-admin-tab].active');
    if (adminDialog?.open && active && (roundChanged || scheduleChanged || oldPhase !== electionPhase)) {
      const keepDraft = !roundChanged && !scheduleChanged && active.dataset.adminTab === 'status';
      const draftForm = keepDraft ? document.querySelector('#scheduleForm') : null;
      const draft = draftForm ? new FormData(draftForm) : null;
      renderAdmin(active.dataset.adminTab);
      if (draft) {
        const form = document.querySelector('#scheduleForm');
        for (const [name, value] of draft) form.elements.namedItem(name).value = value;
      }
    }
  }
}

window.addEventListener('storage', (event) => {
  if (event.storageArea !== localStorage) return;
  if (cloudReadEnabled) return;
  if (event.key === storageKeys.rosterChanged) {
    location.reload();
    return;
  }
  if (event.key === null || [storageKeys.candidates, storageKeys.control, storageKeys.open, storageKeys.started].includes(event.key)) {
    syncElectionPage(true);
  } else if (event.key === voteKey()) {
    if (electionContent && (electionPhase === 'published' || getVotes().length)) renderElection();
    updateElectionStatus();
  }
});
window.addEventListener('pagehide', (event) => {
  if (event.persisted && electionContent?.querySelector('.results-dashboard')) {
    electionContent.classList.add('results-restoring');
  }
});
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  revealedResultsRound = null;
  electionContent?.querySelector('.results-reveal')?.remove();
  syncElectionPage(true);
  electionContent?.classList.remove('results-restoring');
});
setInterval(() => {
  if (control.schedule && getElectionPhase() !== electionPhase) syncElectionPage();
  if (cloudReadEnabled && !useCloudRound && getElectionPhase(Date.now(), cloudRound) !== displayedCloudPhase) {
    updateElectionStatus();
  }
  updateCountdown();
}, 1000);

let previousRoundPayload;
async function watchElectionControl() {
  let delay = 2500;
  try {
    const { roundId, settings } = await electionRequest('/api/round');
    if (!Number.isSafeInteger(roundId) || roundId < 1 || !settings) throw new Error('Invalid round');
    const key = JSON.stringify([roundId, settings]);
    const recovered = roundServiceUnavailable;
    roundServiceUnavailable = false;
    if (key !== previousRoundPayload || recovered) {
      const { open, close, publish } = settings.schedule ?? {};
      const schedule = [open, close, publish].every(Number.isFinite) && open < close && close <= publish
        ? { open, close, publish } : null;
      cloudRound = { roundId, round: roundId, schedule, manual: schedule && settings.manualClosed ? 'closed' : null };
      const next = readCloudCandidates(settings.candidates);
      if (JSON.stringify(next) !== JSON.stringify(cloudCandidates)) cloudCandidates = next;
      previousRoundPayload = key;
      if (useCloudRound) syncElectionPage(true);
      else updateElectionStatus();
    }
  } catch {
    delay = 5000;
    if (!roundServiceUnavailable) {
      roundServiceUnavailable = true;
      if (!cloudRound && useCloudRound) syncElectionPage(true);
      if (!useCloudRound) updateElectionStatus();
    }
  } finally {
    setTimeout(watchElectionControl, delay);
  }
}

function readCloudCandidates(value) {
  return Object.entries(value ?? {})
    .filter(([id, candidate]) => /^[1-9]\d{0,8}$/.test(id) && typeof candidate?.name === 'string')
    .map(([id, candidate], index) => ({
      ...candidateThemes[index % candidateThemes.length], no: Number(id), name: candidate.name,
      ...(/^#[\da-f]{6}$/i.test(candidate.color) ? { color: candidate.color } : {}),
      team: candidate.team ?? '', vision: candidate.vision ?? '', room: candidate.room ?? '', photoURL: candidate.photoURL ?? ''
    }));
}

void watchElectionControl();

renderElection();
updateElectionStatus();
