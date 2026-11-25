const roomPlans = ['SMTE', 'SMTE', 'SCi-10', 'HSIP', 'Vit-Kanit', 'Vit-Kanit', 'NitiRat', 'Japanese', 'Chinese', 'IEP', 'Social', 'Math'];
const roomHexagons = [
  [88, 90], [166, 225], [88, 360],
  [323, 90], [401, 225], [323, 360],
  [596, 78], [596, 222], [735, 294], [874, 78], [874, 222], [874, 366]
];
const roomConstellationLinks = [[1, 2], [2, 3], [4, 5], [5, 6], [7, 8], [8, 9], [9, 11], [9, 12], [10, 11], [11, 12]];
const rankingConstellation = '<span class="ranking-constellation" aria-hidden="true"><i>✧</i><i>✦</i><i>✧</i></span>';
const resultNumber = new Intl.NumberFormat('th-TH');
const resultPercent = (count, total) => total ? 100 * count / total : 0;
const resultPercentLabel = (value) => `${value.toLocaleString('th-TH', {maximumFractionDigits: 2})}%`;
const resultColor = (candidate) => /^#[a-f\d]{6}$/i.test(candidate?.color) ? candidate.color : '#a694bb';

const roomEngraving = {
  0: 'M5.5 0C2.7 2 1 4.6 1 8.7c0 4.2 1.8 7 4.5 8.3C8.2 15.7 10 12.9 10 8.7 10 4.6 8.3 2 5.5 0ZM5.5 1.6c1.4 1.8 2 4.4 2 7.1 0 2.8-.6 5.4-2 6.7-1.4-1.3-2-3.9-2-6.7 0-2.7.6-5.3 2-7.1Z',
  1: 'M.5 5.8Q4.5 3.5 7.6 0v13.2q0 2.1 3.2 3.2l-10.1.3q4.4-1.7 4.4-3.6V4.6Z',
  2: 'M1 5Q2.2 1.7 5.7 1C10-.1 11.4 4.8 8.5 8l-5.8 6.4h4.9q1.9-.2 3.3-2.1l-1 4.3H.4l.6-2.3 5.3-6.6q3.1-4.6-.9-5.3Q3.3 2.6 1 5Z',
  3: 'M.8 4.6Q2.4 1 5.9.8c5-.2 5.1 5 1.9 7.1 4 1.3 3.5 7.7-.9 8.8-3.2.9-5.7-.5-6.5-3.2q3 2.7 5.4 1.6c3.7-1.6 2.2-6-.7-6.4l-1.5-.3 1.6-1c2.8-2 2.1-5.2-.8-5Q2.4 2.6.8 4.6Z',
  4: 'M8.2 0 7.9 10.6h2.8l-.7 1.7H7.9v1.4q0 1.7 2.4 2.8H3.4q2.1-1.1 2.1-2.8v-1.4H.2V11ZM5.5 5.1l-3.6 5.5h3.6Z',
  5: 'M2.3 1.3h5.4Q9.8.8 10.4 0L9.2 3.8H3.5l-.5 3.6q5.4-2.2 7.1 2.5c1.2 3.6-1.3 7.5-5.3 7-2.3-.2-3.6-1.6-4.1-3.7q2.4 2.5 4.7 1.9c2.5-.7 3.3-3.6 1.6-5.5Q5.4 7.7 1.4 9.9Z',
  6: 'M10.1 1C5.8 1.1 3.8 3.5 3.2 7.7c4-3.1 7.6-.1 7.4 3.9-.2 3.4-2.5 5.6-5.3 5.4C1.7 16.8.5 13.6.7 10.3 1 4.4 4.7.7 10.1 1ZM5.6 8.2C3.7 8.3 3 10 3.1 12.1c.1 2.2 1 3.5 2.4 3.5 1.5 0 2.4-1.5 2.4-3.8.1-2.3-.7-3.7-2.3-3.6Z',
  7: 'M1.1 1.2h8.2l1.5-.9C7.8 5.8 5.7 11.4 5 17l-2.8-1.7C3.5 10.8 5.8 6.8 8 3.6H3.7L.4 6.1Z',
  8: 'M5.6.8c2.9 0 4.5 1.7 4.5 3.8 0 1.6-1.3 2.8-2.6 3.5 2.1 1 3.1 2.5 3.1 4.1 0 2.9-2.2 4.8-5.1 4.8S.4 15.3.4 12.6c0-1.8 1.3-3.3 3-4.2C2 7.8 1 6.4 1 4.9 1 2.6 2.8.8 5.6.8ZM5.5 2.1c-1.2 0-2.1 1.1-2.1 2.4 0 1.3.7 2.3 2.3 3 1.4-.8 2-1.8 2-3.1 0-1.2-.8-2.3-2.2-2.3ZM5.2 9.2c-1.4.7-2.2 1.7-2.2 3.3 0 1.7.9 3.1 2.5 3.1 1.5 0 2.5-1.3 2.5-2.9 0-1.5-1.1-2.6-2.8-3.5Z',
  9: 'M.9 16.8c4.1-1 6.5-3.4 6.9-7.5-3.8 3.3-7.6.3-7.4-3.6C.6 2.5 2.7.6 5.5.7c3.7.1 5.1 3 4.9 6.6-.2 5.5-4 9.1-9.5 9.5ZM5.4 2.1c-1.4 0-2.3 1.4-2.4 3.6 0 2.1.8 3.6 2.3 3.5 1.6 0 2.5-1.6 2.5-3.6-.1-2.1-1-3.5-2.4-3.5Z',
  A: 'M.8 16L5.6 2 10.1 16M2.6 11h6M0 16h3m5 0h3',
  C: 'M10 5 9.4 2 8.2 3C4 .4 1 4 1 9.3c0 4.7 3 7.8 6.2 6.7L10 13',
  E: 'M10 5 9.4 2H0m2 0v14m-2 0h10l.5-3M2 9h6l.5-1.4',
  H: 'M0 2h4m3 0h4M2 2v14m7-14v14M2 9h7M0 16h4m3 0h4',
  I: 'M1 2h9M5.5 2v14M1 16h9',
  J: 'M3 2h8M8.5 2v10c0 5.7-6.6 5.7-7.5 2l1.5-1.3',
  K: 'M0 2h4m3 0h4M2 2v14M9.5 2 2 10m4-4 4 10M0 16h4m4.1 0h3',
  L: 'M0 2h5M2 2v14m-2 0h9.6l1-3.7',
  M: 'M0 16h3.4M1.5 16V2l4 9 4-9v14m-2 0H11',
  N: 'M0 16h4M2 16V2l7.2 14V2M7 2h4.3',
  O: 'M5.5 1.5C3 1.5 1 4.3 1 9s2 7.5 4.5 7.5S10 13.7 10 9 8 1.5 5.5 1.5Z',
  P: 'M0 2h5.6c6.2 0 6.2 7.4 0 7.4H2M2 2v14M0 16h5',
  R: 'M0 2h5.6c6.2 0 6.2 7.4 0 7.4H2M2 2v14M5.6 9.4 10 16M0 16h5m3 0h3.2',
  S: 'M10 5 9.4 2l-1.1.9C4 .4.1 4 2 7.2c1 1.7 5 1.6 6.6 3.4 2.5 3-1.8 7.1-5.7 4.8l-1.4 1L1 13',
  T: 'M.5 5l.8-3h8.4l.8 3M5.5 2v14M2.8 16h5.4',
  V: 'M0 2h4m3 0h4M1.5 2l4 14 4-14',
  '-': 'M2 9H9'
};

