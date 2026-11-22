async function uploadCandidatePhoto(roundId, candidateId, file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
    throw new Error('เลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB');
  }
  const bitmap = await createImageBitmap(file);
  bitmap.close();
  const { photoURL } = await electionRequest(`/api/photos/${roundId}/${candidateId}`, { file, admin: true });
  return photoURL;
}

function callElectionAdmin(data) {
  return electionRequest('/api/manageElection', { data, admin: true });
}

async function signInElectionAdmin(email, password) {
  if (typeof auth === 'undefined') throw new Error('เชื่อมต่อ Firebase Authentication ไม่ได้');
  await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
  const { user } = await auth.signInWithEmailAndPassword(email, password);
  if ((await user.getIdTokenResult(true)).claims.admin !== true) {
    await auth.signOut();
    throw new Error('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ');
  }
}

let participationController;

function stopAdminParticipation() {
  participationController?.abort();
  participationController = null;
}

function roomParticipationMarkup(roster) {
  const rooms = new Map();
  for (const voter of roster) {
    if (!rooms.has(voter.room)) rooms.set(voter.room, { eligible: 0, voted: 0 });
    if (!voter.eligible) continue;
    const room = rooms.get(voter.room);
    room.eligible++;
    if (voter.voted) room.voted++;
  }
  const percentage = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2, style: 'percent' });
  return [...rooms].sort(([a], [b]) => a.localeCompare(b, 'th', { numeric: true }))
    .map(([room, { eligible, voted }]) => {
      const label = escapeHTML(room);
      if (!eligible) return `<article><h4>${label}</h4><p>ไม่มีผู้มีสิทธิ์ในรอบนี้</p></article>`;
      const rate = voted / eligible;
      return `<article><h4>${label}</h4><strong>${percentage.format(rate)}</strong>
        <div class="room-turnout-track" aria-hidden="true"><i style="width:${rate * 100}%"></i></div>
        <p>ใช้สิทธิ์แล้ว ${voted} จาก ${eligible} คน · ยังไม่ใช้สิทธิ์ ${eligible - voted} คน</p></article>`;
    }).join('') || '<p>ยังไม่มีทะเบียนรายห้อง</p>';
}