function roomInscription(value, isNumber = false) {
  const letters = Array.from(String(value).toUpperCase());
  const width = letters.length * 13 + 1;
  return `<svg class="room-inscription${isNumber ? ' room-inscription-number' : ''}" viewBox="0 0 ${width} 19" style="--glyph-ratio:${width / 19}" aria-hidden="true" focusable="false">
    ${letters.map((letter, index) => `<path${/\d/.test(letter) ? ' class="engraved-numeral"' : ''} transform="translate(${index * 13 + 1} 1)" d="${roomEngraving[letter] || ''}"></path>`).join('')}
  </svg>`;
}

function roomInscriptionColor(color) {
  const channels = color.slice(1).match(/../g).map((hex) => {
    const value = parseInt(hex, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  const luminance = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  return luminance > .18 ? '#100c16' : '#fff8ed';
}

function roomNumber(value) {
  const match = String(value ?? '').trim().match(/(?:^|\/\s*)0*(1[0-2]|[1-9])$/);
  return Number(match?.[1] ?? 0);
}

function resultScores(tallies, votes) {
  const scores = tallies == null ? tallyVotes(votes) : candidates.map(({ no, name }) =>
    ({ no, name, count: Number(tallies[no]) || 0 })).sort((a, b) => b.count - a.count || a.no - b.no);
  return scores.map((score) => ({ ...score, member: candidates.find(({ no }) => no === score.no) }));
}

function buildRoomResults(votes, roster, aggregate) {
  const rosterRooms = new Map(roster.map((voter) => [voter.studentId, roomNumber(voter.room)]));
  const rooms = roomPlans.map((plan, index) => ({number: index + 1, plan, members: 0, votes: []}));
  for (const voter of roster) {
    const room = rooms[roomNumber(voter.room) - 1];
    if (room) room.members++;
  }
  for (const vote of votes) {
    const room = rooms[(roomNumber(vote.room) || rosterRooms.get(vote.studentId)) - 1];
    if (room) room.votes.push(vote);
  }
  return rooms.map(({number, plan, members, votes}) => {
    if (aggregate) members = aggregate.roomMembers?.[number] ?? 0;
    const counts = aggregate ? aggregate.roomTallies?.[number] ?? {} : null;
    const scores = resultScores(counts, votes);
    const turnout = aggregate ? scores.reduce((total, score) => total + score.count, 0) : votes.length;
    const leaders = scores.filter((score) => score.count > 0 && score.count === scores[0].count);
    const leader = leaders.length === 1 ? leaders[0] : null;
    return {number, plan, members, turnout, scores, leaders, leader,
      percent: members ? resultPercent(leaders[0]?.count ?? 0, members) : null};
  });
}

function resultPortrait(candidate, thumbnail = false) {
  const photo = candidatePhoto(candidate);
  return `<div class="result-portrait${thumbnail ? ' result-thumbnail' : ''}" data-original-photo="${escapeHTML(candidate.originalPhotoId || '')}" style="--candidate:${resultColor(candidate)}"><span aria-hidden="true">${escapeHTML(candidate.icon || '✦')}</span>${thumbnail && photo ? `<div class="result-thumbnail-frame">${photo}</div>` : photo}</div>`;
}

function resultCandidateRoom(room) {
  return room?.trim().replace(/^(?:ม|m)\s*\.\s*/i, 'M.') || 'ไม่ระบุห้อง';
}

function landslideWinner(scores, total) {
  return total > 0 ? scores.find(({count}) => count * 4 >= total * 3) : undefined;
}

function resultsOverview(scores, total) {
  const leaders = scores.filter((score) => score.count > 0 && score.count === scores[0].count);
  const landslide = landslideWinner(scores, total);
  const hero = leaders.length ? leaders.map((score) => `<article class="winner-profile" style="--candidate:${resultColor(score.member)}">
    <div class="winner-stage">${zodiacWheel(true)}${resultPortrait(score.member)}</div>
    <div class="winner-details">
        ${score === landslide ? '<p class="winner-landslide">LandSlide · ชนะอย่างถล่มทลาย</p>' : ''}
        <p>อันดับ 1 · เบอร์ ${escapeHTML(score.no)} · ${escapeHTML(resultCandidateRoom(score.member.room))}</p>
        <h3>${escapeHTML(score.name)}</h3>
        <div class="winner-totals"><span><strong>${resultNumber.format(score.count)}</strong> เสียง</span>
          <span>${resultPercentLabel(resultPercent(score.count, total))} ของผู้ใช้สิทธิ์</span></div></div>
  </article>`).join('') : `<div class="winner-stage results-empty">${zodiacWheel(true)}<h3>ยังไม่มีคะแนน</h3></div>`;

  return `<section class="results-center"><div class="results-section-heading"><h2>${leaders.length > 1 ? 'อันดับหนึ่งร่วม' : leaders.length ? 'ผู้ชนะการเลือกตั้ง' : 'สรุปผลการเลือกตั้ง'}</h2></div>
    <div class="winner-grid">${hero}</div></section>
    <aside class="results-rank results-overview-rank"><h2>อันดับผู้สมัคร</h2><ol>${scores.map((score, index) => {
      const percent = resultPercent(score.count, total);
      const rank = scores.findIndex(({count}) => count === score.count) + 1;
      return `<li class="result-ranking-row${rank === 1 && score.count > 0 ? ' is-leading' : ''}" style="--candidate:${resultColor(score.member)};--rank-order:${Math.min(index, 7)}">
        ${index < scores.length - 1 ? rankingConstellation : ''}
        <div class="ranking-avatar">${resultPortrait(score.member, true)}<span>${rank}</span></div>
        <div class="results-row-profile"><b>${escapeHTML(score.name)}</b>
          <div class="results-row-meta"><span class="ranking-ballot-no">เบอร์ ${escapeHTML(score.no)}</span><span>${escapeHTML(resultCandidateRoom(score.member.room))}</span></div></div>
        <div class="results-row-score"><strong>${resultNumber.format(score.count)}</strong><span>คิดเป็น ${resultPercentLabel(percent)}</span></div>
        <div class="results-track" aria-hidden="true"><i style="width:${percent}%"></i></div></li>`;
    }).join('')}</ol></aside>`;
}

function roomConstellation() {
  return `<div class="room-constellation" aria-hidden="true">${roomConstellationLinks.map(([from, to], index) => {
    const [x, y] = roomHexagons[from - 1];
    const [endX, endY] = roomHexagons[to - 1];
    const dx = endX - x;
    const dy = endY - y;
    return `<i style="--x:${x / 970 * 100}%;--y:${y / 450 * 100}%;--length:${Math.hypot(dx, dy) / 970 * 100}%;--angle:${Math.atan2(dy, dx)}rad;--link-order:${index}"></i>`;
  }).join('')}</div>`;
}

function resultsByRoom(rooms) {
  const rankedRooms = [...rooms].sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1) || a.number - b.number);
  return `<section class="results-center"><div class="results-section-heading"><h2>ผังรุ่น 114</h2>
    <p>เลือกห้องเพื่อดูคะแนนรวมของห้องนั้น</p></div>
    <ul class="room-legend" aria-label="จำนวนห้องที่ผู้สมัครนำ">${candidates.map((candidate) => {
      const won = rooms.filter(({leader}) => leader?.no === candidate.no).length;
      return `<li><i class="result-hex-key" style="--candidate:${resultColor(candidate)}" aria-hidden="true"></i>
        ${escapeHTML(candidate.name)} (${won})</li>`;
    }).join('')}<li><i class="result-hex-key neutral" aria-hidden="true"></i>เสมอหรือยังไม่มีคะแนน</li></ul>
    <div class="room-orbits">${zodiacWheel(true)}<div class="room-map" role="group" aria-label="ห้อง 1 ถึง 12">
      ${roomConstellation()}
      ${rooms.map((room, index) => {
        const [x, y] = roomHexagons[index];
        const label = room.leader ? ` · คะแนนนำ ${room.leader.name}` : room.leaders.length ? ' · คะแนนเสมอ' : ' · ยังไม่มีคะแนน';
        const color = room.leader ? resultColor(room.leader.member) : '#a99ac4';
        return `<button type="button" class="room-hex ${index < 6 ? 'pointed' : 'flat'}${room.leader ? ' has-leader' : ''}" data-room="${room.number}"
           aria-pressed="false" aria-controls="roomResultsDetail" aria-label="ห้อง ${room.number} ${room.plan}${escapeHTML(label)}"
           style="--x:${x / 970 * 100}%;--y:${y / 450 * 100}%;--order:${index};--candidate:${color};--inscription-ink:${room.leader ? roomInscriptionColor(color) : '#fff0c7'}">
           <span class="room-hex-face">${roomInscription(room.number, true)}${roomInscription(room.plan)}</span></button>`;
      }).join('')}</div></div></section>
    <aside class="results-rank room-results-panel" aria-label="ผลการเลือกตั้งรายห้อง">
      <div id="roomResultsIndex">
        <h2>คะแนนนำรายห้อง</h2><p>เทียบกับจำนวนสมาชิกในทะเบียนของแต่ละห้อง</p>
        <div class="room-results-search">
          <input type="search" aria-label="ค้นหาห้อง แผนการเรียน หรือผู้สมัคร" placeholder="ค้นหาห้องหรือผู้สมัคร" aria-controls="roomResultsList">
        </div>
        <ol id="roomResultsList">${rankedRooms.map((room, index) => {
          const leader = room.leader;
          const status = room.leaders.length ? 'คะแนนนำเสมอกัน' : room.members ? 'ยังไม่มีคะแนน' : 'ไม่มีข้อมูลสมาชิก';
          const search = [`ห้อง ${room.number}`, `ห้อง${room.number}`, room.plan, leader?.name].filter(Boolean).join(' ');
          return `<li class="room-index-row" data-room-search="${escapeHTML(search)}" style="--rank-order:${Math.min(index, 7)}">${index < rankedRooms.length - 1 ? rankingConstellation : ''}<button type="button" class="room-rank-row" data-room="${room.number}" aria-controls="roomResultsDetail" style="--candidate:${resultColor(leader?.member)}">
            <span class="room-rank-badge" aria-hidden="true">${room.number}</span>
            <span class="room-rank-name"><b>ห้อง ${room.number}</b><small>${room.plan}</small></span>
            <span class="room-rank-score">${leader
              ? `<span>${escapeHTML(leader.name)}</span><strong>${resultNumber.format(leader.count)} เสียง</strong>
                <small>${room.percent === null ? '–' : resultPercentLabel(room.percent)}</small>`
              : `<small>${status}</small>`}</span>
            ${leader ? resultPortrait(leader.member, true) : '<span class="room-rank-empty" aria-hidden="true">✧</span>'}
            ${leader && room.percent !== null ? `<span class="room-score-track" aria-hidden="true"><i style="width:${Math.min(room.percent, 100)}%"></i></span>` : ''}
          </button></li>`;
        }).join('')}</ol>
        <p id="roomSearchEmpty" role="status" hidden>ไม่พบห้องหรือผู้สมัครที่ตรงกับคำค้น</p>
      </div>
      <div id="roomResultsDetail" hidden></div>
    </aside>`;
}

function roomVoteShareMarkup(room) {
  const shares = room.scores.filter(({ count }) => count > 0);
  const total = shares.reduce((sum, { count }) => sum + count, 0);
  if (!total) return '<div class="room-vote-share"><h3>สัดส่วนคะแนนในห้อง</h3><p>ยังไม่มีคะแนนในห้องนี้</p></div>';

  const segments = shares.map((score) => ({
    name: escapeHTML(score.name),
    count: score.count,
    votes: resultNumber.format(score.count),
    percent: resultPercentLabel(resultPercent(score.count, total)),
    color: resultColor(score.member)
  }));
  return `<div class="room-vote-share"><h3>สัดส่วนคะแนนในห้อง</h3>
    <div class="room-vote-share-track" aria-hidden="true">
      ${segments.map(({ name, count, votes, percent, color }) =>
        `<div class="room-vote-segment" title="${name} · ${votes} เสียง · ${percent}" style="--share:${count};--share-color:${color}">
          <span>${votes} เสียง <b>${percent}</b></span>
        </div>`).join('')}
    </div>
    <ul class="room-vote-share-legend">${segments.map(({ name, votes, percent, color }) =>
      `<li><i aria-hidden="true" style="--share-color:${color}"></i><span>${name}</span>
        <strong>${votes} เสียง · ${percent}</strong></li>`).join('')}</ul>
  </div>`;
}

function showRoomResults(view, room) {
  const index = view.querySelector('#roomResultsIndex');
  const detail = view.querySelector('#roomResultsDetail');
  index.hidden = Boolean(room);
  detail.hidden = !room;
  for (const block of view.querySelectorAll('.room-hex')) {
    block.setAttribute('aria-pressed', String(Number(block.dataset.room) === room?.number));
  }
  if (!room) {
    detail.innerHTML = '';
    return index.querySelector('h2');
  }
  detail.innerHTML = `<button type="button" class="room-results-back" data-room-back>กลับไปดูทุกห้อง</button>
    <h2 tabindex="-1">ห้อง ${room.number} · ${room.plan}</h2>
    <p>ใช้สิทธิ์ ${resultNumber.format(room.turnout)} คน · สมาชิกในทะเบียน ${resultNumber.format(room.members)} คน</p>
    <ol>${room.scores.map((score, index) => `<li class="room-detail-row" style="--rank-order:${Math.min(index, 7)}">
      ${index < room.scores.length - 1 ? rankingConstellation : ''}
      ${resultPortrait(score.member, true)}<span><b>${escapeHTML(score.name)}</b><small>เบอร์ ${escapeHTML(score.no)}</small></span>
      <strong>${resultNumber.format(score.count)} เสียง</strong></li>`).join('')}</ol>
    ${roomVoteShareMarkup(room)}`;
  applyResultCutouts(detail);
  return detail.querySelector('h2');
}

function zodiacWheel(withMotion = false) {
  return `<div class="result-zodiac" aria-hidden="true"><div class="zodiac-dial">
    ${Array.from('♈♉♊♋♌♍♎♏♐♑♒♓', (sign, index) => {
      const angle = index * Math.PI / 6;
      return `<span style="--x:${50 + 45 * Math.sin(angle)}%;--y:${50 - 45 * Math.cos(angle)}%">${sign}&#xfe0e;</span>`;
    }).join('')}
  </div><div class="zodiac-orbits"></div><i class="zodiac-star first">✦</i><i class="zodiac-star second">✧</i><i class="zodiac-star third">✦</i>
    ${withMotion ? zodiacMotion() : ''}</div>`;
}

function zodiacMotion() {
  const stars = [[13, 20], [5, 43], [16, 71], [23, 88], [42, 95], [59, 8], [79, 15], [90, 29], [96, 52], [86, 69], [78, 88], [65, 95]];
  return `<div class="zodiac-motion">
    <span class="zodiac-nebula"></span>
    <span class="zodiac-satellite"></span><span class="zodiac-satellite reverse"></span>
    <span class="zodiac-meteor"><i></i></span><span class="zodiac-meteor second"><i></i></span>
    ${stars.map(([x, y], index) => `<span class="zodiac-spark" style="--spark-x:${x}%;--spark-y:${y}%;--spark-delay:${index % 5 * -.66}s"></span>`).join('')}
  </div>`;
}

function renderResultsDashboard(container, votes = [], aggregate) {
  const eligible = aggregate ? [] : eligibleVoters();
  const grade = (room) => room.includes('/') ? room.split('/')[0] : '';
  const authorizedGrades = new Set(eligible.map((voter) => grade(voter.room)));
  const roster = aggregate ? [] : getRoster().filter((voter) => authorizedGrades.has(grade(voter.room)));
  const rooms = buildRoomResults(votes, roster, aggregate);
  const scores = resultScores(aggregate?.tallies, votes);
  const total = aggregate?.total ?? votes.length;
  const eligibleCount = aggregate?.eligibleCount ?? eligible.length;
  const active = container.querySelector('[data-view][aria-pressed="true"]')?.dataset.view || 'overview';
  const selectedRoom = Number(container.querySelector('.room-hex[aria-pressed="true"]')?.dataset.room);
  const turnout = resultPercent(total, eligibleCount);
  const motionEnabled = sessionStorage.getItem('election2569-results-motion') !== 'paused';
  const dashboardMarkup = `<div class="results-dashboard" data-motion="${motionEnabled ? 'on' : 'paused'}">
    <aside class="results-sidebar">
      <header class="results-title"><p>รุ่น 114 · ปีการศึกษา 2569</p><h1>ผลการ<br>เลือกตั้ง</h1></header>
      <nav aria-label="มุมมองผลการเลือกตั้ง"><button type="button" data-view="overview">ภาพรวม</button>
        <button type="button" data-view="rooms">รายห้อง</button></nav>
      <div class="results-turnout"><span>ผู้มาใช้สิทธิ์</span><strong>${resultNumber.format(total)}</strong>
        <span>จาก ${resultNumber.format(eligibleCount)} คน · ${resultPercentLabel(turnout)}</span>
        <div class="results-track" aria-hidden="true"><i style="width:${Math.min(turnout, 100)}%"></i></div></div>
      <a class="results-back" href="index.html#results">กลับไปยังแดชบอร์ด</a>
      <button type="button" class="results-motion-toggle" aria-pressed="${motionEnabled}">เอฟเฟกต์เคลื่อนไหว</button>
      <button type="button" class="results-motion-toggle results-audio-start">♪ เปิดเพลงประกาศผล</button>
    </aside>
    <div class="results-view" id="resultsView"></div>
  </div>`;
  const activeReveal = container.querySelector('.results-reveal');
  if (activeReveal) {
    container.querySelector('.results-dashboard')?.remove();
    activeReveal.insertAdjacentHTML('beforebegin', dashboardMarkup);
  } else {
    container.innerHTML = dashboardMarkup;
  }
  playResultsOpeningAudio(container);
  const view = container.querySelector('#resultsView');
  const dashboard = container.querySelector('.results-dashboard');
  const motionToggle = dashboard.querySelector('.results-motion-toggle');
  motionToggle.addEventListener('click', () => {
    const enabled = dashboard.dataset.motion !== 'on';
    dashboard.dataset.motion = enabled ? 'on' : 'paused';
    motionToggle.setAttribute('aria-pressed', String(enabled));
    sessionStorage.setItem('election2569-results-motion', dashboard.dataset.motion);
  });
  let roomTrigger;
  function showView(name) {
    for (const button of container.querySelectorAll('[data-view]')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === name));
      button.setAttribute('aria-controls', 'resultsView');
    }
    view.innerHTML = name === 'rooms'
      ? (aggregate?.roomTallies === null ? '<p>รอบนี้มีคะแนนที่บันทึกก่อนเปิดเก็บผลรายห้อง จึงแสดงเฉพาะยอดรวม</p>' : resultsByRoom(rooms))
      : resultsOverview(scores, total);
    roomTrigger = null;
    applyResultCutouts(view);
  }
  for (const button of container.querySelectorAll('[data-view]')) {
    button.addEventListener('click', () => showView(button.dataset.view));
  }
  view.addEventListener('click', (event) => {
    if (event.target.closest('[data-room-back]')) {
      showRoomResults(view, null);
      (roomTrigger || view.querySelector('input[type="search"]')).focus();
      return;
    }
    const button = event.target.closest('[data-room]');
    if (!button) return;
    const room = rooms[Number(button.dataset.room) - 1];
    roomTrigger = button;
    showRoomResults(view, room).focus();
  });
  view.addEventListener('input', (event) => {
    if (!event.target.matches('.room-results-search input')) return;
    const term = event.target.value.trim().toLocaleLowerCase('th');
    let found = false;
    for (const row of view.querySelectorAll('[data-room-search]')) {
      row.hidden = !row.dataset.roomSearch.toLocaleLowerCase('th').includes(term);
      if (!row.hidden) found = true;
    }
    view.querySelector('#roomSearchEmpty').hidden = found;
  });
  showView(active);
  if (active === 'rooms' && selectedRoom && aggregate?.roomTallies !== null) showRoomResults(view, rooms[selectedRoom - 1]);
}

function landslideLettering() {
  const glyphs = {
    L: 'M1 0h12L9 5v24h7l7-7-2 12H0l4-5V5Z',
    A: 'M12 0h2l10 34h-9l3-4-2-7H7l-2 7 3 4H0l3-5Zm-4 19h7l-3.5-12Z',
    N: 'M1 0h8l13 23V5l-4-5h10l-3 5v29h-5L7 10v19l4 5H0l4-5V5Z',
    D: 'M0 0h11c11 0 16 7 16 16 0 11-6 18-16 18H0l4-5V5Zm10 4v26h2c6 0 9-6 9-14 0-7-3-12-9-12Z',
    S: 'M23 0v10l-5-5c-2-2-7-3-9-1-4 5 6 8 10 11 9 7 4 19-7 19-4 0-7-1-9-3l-3 3V22l6 5c4 4 9 5 12 2 4-5-4-8-9-11C-1 13 0 4 7 1c4-2 10-1 13 1Z',
    I: 'M1 0h13l-4 5v24l4 5H0l4-5V5Z',
    E: 'M0 0h23v10l-6-6h-7v11h6l4-4v12l-4-4h-6v11h7l7-7-2 11H0l4-5V5Z'
  };
  const letters = [
    ['L', 3], ['A', 30], ['N', 58], ['D', 89], ['S', 121],
    ['L', 150], ['I', 177], ['D', 195], ['E', 227]
  ];
  return `<svg class="landslide-lettering" viewBox="0 0 254 49" aria-hidden="true" focusable="false">
    <defs><linearGradient id="landslide-gold" x2="0" y2="100%"><stop stop-color="#fff1b9"/><stop offset=".41" stop-color="#ffd583"/><stop offset=".7" stop-color="#b67337"/><stop offset="1" stop-color="#ffdd95"/></linearGradient></defs>
    <g class="landslide-glyphs">${letters.map(([letter, x]) => `<path transform="translate(${x} 8)" d="${glyphs[letter]}"></path>`).join('')}</g>
    <path class="landslide-letter-ornament" d="M20 46h98m18 0h98M127 42l4 4-4 3-4-3zM67 4h51m18 0h51M127 0l4 4-4 3-4-3z"></path>
  </svg>`;
}

function landslideThaiLettering() {
  return `<svg class="landslide-thai-lettering" viewBox="0 0 330 57" role="img" aria-label="ชนะอย่างถล่มทลาย">
    <path d="M7 27l5-7 5 7-5 7ZM313 27l5-7 5 7-5 7ZM23 27h19m246 0h19M59 48h212"></path>
    <text x="165" y="35" text-anchor="middle">ชนะอย่างถล่มทลาย</text>
  </svg>`;
}

function animateResultsOpening(container, aggregate) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || container.querySelector('.results-reveal')) return;
  const votes = aggregate ? [] : getVotes();
  const total = aggregate?.total ?? votes.length;
  let landslide = landslideWinner(resultScores(aggregate?.tallies, votes), total);
  const curtain = document.createElement('div');
  curtain.className = landslide ? 'results-reveal has-landslide' : 'results-reveal';
  curtain.setAttribute('aria-hidden', 'true');
  curtain.innerHTML = `${zodiacWheel()}<div class="zodiac-reveal-title"><span>ผลการเลือกตั้งประธานรุ่น</span><strong>114</strong></div>`;
  playResultsOpeningAudio(container);
  container.append(curtain);
  curtain.addEventListener('animationend', (event) => {
    if (event.target !== curtain) return;
    if (!landslide) {
      curtain.remove();
      return;
    }
    const percent = resultPercentLabel(resultPercent(landslide.count, total));
    curtain.innerHTML = `${zodiacWheel()}<div class="landslide-radiance"></div>
      <div class="landslide-title">
        ${landslideThaiLettering()}<strong aria-label="LandSlide">${landslideLettering()}</strong>
        <div class="landslide-score"><b>${percent}</b><span>ของผู้มาใช้สิทธิ์</span></div>
      </div>`;
    landslide = undefined;
    curtain.classList.add('landslide-reveal');
  });
}

let stopResultsOpeningAudio;

function playResultsOpeningAudio(container) {
  if (stopResultsOpeningAudio) return;
  const audio = document.querySelector('#resultsOpeningAudio');
  if (!audio) return;
  audio.volume = 0.25;
  audio.currentTime = 0;

  const observer = new MutationObserver(() => {
    if (!container.querySelector('.results-reveal, .results-dashboard')) stopAudio();
  });
  function showAudioButton() {
    delete container.dataset.resultsAudioPlaying;
  }
  function hideAudioButton() {
    container.dataset.resultsAudioPlaying = 'true';
  }
  function handleAudioClick(event) {
    if (event.target.closest('.results-audio-start')) void playAudio();
  }
  function resumeVisibleAudio() {
    if (!document.hidden && audio.paused) void playAudio();
  }
  function stopAudio() {
    observer.disconnect();
    container.removeEventListener('click', handleAudioClick);
    document.removeEventListener('visibilitychange', resumeVisibleAudio);
    audio.removeEventListener('playing', hideAudioButton);
    audio.removeEventListener('pause', showAudioButton);
    audio.removeEventListener('error', showAudioButton);
    window.removeEventListener('pagehide', stopAudio);
    audio.pause();
    showAudioButton();
    stopResultsOpeningAudio = undefined;
  }
  stopResultsOpeningAudio = stopAudio;
  window.addEventListener('pagehide', stopAudio);
  container.addEventListener('click', handleAudioClick);
  document.addEventListener('visibilitychange', resumeVisibleAudio);
  audio.addEventListener('playing', hideAudioButton);
  audio.addEventListener('pause', showAudioButton);
  audio.addEventListener('error', showAudioButton);
  observer.observe(container, { childList: true });

  function playAudio() {
    return audio.play().catch(() => {
      if (stopResultsOpeningAudio === stopAudio && audio.paused) showAudioButton();
    });
  }
  void playAudio();
}

let portraitSegmenter;
const framedPortraits = new Map();
let portraitQueue = Promise.resolve();

function removeStudioBackdrop({width, height, data}) {
  const readColor = (pixel) => {
    const i = pixel * 4;
    const red = data[i], green = data[i + 1], blue = data[i + 2];
    return {u: red - green, v: blue - green, light: (red + green + blue) / 3};
  };
  const matches = (pixel, reference) => {
    if (data[pixel * 4 + 3] < 32) return true;
    const {u, v, light} = readColor(pixel);
    if (reference.neutral) {
      return Math.abs(light - reference.light) <= 4
        && Math.hypot(u - reference.u, v - reference.v) <= 8;
    }
    const chroma = Math.hypot(u, v);
    const blueStudioTone = reference.u < -12 && reference.v > 8 && u < -12 && v > 8;
    return chroma >= Math.max(17, reference.chroma * .25)
      && (blueStudioTone || u * reference.u + v * reference.v >= chroma * reference.chroma * .94)
      && Math.abs(light - reference.light) <= 80;
  };
  // The top and upper side edges are more likely to show the backdrop than the bottom.
  const xStep = Math.max(1, Math.floor(width / 30));
  const yStep = Math.max(1, Math.floor(height / 30));
  const edges = [[], [], []];
  for (let x = 0; x < width; x += xStep) edges[0].push(x);
  for (let y = yStep; y < height * .78; y += yStep) {
    edges[1].push(y * width);
    edges[2].push(y * width + width - 1);
  }
  const samples = edges.flat();
  let best;
  let bestSupport = 0;
  for (const pixel of samples) {
    const reference = readColor(pixel);
    reference.chroma = Math.hypot(reference.u, reference.v);
    // Bright, nearly neutral backdrops also occur in uploaded JPGs and PNGs.
    reference.neutral = reference.light >= 238 && reference.chroma <= 12;
    if ((!reference.neutral && reference.chroma < 30) || data[pixel * 4 + 3] < 250) continue;
    const support = edges.map((edge) => edge.filter((sample) => matches(sample, reference)).length);
    const count = support.reduce((sum, value) => sum + value, 0);
    if (count > bestSupport && support.filter((value, index) => value >= edges[index].length * .55).length >= 2) {
      best = reference;
      bestSupport = count;
    }
  }
  if (!best || bestSupport < samples.length * .55) return false;

  const size = width * height;
  const visited = new Uint8Array(size);
  const queue = new Int32Array(size);
  let tail = 0;
  const enqueue = (pixel) => {
    if (visited[pixel]) return;
    visited[pixel] = 1;
    if (matches(pixel, best)) queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  for (let head = 0; head < tail; head++) {
    const pixel = queue[head];
    const x = pixel % width;
    if (x > 0) enqueue(pixel - 1);
    if (x < width - 1) enqueue(pixel + 1);
    if (pixel >= width) enqueue(pixel - width);
    if (pixel < size - width) enqueue(pixel + width);
  }
  // A blue screen can also be visible in closed gaps between the subject's arms and head.
  if (best.u < -12 && best.v > 8) {
    const background = new Uint8Array(size);
    for (let index = 0; index < tail; index++) background[queue[index]] = 1;
    for (let pixel = 0; pixel < size; pixel++) {
      if (background[pixel] || !matches(pixel, best)) continue;
      const {u, v} = readColor(pixel);
      if (u < -15 && v > 10 && Math.hypot(u, v) >= 27) queue[tail++] = pixel;
    }
  }
  if (tail < size * (best.neutral ? .06 : .12) || tail > size * .94) return false;
  for (let index = 0; index < tail; index++) data[queue[index] * 4 + 3] = 0;
  return true;
}

async function loadResultPhoto(source) {
  const photo = new Image();
  if (/^https?:\/\//i.test(source)) photo.crossOrigin = 'anonymous';
  photo.src = source;
  await photo.decode();
  return photo;
}

function softenStudioEdge({width, height, data}) {
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const neighbors = alpha[i - 1] + alpha[i + 1] + alpha[i - width] + alpha[i + width];
      data[i * 4 + 3] = Math.min(alpha[i], Math.round((alpha[i] * 2 + neighbors) / 6));
    }
  }
}

function portraitMaskSamples(length, maskLength) {
  return Array.from({length}, (_, i) => {
    const position = Math.max(0, Math.min(maskLength - 1, (i + .5) * maskLength / length - .5));
    const start = Math.floor(position);
    return {start, end: Math.min(start + 1, maskLength - 1), weight: position - start};
  });
}

function refinePortraitEdge({width, height, data}) {
  const original = new Uint8ClampedArray(data);
  const radius = Math.max(2, Math.min(5, Math.round(Math.max(width, height) / 320)));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const alpha = original[index + 3];
      if (alpha === 0 || alpha === 255) continue;
      let weightedAlpha = alpha;
      let totalWeight = 1;
      let foreground = -1;
      let nearest = Infinity;
      for (let dy = -radius; dy <= radius; dy++) {
        if (y + dy < 0 || y + dy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const distance = dx * dx + dy * dy;
          if (!distance || distance > radius * radius || x + dx < 0 || x + dx >= width) continue;
          const sample = ((y + dy) * width + x + dx) * 4;
          const colorDistance = Math.abs(original[sample] - original[index]) +
            Math.abs(original[sample + 1] - original[index + 1]) +
            Math.abs(original[sample + 2] - original[index + 2]);
          const weight = 1 / ((1 + distance) * (1 + (colorDistance / 36) ** 2));
          const sampleAlpha = original[sample + 3];
          weightedAlpha += sampleAlpha * weight;
          totalWeight += weight;
          const match = distance + colorDistance / 64;
          if (sampleAlpha >= 248 && match < nearest) {
            foreground = sample;
            nearest = match;
          }
        }
      }
      const refinedAlpha = weightedAlpha / totalWeight;
      data[index + 3] = refinedAlpha < 12 ? 0 : refinedAlpha;
      if (foreground === -1 || refinedAlpha < 12) continue;
      const blend = (1 - refinedAlpha / 255) * .8;
      for (let channel = 0; channel < 3; channel++) {
        data[index + channel] = original[index + channel] * (1 - blend) + original[foreground + channel] * blend;
      }
    }
  }
}

async function segmentResultPortrait(source, maxSize) {
  const photo = await loadResultPhoto(source);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const ratio = Math.min(1, maxSize / Math.max(photo.naturalWidth, photo.naturalHeight));
  canvas.width = Math.max(1, Math.round(photo.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(photo.naturalHeight * ratio));
  context.imageSmoothingQuality = 'high';
  context.drawImage(photo, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  let transparent = 0;
  for (let index = 3; index < pixels.data.length; index += 4) {
    if (pixels.data[index] < 32) transparent++;
  }
  if (transparent >= canvas.width * canvas.height * .08) return source;
  if (removeStudioBackdrop(pixels)) {
    softenStudioEdge(pixels);
    refinePortraitEdge(pixels);
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/png');
  }
  if (Math.max(canvas.width, canvas.height) > 320) {
    const maskCanvas = document.createElement('canvas');
    const scale = 320 / Math.max(canvas.width, canvas.height);
    maskCanvas.width = Math.max(1, Math.round(canvas.width * scale));
    maskCanvas.height = Math.max(1, Math.round(canvas.height * scale));
    const mask = maskCanvas.getContext('2d');
    mask.imageSmoothingQuality = 'high';
    mask.drawImage(canvas, 0, 0, maskCanvas.width, maskCanvas.height);
    const pixels = mask.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    if (removeStudioBackdrop(pixels)) {
      softenStudioEdge(pixels);
      mask.putImageData(pixels, 0, 0);
      context.globalCompositeOperation = 'destination-in';
      context.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
      const composited = context.getImageData(0, 0, canvas.width, canvas.height);
      refinePortraitEdge(composited);
      context.putImageData(composited, 0, 0);
      return canvas.toDataURL('image/png');
    }
  }

  const packageUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
  portraitSegmenter ??= import(`${packageUrl}/vision_bundle.mjs`).then(async ({FilesetResolver, ImageSegmenter}) => {
    const wasm = await FilesetResolver.forVisionTasks(`${packageUrl}/wasm`);
    return ImageSegmenter.createFromOptions(wasm, {
      baseOptions: {modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite'},
      runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true
    });
  }).catch((error) => { portraitSegmenter = undefined; throw error; });
  const segmenter = await portraitSegmenter;
  let cutout = source;
  segmenter.segment(canvas, (result) => {
    // The binary Selfie Segmenter returns one foreground confidence mask.
    const mask = result.confidenceMasks?.[0];
    if (!mask) return;
    const foreground = mask.getAsFloat32Array();
    const {width, height} = canvas;
    const columns = portraitMaskSamples(width, mask.width);
    const rows = portraitMaskSamples(height, mask.height);
    let visible = 0;
    for (let y = 0; y < height; y++) {
      const {start, end, weight} = rows[y];
      const top = start * mask.width;
      const bottom = end * mask.width;
      for (let x = 0; x < width; x++) {
        const col = columns[x];
        const upper = foreground[top + col.start] * (1 - col.weight) + foreground[top + col.end] * col.weight;
        const lower = foreground[bottom + col.start] * (1 - col.weight) + foreground[bottom + col.end] * col.weight;
        const confidence = upper * (1 - weight) + lower * weight;
        const edge = Math.min(1, Math.max(0, (confidence - .32) / .46));
        const alpha = Math.round(255 * edge * edge * (3 - 2 * edge));
        const index = (y * width + x) * 4 + 3;
        pixels.data[index] = Math.min(pixels.data[index], alpha);
        if (alpha > 127) visible++;
      }
    }
    if (visible < width * height * 0.02) return;
    refinePortraitEdge(pixels);
    context.putImageData(pixels, 0, 0);
    cutout = canvas.toDataURL('image/png');
  });
  return cutout;
}

async function resolveResultPortrait(preview, originalPhotoId, maxSize, minSize) {
  const cacheKey = originalPhotoId && minSize ? portraitCutoutKey(originalPhotoId) : '';
  if (cacheKey) {
    const cached = await portraitStorage('readonly', (store) => store.get(cacheKey)).catch(() => null);
    if (cached?.version === 3 && cached.hasTransparency && cached.src?.startsWith('data:image/png;base64,')) return cached;
  }
  let file = originalPhotoId
    ? await portraitStorage('readonly', (store) => store.get(originalPhotoId)).catch(() => null)
    : null;
  if (!file && /^https?:\/\//i.test(preview)) {
    // The visible image may have been cached from an ordinary, cross-origin <img> request.
    file = await fetch(preview, { mode: 'cors', cache: 'no-store' })
      .then((response) => response.ok ? response.blob() : null).catch(() => null);
  }
  const source = file ? URL.createObjectURL(file) : preview;
  const cutout = await segmentResultPortrait(source, maxSize).catch(() => source);
  const framed = await frameResultPortrait(cutout, maxSize, minSize)
    .catch(() => ({src: cutout, transparentTop: false}));
  if (file && (framed.src !== source || !framed.hasTransparency)) URL.revokeObjectURL(source);
  if (cacheKey && framed.hasTransparency && framed.src.startsWith('data:image/png;base64,')) {
    void portraitStorage('readwrite', (store) => store.put({...framed, version: 3}, cacheKey)).catch(() => {});
  }
  return framed;
}

function portraitBounds({width, height, data}) {
  const rows = new Uint32Array(height);
  const columns = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 96) {
        rows[y]++;
        columns[x]++;
      }
    }
  }
  const enoughPixels = (length) => (count) => count >= Math.max(2, Math.ceil(length * .008));
  const left = columns.findIndex(enoughPixels(height));
  const right = columns.findLastIndex(enoughPixels(height));
  const top = rows.findIndex(enoughPixels(width));
  const bottom = rows.findLastIndex(enoughPixels(width));
  if (left === -1 || top === -1) return [0, 0, width, height];
  const padding = Math.max(2, Math.round(Math.max(right - left, bottom - top) * .018));
  const x = Math.max(0, left - padding), y = Math.max(0, top - padding);
  return [x, y, Math.min(width, right + padding + 1) - x, Math.min(height, bottom + padding + 1) - y];
}

async function frameResultPortrait(source, maxSize, minSize) {
  const photo = await loadResultPhoto(source);
  const input = document.createElement('canvas');
  const factor = Math.min(1, maxSize / Math.max(photo.naturalWidth, photo.naturalHeight));
  input.width = Math.max(1, Math.round(photo.naturalWidth * factor));
  input.height = Math.max(1, Math.round(photo.naturalHeight * factor));
  const inputContext = input.getContext('2d');
  inputContext.imageSmoothingQuality = 'high';
  inputContext.drawImage(photo, 0, 0, input.width, input.height);
  const pixels = inputContext.getImageData(0, 0, input.width, input.height);
  const [x, y, width, height] = portraitBounds(pixels);
  let transparentSamples = 0;
  for (let index = 3; index < pixels.data.length; index += 28) {
    if (pixels.data[index] < 32) transparentSamples++;
  }
  const hasTransparency = transparentSamples > pixels.data.length / 28 * .025;
  const transparentTop = [0, 1, 2, 3, 4].filter((part) =>
    pixels.data[Math.round(part * (input.width - 1) / 4) * 4 + 3] < 32).length >= 3;
  const scale = Math.max(1, minSize / Math.max(width, height));
  if (!hasTransparency) return {src: source, transparentTop, hasTransparency};

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(input, x, y, width, height, 0, 0, canvas.width, canvas.height);
  const output = context.getImageData(0, 0, canvas.width, canvas.height);
  const original = new Uint8ClampedArray(output.data);
  const stride = canvas.width * 4;
  const reach = Math.max(canvas.width, canvas.height) >= 600 ? 2 : 1;
  const vertical = stride * reach;
  const horizontal = 4 * reach;
  for (let row = reach; row < canvas.height - reach; row++) {
    for (let col = reach; col < canvas.width - reach; col++) {
      const index = row * stride + col * 4;
      if (original[index + 3] < 250 || original[index - 1] < 250 || original[index + 7] < 250 ||
          original[index - stride + 3] < 250 || original[index + stride + 3] < 250 ||
          original[index - horizontal + 3] < 250 || original[index + horizontal + 3] < 250 ||
          original[index - vertical + 3] < 250 || original[index + vertical + 3] < 250) continue;
      for (let channel = 0; channel < 3; channel++) {
        const i = index + channel;
        const average = (original[i - horizontal] + original[i + horizontal] +
          original[i - vertical] + original[i + vertical]) / 4;
        const detail = original[i] - average;
        if (Math.abs(detail) > 2) output.data[i] = original[i] + Math.max(-20, Math.min(20, detail * .95));
      }
    }
  }
  context.putImageData(output, 0, 0);
  return {src: canvas.toDataURL('image/png'), transparentTop, hasTransparency};
}

function applyResultCutouts(container) {
  const images = Array.from(container.querySelectorAll('.result-portrait img'), (image) => {
    const portrait = image.closest('.result-portrait');
    const originalPhotoId = portrait.dataset.originalPhoto;
    const preview = image.dataset.electionPhoto || image.src;
    return {image, portrait, originalPhotoId, key: originalPhotoId || preview, large: Boolean(portrait.closest('.winner-stage'))};
  });
  const largePortraits = new Set(images.filter(({large}) => large).map(({key}) => key));
  for (const {image, portrait, originalPhotoId, key} of images) {
    if (image.dataset.electionPhoto) {
      image.addEventListener('error', () => portrait.classList.add('portrait-load-error'), { once: true });
    } else if (image.complete) {
      if (!image.naturalWidth) portrait.classList.add('portrait-load-error');
    } else {
      image.addEventListener('error', () => portrait.classList.add('portrait-load-error'), { once: true });
    }
    const large = largePortraits.has(key) || framedPortraits.has(`large:${key}`);
    const cacheKey = `${large ? 'large' : 'thumb'}:${key}`;
    if (!framedPortraits.has(cacheKey)) {
      const task = portraitQueue.then(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const source = await candidatePortraitSource(image);
        if (!source) return {src: '', transparentTop: false};
        return resolveResultPortrait(source, originalPhotoId, large ? 2400 : 720, large ? 900 : 0);
      }).catch(() => ({src: '', transparentTop: false}));
      framedPortraits.set(cacheKey, task);
      portraitQueue = task;
    }
    void framedPortraits.get(cacheKey).then(async ({src, transparentTop, hasTransparency}) => {
      if (!hasTransparency) framedPortraits.delete(cacheKey);
      if (!image.isConnected || !hasTransparency) return;
      // Keep the original in place until the transparent portrait has decoded.
      const cutout = await loadResultPhoto(src).catch(() => null);
      if (!cutout || !image.isConnected) return;
      image.src = src;
      portrait.classList.remove('portrait-load-error');
      portrait.classList.toggle('has-cutout', transparentTop || portrait.classList.contains('result-thumbnail'));
      if (portrait.closest('.winner-stage')) portrait.classList.add('has-visible-portrait');
    });
  }
}