function renderCloudAdmin(state, tab = 'round', feedback = '') {
  stopAdminParticipation();
  const app = document.querySelector('#adminApp');
  const { roundId, settings, roster, history } = state;
  const candidates = Object.entries(settings.candidates ?? {})
    .filter(([id, candidate]) => /^[1-9]\d{0,2}$/.test(id) && candidate)
    .map(([id, candidate], index) => ({
      ...candidate, no: Number(id),
      color: /^#[\da-f]{6}$/i.test(candidate.color) ? candidate.color : candidateThemes[index % candidateThemes.length].color
    }));
  const schedule = settings.schedule;
  const phase = schedule ? getElectionPhase(Date.now(), { schedule, manual: settings.manualClosed ? 'closed' : null }) : 'waiting';
  const started = phase !== 'waiting' || roster.some(({ voted }) => voted);
  const tabs = { round: 'จัดการรอบ', candidates: 'ผู้สมัคร', voters: 'ทะเบียนและการใช้สิทธิ์', history: 'ประวัติรอบ' };
  const button = (action, label) => `<button class="admin-main-action" type="button" data-action="${action}">${label}</button>`;
  app.innerHTML = `<div class="oracle-admin"><aside class="oracle-admin-side">
      <div class="admin-brand"><span>☾</span><div><b>ORACLE</b><small>ผู้ดูแลระบบ</small></div></div>
      <nav class="admin-nav">${Object.entries(tabs).map(([id, label]) => `<button class="${id === tab ? 'active' : ''}" type="button" data-cloud-tab="${id}" aria-pressed="${id === tab}">${label}</button>`).join('')}</nav>
      ${button('signOut', 'ออกจากระบบ')}
    </aside><div class="oracle-admin-main">
      <header class="oracle-admin-hero"><h2>${tabs[tab]}</h2><p>รอบที่ ${roundId}</p></header>
      <section class="admin-settings-card" aria-labelledby="participationHeading">
        <h3 id="participationHeading">การใช้สิทธิ์</h3>
        <p id="participationSummary" aria-live="polite"></p>
        <p id="participationConnection" role="status">กำลังเชื่อมต่อข้อมูลสด</p>
        ${tab === 'voters' ? '<section class="room-turnout" aria-labelledby="roomTurnoutHeading"><h3 id="roomTurnoutHeading">การใช้สิทธิ์รายห้อง</h3><div id="roomTurnoutGrid" class="room-turnout-grid"></div></section>' : ''}
      </section>
      <div class="admin-settings-card"><p id="cloudAdminFeedback" role="status">${escapeHTML(feedback)}</p>${button('read', 'โหลดข้อมูลล่าสุด')}</div>
      <div id="cloudAdminPanel"></div>
    </div></div>`;
  const panel = app.querySelector('#cloudAdminPanel');
  if (tab === 'round') {
    const phases = { waiting: 'รอเปิดหีบ', open: 'เปิดรับคะแนน', closed: 'ปิดหีบ', published: 'ประกาศผลแล้ว' };
    panel.innerHTML = `<form class="admin-settings-card" data-action="schedule"><h3><span id="adminRoundPhase"></span> · กำหนดการเวลาไทย</h3>
      <div class="admin-schedule-grid">${[['open', 'เปิดหีบ'], ['close', 'ปิดหีบ'], ['publish', 'ประกาศผล']].map(([key, title]) => {
        const [date = '', time = ''] = dateInputValue(schedule?.[key]).split('T');
        return `<fieldset class="admin-schedule-slot"><legend>${title}</legend><label>วันที่<input required type="date" name="${key}Date" value="${date}"></label>
          <label>เวลา<input required type="time" name="${key}Time" value="${time}"></label></fieldset>`;
      }).join('')}</div><button class="admin-main-action">บันทึกกำหนดการ</button></form>
      <div id="adminRoundActions" class="admin-actions"></div>`;
    const updateRoundPhase = () => {
      const phase = schedule ? getElectionPhase(Date.now(), { schedule, manual: settings.manualClosed ? 'closed' : null }) : 'waiting';
      const phaseText = panel.querySelector('#adminRoundPhase');
      if (phaseText.textContent === phases[phase]) return;
      phaseText.textContent = phases[phase];
      panel.querySelector('#adminRoundActions').innerHTML =
        (phase === 'open' ? button('close', 'ปิดหีบตอนนี้') : '') +
        (phase === 'closed' ? button('publish', 'ประกาศผลตอนนี้') : '') +
        (phase === 'published' || phase === 'closed' ? button('archive', 'เก็บประวัติและเริ่มรอบใหม่') : '');
    };
    updateRoundPhase();
    const roundTimer = setInterval(() => {
      if (!panel.isConnected || !adminDialog.open) clearInterval(roundTimer);
      else updateRoundPhase();
    }, 1000);
  } else if (tab === 'candidates') {
    const editor = (candidate) => `<form class="admin-settings-card admin-candidate-fields cloud-candidate-form" data-action="candidate">
      ${candidatePhoto(candidate)}
      <label>หมายเลข<input name="no" type="number" min="1" max="999" value="${candidate.no ?? ''}" ${candidate.no ? 'readonly' : ''} required></label>
      ${[['name', 'ชื่อ'], ['team', 'ทีม'], ['vision', 'วิสัยทัศน์'], ['room', 'ห้อง']].map(([key, label]) =>
        `<label>${label}<input name="${key}" value="${escapeHTML(candidate[key])}" ${started ? 'readonly' : ''} ${key === 'name' ? 'required maxlength="150"' : 'maxlength="2000"'}></label>`).join('')}
      <label>รูป JPG, PNG หรือ WebP ไม่เกิน 5 MB<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></label>
      <label>สีผู้สมัคร<input name="color" type="color" value="${candidate.color ?? '#8568a3'}" ${state.candidateColors ? '' : 'disabled'}></label>
      ${candidate.photoURL ? '<label><input type="checkbox" name="removePhoto"> ลบรูปเดิมออกจากหน้าผู้สมัคร</label>' : ''}
      <div class="admin-actions"><button class="admin-main-action">บันทึกผู้สมัคร</button>
      ${candidate.no && !started ? `<button class="admin-danger" type="button" data-action="removeCandidate" data-id="${candidate.no}">ลบผู้สมัคร</button>` : ''}</div></form>`;
    panel.innerHTML = (state.candidateColors ? '' : '<p class="admin-settings-card">ตัวเลือกสีจะใช้งานได้เมื่อเซิร์ฟเวอร์โหลดรุ่นใหม่</p>') +
      candidates.map(editor).join('') + (!started ? editor({}) : '');
  } else if (tab === 'voters') {
    const rooms = [...new Set(roster.map(({ room }) => room))].sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
    panel.innerHTML = `${!started ? `<form class="admin-settings-card" data-action="eligibility"><h3>ห้องที่มีสิทธิ์</h3>
      ${rooms.map((room) => `<label class="admin-room-choice"><input type="checkbox" name="room" value="${escapeHTML(room)}" ${roster.some((voter) => voter.room === room && voter.eligible) ? 'checked' : ''}> ${escapeHTML(room)}</label>`).join('')}
      <button class="admin-main-action">บันทึกสิทธิ์</button></form>
      <form class="admin-settings-card" data-action="roster"><h3>นำเข้าทะเบียน</h3><label>วาง 4 คอลัมน์จาก Excel ตามลำดับ เลขนักเรียน ชื่อ ห้อง และเลขที่<textarea name="rows" rows="6" required></textarea></label>
      <button class="admin-main-action">แทนที่ทะเบียน</button></form>` : ''}
      <section class="admin-settings-card"><h3>รายชื่อผู้มีสิทธิ์</h3>
      <label>แสดงรายชื่อ <select id="participationFilter"><option value="pending">ยังไม่ใช้สิทธิ์</option><option value="voted">ใช้สิทธิ์แล้ว</option><option value="all">ทะเบียนทั้งหมด</option></select></label>
      <div class="voter-table-wrap"><table><thead><tr><th>เลขนักเรียน</th><th>ชื่อ</th><th>ห้อง</th><th>เลขที่</th><th>สถานะ</th></tr></thead><tbody>
      </tbody></table></div><p id="participationEmpty" hidden>ไม่มีรายชื่อในสถานะนี้</p></section>`;
  } else {
    panel.innerHTML = Object.entries(history).filter(([, entry]) => entry).reverse().map(([id, entry]) => `<details class="admin-settings-card"><summary>รอบที่ ${escapeHTML(id)} · ${formatBangkok(entry.ended)}</summary>
      <ul>${Object.entries(entry.candidates ?? {}).filter(([, item]) => item).map(([no, item]) => `<li>${escapeHTML(item.name)} · ${Number(entry.tallies?.[no]) || 0} คะแนน</li>`).join('')}</ul></details>`).join('') ||
      '<p class="admin-settings-card">ยังไม่มีประวัติรอบ</p>';
  }

  const view = app.firstElementChild;
  const message = view.querySelector('#cloudAdminFeedback');
  const participationSummary = view.querySelector('#participationSummary');
  const participationConnection = view.querySelector('#participationConnection');
  const participationFilter = view.querySelector('#participationFilter');
  const roomTurnout = view.querySelector('#roomTurnoutGrid');
  let live = state;
  function updateParticipation() {
    const { roster, roundId, eligibleCount, votedCount, pendingCount } = live;
    participationSummary.textContent =
      `รอบที่ ${roundId} · มีสิทธิ์ ${eligibleCount} คน · ใช้สิทธิ์แล้ว ${votedCount} คน · ยังไม่ใช้สิทธิ์ ${pendingCount} คน`;
    if (roomTurnout) roomTurnout.innerHTML = roomParticipationMarkup(roster);
    if (!participationFilter) return;
    const filter = participationFilter.value;
    const rows = roster.filter((voter) => filter === 'all' || (filter === 'voted' ? voter.voted : voter.eligible && !voter.voted));
    panel.querySelector('tbody').innerHTML = rows.map((voter) =>
      `<tr><td>${escapeHTML(voter.studentId)}</td><td>${escapeHTML(voter.name)}</td><td>${escapeHTML(voter.room)}</td><td>${escapeHTML(voter.number)}</td><td>${voter.voted ? 'ใช้สิทธิ์แล้ว' : voter.eligible ? 'ยังไม่ใช้สิทธิ์' : 'ไม่มีสิทธิ์ในรอบนี้'}</td></tr>`).join('');
    view.querySelector('#participationEmpty').hidden = rows.length > 0;
  }
  participationFilter?.addEventListener('change', updateParticipation);
  updateParticipation();
  participationController = new AbortController();
  void watchAdminParticipation(participationController.signal, (snapshot) => {
    if (!view.isConnected) return;
    live = snapshot;
    participationConnection.textContent = snapshot.roundId === roundId && snapshot.revision === state.revision
      ? 'เชื่อมต่อข้อมูลสดแล้ว' : 'ข้อมูลการใช้สิทธิ์เป็นปัจจุบัน · โหลดข้อมูลล่าสุดก่อนแก้ไขการตั้งค่า';
    updateParticipation();
  }, (message) => {
    if (view.isConnected) participationConnection.textContent = message;
  });
  let busy = false;
  async function run(action, source) {
    if (busy) return;
    busy = true;
    try {
      if (action === 'signOut') {
        stopAdminParticipation();
        await auth.signOut();
        renderAdminLogin();
        return;
      }
      const data = { action, roundId, revision: state.revision };
      const fields = source instanceof HTMLFormElement ? new FormData(source) : null;
      if (action === 'schedule') data.schedule = parseSchedule(fields);
      if (action === 'eligibility') data.rooms = fields.getAll('room');
      if (action === 'roster') data.rows = parseRoster(fields.get('rows'));
      if (action === 'removeCandidate') data.candidateId = Number(source.dataset.id);
      if (action === 'candidate') {
        const no = Number(fields.get('no'));
        const current = candidates.find((candidate) => Number(candidate.no) === no);
        if (!source.elements.namedItem('no').readOnly && current) throw new Error('หมายเลขผู้สมัครนี้มีอยู่แล้ว');
        let photoURL = fields.has('removePhoto') ? '' : current?.photoURL ?? '';
        const file = fields.get('photo');
        if (file?.size) {
          showFeedback(message, 'กำลังอัปโหลดรูปผู้สมัคร', 'info');
          photoURL = await uploadCandidatePhoto(roundId, no, file);
        }
        data.candidate = { no, photoURL, ...Object.fromEntries(['name', 'team', 'vision', 'room'].map((key) => [key, fields.get(key).trim()])) };
        if (fields.has('color')) data.candidate.color = fields.get('color');
      }
      const confirmation = { close: 'ปิดหีบตอนนี้', publish: 'ประกาศผลตอนนี้', archive: 'เก็บประวัติและเริ่มรอบใหม่', roster: 'แทนที่ทะเบียน', removeCandidate: 'ลบผู้สมัคร' }[action];
      if (confirmation && !await confirmAction(`ยืนยัน${confirmation}`, confirmation)) return;
      const result = await callElectionAdmin(data);
      if (view.isConnected) renderCloudAdmin(result, tab, action === 'read' ? 'โหลดข้อมูลล่าสุดแล้ว' : 'บันทึกแล้ว');
    } catch (error) {
      if (view.isConnected) showFeedback(message, error.message || 'บันทึกไม่สำเร็จ');
    } finally {
      busy = false;
    }
  }
  view.addEventListener('submit', (event) => {
    if (!event.target.dataset.action) return;
    event.preventDefault();
    void run(event.target.dataset.action, event.target);
  });
  view.addEventListener('click', (event) => {
    const control = event.target.closest('button');
    if (!control || busy) return;
    if (control.dataset.cloudTab) {
      const current = live.roundId === roundId && live.revision === state.revision ? { ...state, ...live } : state;
      renderCloudAdmin(current, control.dataset.cloudTab);
    }
    else if (control.dataset.action) void run(control.dataset.action, control);
  });
}
