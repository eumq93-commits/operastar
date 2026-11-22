/* =====================================================
   성악가로 살아남기 — 입시편 게임 로직
   화면: 타이틀 → 성부 선택 → (주간 계획 ↔ 무대) → 실기 → 합격 / 회귀
===================================================== */

const SAVE_KEY = "operastar-survive-v1";
const SAVE_VERSION = 1;
const SONG_IDS = Object.keys(SONGS);
const GROUPS = ["가", "나", "다"];

let state = null;          // 저장되는 전체 상태
let plan = { weekday: null, weekend: null }; // 이번 턴 계획 (저장 안 함)
let busy = false;          // 진행 중 중복 클릭 방지

const screen = document.getElementById("screen");

/* ---------- 유틸 ---------- */
const clamp = (v, lo = 0, hi = BALANCE.maxStat) => Math.max(lo, Math.min(hi, v));
const r = v => Math.round(v);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shuffle = arr => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const school = id => SCHOOLS.find(s => s.id === id);

function voiceLabel(v) {
  if (v >= 70) return { text: "좋음", icon: "😊", cls: "good" };
  if (v >= 40) return { text: "보통", icon: "🙂", cls: "ok" };
  if (v >= BALANCE.hoarseVoice) return { text: "피곤함", icon: "😮‍💨", cls: "tired" };
  if (v >= 15) return { text: "쉬었음", icon: "😷", cls: "hoarse" };
  return { text: "망가짐", icon: "🤒", cls: "bad" };
}

function voiceLevel(v) {
  if (v < 15) return "bad";
  if (v < BALANCE.hoarseVoice) return "hoarse";
  return "ok";
}

/* 높을수록 덜 오르는 상승량 */
function gainSkill(amount) {
  const run = state.run;
  if (amount > 0) amount *= (1 - run.skill / 130);
  run.skill = clamp(run.skill + amount);
}
function gainMastery(songId, amount) {
  const run = state.run;
  if (amount > 0) amount *= (1 - run.mastery[songId] / 120);
  run.mastery[songId] = clamp(run.mastery[songId] + amount);
}

function bestSong() {
  return SONG_IDS.reduce((b, id) => (state.run.mastery[id] > state.run.mastery[b] ? id : b), SONG_IDS[0]);
}

/* ---------- 저장 ---------- */
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* 저장소 사용 불가 */ }
}
function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return validSave(data) ? data : null;
  } catch (e) { return null; }
}
function validSave(d) {
  return d && d.version === SAVE_VERSION && d.run && VOICE_TYPES[d.voiceType] && d.world && d.info;
}
function exportSave() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `성악가로살아남기-${state.loop}회차-${CALENDAR[state.run.turn].replace(/\s/g, "")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importSave() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    file.text().then(text => {
      try {
        const d = JSON.parse(text);
        if (!validSave(d)) throw new Error("bad");
        state = d;
        save();
        resumeTurn();
      } catch (e) {
        alert("저장 파일을 읽을 수 없습니다.");
      }
    });
  };
  input.click();
}

/* ---------- 새 게임 / 회차 ---------- */
function newRun(prevMastery) {
  const mastery = {};
  SONG_IDS.forEach(id => {
    mastery[id] = prevMastery ? prevMastery[id] * BALANCE.masteryKeepOnRegress : 0;
  });
  return {
    turn: 0,
    skill: BALANCE.startSkill,
    voice: BALANCE.startVoice,
    mastery,
    boost: false,
    backup: false,
    applied: null,
    entered: -1 // 이 턴의 시작 이벤트를 이미 봤는지
  };
}

function newGame(voiceType, name) {
  const assignedSchools = SCHOOLS.filter(s => s.mode === "assigned");
  const songs = shuffle(SONG_IDS);
  const assigned = {};
  assignedSchools.forEach((s, i) => { assigned[s.id] = songs[i % songs.length]; });
  state = {
    version: SAVE_VERSION,
    name: name || "나",
    voiceType,
    loop: 1,
    world: { assigned },            // 회귀해도 같은 해 → 지정곡은 그대로
    info: { assigned: false, cold: false, accompanist: false, cutoffs: {} }, // 회귀해도 남는 기억
    endings: {},
    run: newRun(null)
  };
  save();
  resumeTurn();
}

/* =====================================================
   모달 (Promise로 선택지 반환)
===================================================== */
const modal = document.getElementById("modal");
const modalCard = document.getElementById("modalCard");

function showModal({ kicker = "", title = "", body = "", choices = ["확인"], speaker = null, wide = false }) {
  return new Promise(resolve => {
    const speakerHtml = speaker
      ? `<div class="speaker"><span class="speaker-icon">${speaker.icon}</span><span>${esc(speaker.name)}</span></div>`
      : "";
    modalCard.className = "modal-card" + (wide ? " wide" : "");
    modalCard.innerHTML = `
      ${kicker ? `<div class="kicker">${kicker}</div>` : ""}
      ${title ? `<h2 class="modal-title">${title}</h2>` : ""}
      ${speakerHtml}
      <div class="modal-body">${body}</div>
      <div class="modal-choices">
        ${choices.map((c, i) => {
          const label = typeof c === "string" ? c : c.label;
          const sub = typeof c === "object" && c.sub ? `<small>${c.sub}</small>` : "";
          const dis = typeof c === "object" && c.disabled ? "disabled" : "";
          return `<button class="btn ${i === 0 ? "primary" : ""}" data-i="${i}" ${dis}>${label}${sub}</button>`;
        }).join("")}
      </div>`;
    modal.hidden = false;
    modalCard.querySelectorAll("[data-i]").forEach(b => {
      b.addEventListener("click", () => {
        modal.hidden = true;
        resolve(Number(b.dataset.i));
      });
    });
    const first = modalCard.querySelector("button:not([disabled])");
    if (first) setTimeout(() => first.focus(), 30);
  });
}

async function teacherSays(lines, title = "입시 레슨") {
  for (let i = 0; i < lines.length; i++) {
    await showModal({
      kicker: title,
      speaker: { icon: "👩‍🏫", name: "입시 레슨 선생님" },
      body: `<p class="dialog">${esc(lines[i])}</p>`,
      choices: [i < lines.length - 1 ? "다음 ▶" : "알겠어요"]
    });
  }
}

function playStage(options) {
  return new Promise(resolve => {
    Stage.play(Object.assign({}, options, {
      images: VOICE_TYPES[state.voiceType].images,
      onEnd: resolve
    }));
  });
}

/* =====================================================
   타이틀 / 성부 선택 / 도감
===================================================== */
function renderTitle() {
  const saved = loadSaved();
  screen.innerHTML = `
    <div class="center-view">
      <div class="title-card">
        <div class="kicker">OPERA TYPE · 회귀형 육성 시뮬레이션</div>
        <h1 class="game-title">성악가로<br>살아남기</h1>
        <div class="chapter">1장 · 입시편</div>
        <p class="tagline">실력이 바닥나거나 입시에 실패하면 고3 3월로 돌아간다.<br>성악가로 살아남아라.</p>
        <div class="stack">
          ${saved ? `<button class="btn primary" id="continueBtn">이어하기 <small>${saved.loop}회차 · ${CALENDAR[saved.run.turn]}</small></button>` : ""}
          <button class="btn ${saved ? "" : "primary"}" id="newBtn">새 게임</button>
          <button class="btn" id="importBtn">저장 파일 불러오기</button>
          ${saved ? `<button class="btn" id="dexBtn">엔딩 도감</button>` : ""}
          <a class="btn ghost" href="./index.html">← OPERA TYPE 자유 연주</a>
        </div>
      </div>
    </div>`;
  if (saved) {
    document.getElementById("continueBtn").onclick = () => { state = saved; resumeTurn(); };
    document.getElementById("dexBtn").onclick = () => { state = saved; renderDex(renderTitle); };
  }
  document.getElementById("newBtn").onclick = async () => {
    if (saved) {
      const c = await showModal({
        title: "새 게임",
        body: "<p>지금 저장된 진행(회차·도감 포함)이 사라집니다. 필요하면 먼저 저장 파일을 내보내세요.</p>",
        choices: ["새로 시작", "취소"]
      });
      if (c !== 0) return;
    }
    renderVoiceSelect();
  };
  document.getElementById("importBtn").onclick = importSave;
}

function renderVoiceSelect() {
  let picked = "tenor";
  const cards = Object.entries(VOICE_TYPES).map(([k, v]) => `
    <button class="voice-card ${k === picked ? "selected" : ""}" data-voice="${k}">
      <div class="voice-img"><img src="${v.images.normal}" alt=""></div>
      <div class="voice-name">${v.label}</div>
    </button>`).join("");
  screen.innerHTML = `
    <div class="center-view">
      <div class="panel-card">
        <div class="kicker">시작</div>
        <h2 class="section-title">성부 선택</h2>
        <p class="muted">성부에 따라 캐릭터가 바뀝니다. (메조소프라노·베이스는 그림이 준비되면 추가)</p>
        <div class="voice-grid">${cards}</div>
        <label class="field">이름
          <input id="nameInput" maxlength="8" placeholder="나" autocomplete="off">
        </label>
        <div class="row">
          <button class="btn" id="backBtn">← 처음으로</button>
          <button class="btn primary" id="goBtn">고3, 3월부터 시작</button>
        </div>
      </div>
    </div>`;
  screen.querySelectorAll("[data-voice]").forEach(b => {
    b.onclick = () => {
      picked = b.dataset.voice;
      screen.querySelectorAll("[data-voice]").forEach(x => x.classList.toggle("selected", x === b));
    };
  });
  document.getElementById("backBtn").onclick = renderTitle;
  document.getElementById("goBtn").onclick = () => newGame(picked, document.getElementById("nameInput").value.trim());
}

function renderDex(back) {
  const items = Object.entries(ENDINGS).map(([id, e]) => {
    const seen = state.endings[id];
    return `
      <div class="dex-item ${seen ? "seen" : ""} ${e.fail ? "fail" : ""}">
        <div class="dex-title">${seen ? esc(e.title) : "???"}</div>
        <div class="dex-text">${seen ? esc(e.text) : "아직 보지 못한 엔딩"}</div>
        ${seen ? `<div class="dex-meta">${seen}회차에 처음 봄</div>` : ""}
      </div>`;
  }).join("");
  const count = Object.keys(state.endings).length;
  screen.innerHTML = `
    <div class="center-view">
      <div class="panel-card wide">
        <div class="kicker">실패 엔딩도 수집 대상</div>
        <h2 class="section-title">엔딩 도감 <small>${count} / ${Object.keys(ENDINGS).length}</small></h2>
        <div class="dex-grid">${items}</div>
        <div class="row"><button class="btn" id="dexBack">← 돌아가기</button></div>
      </div>
    </div>`;
  document.getElementById("dexBack").onclick = back;
}

/* =====================================================
   턴 진입: 고정 이벤트 → 계획 화면
===================================================== */
async function resumeTurn() {
  const run = state.run;
  if (run.entered !== run.turn) {
    run.entered = run.turn;
    save();
    const ok = await enterTurnEvents();
    if (!ok) return; // 실기/회귀 등으로 흐름이 넘어감
  }
  plan = { weekday: null, weekend: null };
  renderPlanner();
}

async function enterTurnEvents() {
  const run = state.run;
  const t = run.turn;

  if (state.loop === 1 && TUTORIAL[t]) await teacherSays(TUTORIAL[t]);
  if (state.loop > 1 && t === 0) await showRegressIntro();

  if (t === FIXED_TURNS.mockExam) await mockExam();
  if (t === FIXED_TURNS.announce) await announceAssigned();
  if (t === FIXED_TURNS.apply) await applySchools();
  if (t === FIXED_TURNS.cold) await coldEvent();
  if (t === FIXED_TURNS.accompanist) await accompanistEvent();
  if (t === FIXED_TURNS.exam) { await finalExams(); return false; }
  save();
  return true;
}

async function showRegressIntro() {
  const infos = futureInfoList();
  await showModal({
    kicker: `회귀 ${state.loop}회차`,
    title: "고3, 3월로 돌아왔다",
    body: `
      <p>눈을 뜨니 다시 고3 첫 레슨 날이다. 하지만 이번엔 기억이 남아 있다.</p>
      <ul class="bullets">
        <li>곡 숙련도가 ${r(BALANCE.masteryKeepOnRegress * 100)}% 남아 있다.</li>
        ${infos.map(i => `<li>${i}</li>`).join("")}
      </ul>`,
    choices: ["다시 시작한다"]
  });
}

/* ---------- 고정 이벤트 ---------- */
async function mockExam() {
  const intro = state.loop === 1
    ? ["오늘은 모의 실기야. 실제 시험처럼 한 곡을 불러 볼 거야.", "망쳐도 회귀하지 않아. 지금 실력이 어느 정도인지 확인하는 무대야."]
    : ["모의 실기 날이다. 이미 아는 무대지만, 몸은 다시 고3이다."];
  await teacherSays(intro, "모의 실기");

  const c = await showModal({
    kicker: "모의 실기",
    title: "어떤 곡을 부를까?",
    body: "<p>망쳐도 회귀하지 않는 연습 무대입니다.</p>",
    choices: [...SONG_IDS.map(id => ({ label: SONGS[id].title, sub: `숙련도 ${r(state.run.mastery[id])}` })),
      ...(state.loop > 1 ? ["이번엔 건너뛴다"] : [])]
  });
  if (c >= SONG_IDS.length) return;
  const songId = SONG_IDS[c];
  const p = examParams(songId, 0.7);
  const res = await playStage({
    song: SONGS[songId], label: `모의 실기 · ${SONGS[songId].title}`,
    timeMult: p.timeMult, hp: p.hp, typoTolerance: p.typo, voiceLevel: voiceLevel(state.run.voice),
    endTime: SONGS[songId].practiceEnd, allowQuit: true
  });
  const score = finalScore(res, songId);
  gainMastery(songId, 5);
  state.run.voice = clamp(state.run.voice - 5);
  const comment = !res.cleared ? "무대가 중간에 끊겼네. 괜찮아, 지금은 3월이야."
    : score >= 75 ? "벌써 이 정도면 상위권 학교도 노려볼 만해."
    : score >= 60 ? "나쁘지 않아. 숙련도를 올리면 점수가 확 오를 거야."
    : "처음엔 다 그래. 실력과 숙련도를 같이 올려 보자.";
  await showModal({
    kicker: "모의 실기 결과",
    title: `${score}점`,
    body: `${resultTable(res)}<p class="dialog">👩‍🏫 ${comment}</p>`
  });
}

async function announceAssigned() {
  const known = state.info.assigned;
  state.info.assigned = true;
  const rows = SCHOOLS.filter(s => s.mode === "assigned").map(s =>
    `<li><b>${s.group}군 ${esc(s.name)}</b> — ${esc(SONGS[state.world.assigned[s.id]].title)}</li>`).join("");
  await showModal({
    kicker: "7월 하순",
    title: "올해 지정곡 공지",
    body: `<ul class="bullets">${rows}</ul>
      <p class="muted">${known ? "기억하던 그대로다." : "자유곡 학교는 셋 중 숙련도가 가장 높은 곡을 고르면 된다."}</p>`
  });
}

async function applySchools() {
  await teacherSays(["9월이야. 원서를 쓸 때가 됐어. 가·나·다군에 한 곳씩, 총 세 곳에 지원할 수 있어."], "원서 접수");
  const applied = {};
  for (const g of GROUPS) {
    const opts = SCHOOLS.filter(s => s.group === g);
    const c = await showModal({
      kicker: `원서 접수 · ${g}군`,
      title: `${g}군 지원 학교`,
      body: `<p class="muted">합격선은 한 번 시험을 본 학교만 알 수 있다.</p>`,
      choices: opts.map(s => ({
        label: `${s.name} <span class="tag">${s.tier}</span>`,
        sub: `${schoolSongText(s)} · 합격선 ${state.info.cutoffs[s.id] ? s.cutoff + "점" : "???"}`
      }))
    });
    applied[g] = opts[c].id;
  }
  state.run.applied = applied;
  save();
}

async function coldEvent() {
  const v = state.run.voice;
  state.info.cold = true;
  if (v >= 70) {
    await showModal({ kicker: "11월 상순", title: "감기 유행", body: "<p>반 친구들이 줄줄이 감기에 걸렸다. 미리 목을 아껴 둔 덕분에 버텼다.</p>" });
  } else {
    state.run.voice = clamp(v - 35);
    await showModal({ kicker: "11월 상순", title: "감기 유행", body: "<p>결국 감기에 걸렸다. 목이 크게 상했다. (목 컨디션이 좋았다면 버틸 수 있었을지도…)</p>" });
  }
}

async function accompanistEvent() {
  state.info.accompanist = true;
  if (state.run.backup) {
    await showModal({ kicker: "12월 하순", title: "반주 선생님 연락 두절", body: "<p>예상대로 반주 선생님이 잠수했다. 미리 섭외해 둔 예비 반주자와 바로 맞춰 봤다.</p>" });
  } else {
    state.run.accompanistTrouble = true;
    SONG_IDS.forEach(id => { state.run.mastery[id] = clamp(state.run.mastery[id] - 5); });
    await showModal({
      kicker: "12월 하순", title: "반주 선생님 연락 두절",
      body: "<p>실기 한 달 전, 반주 선생님이 연락을 받지 않는다. 급히 구한 반주자와는 호흡이 맞지 않는다.</p><p class=\"bad\">모든 곡 숙련도 −5, 실기 무대 HP −1</p>"
    });
  }
}

/* =====================================================
   계획 화면
===================================================== */
function schoolSongText(s) {
  if (s.mode === "free") return "자유곡";
  return state.info.assigned ? `지정곡: ${SONGS[state.world.assigned[s.id]].title}` : "지정곡: 7월 공지";
}

function futureInfoList() {
  const out = [];
  const info = state.info;
  if (info.assigned) {
    const list = SCHOOLS.filter(s => s.mode === "assigned")
      .map(s => `${s.name} = ${SONGS[state.world.assigned[s.id]].title}`).join(", ");
    out.push(`올해 지정곡: ${list}`);
  }
  if (info.cold) out.push("11월 상순에 감기가 유행한다. 그때 목 상태가 '좋음'이면 버틴다.");
  if (info.accompanist) out.push("12월 하순에 반주 선생님이 잠수한다. '예비 반주자 섭외' 카드로 대비할 수 있다.");
  const cut = Object.keys(info.cutoffs);
  if (cut.length) out.push("합격선: " + cut.map(id => `${school(id).name} ${school(id).cutoff}점`).join(", "));
  return out;
}

function actionAvailable(key) {
  const a = ACTIONS[key];
  if (a.requiresInfo && !state.info[a.requiresInfo]) return false;
  if (a.oncePerRun && state.run.backup) return false;
  if (key === "backup" && state.run.turn >= FIXED_TURNS.accompanist) return false;
  return true;
}

function renderPlanner() {
  const run = state.run;
  const vt = VOICE_TYPES[state.voiceType];
  const vl = voiceLabel(run.voice);
  const turnsLeft = FIXED_TURNS.exam - run.turn;
  const infos = futureInfoList();

  const masteryRows = SONG_IDS.map(id => {
    const tags = SCHOOLS.filter(s => s.mode === "assigned" && state.info.assigned && state.world.assigned[s.id] === id)
      .map(s => `<span class="tag">${s.group}군 지정</span>`).join("");
    return `
      <div class="bar-row">
        <div class="bar-label">${esc(SONGS[id].title)} ${tags}</div>
        <div class="bar"><div class="bar-fill mastery" style="width:${run.mastery[id]}%"></div></div>
        <div class="bar-num">${r(run.mastery[id])}</div>
      </div>`;
  }).join("");

  const appliedHtml = run.applied
    ? `<div class="info-box"><div class="info-title">지원 학교</div><ul class="bullets">${GROUPS.map(g => {
        const s = school(run.applied[g]);
        return `<li>${g}군 ${esc(s.name)} · ${schoolSongText(s)}</li>`;
      }).join("")}</ul></div>`
    : "";

  screen.innerHTML = `
    <div class="planner">
      <header class="planner-head">
        <div>
          <div class="date">고3 · ${CALENDAR[run.turn]}</div>
          <div class="muted small">실기까지 ${turnsLeft}턴 (${turnsLeft * 2}주) · 턴 ${run.turn + 1}/${CALENDAR.length}</div>
        </div>
        <div class="head-right">
          ${state.loop > 1 ? `<span class="loop-badge">회귀 ${state.loop}회차</span>` : ""}
          <button class="icon-btn" id="menuBtn" aria-label="메뉴">☰</button>
        </div>
      </header>

      <section class="status">
        <div class="portrait"><img src="${vt.images.normal}" alt=""><div class="pname">${esc(state.name)} · ${vt.label}</div></div>
        <div class="stats">
          <div class="bar-row big">
            <div class="bar-label">실력</div>
            <div class="bar"><div class="bar-fill skill" style="width:${run.skill}%"></div></div>
            <div class="bar-num">${r(run.skill)}</div>
          </div>
          <div class="voice-state ${vl.cls}">목 상태 <b>${vl.icon} ${vl.text}</b>${run.boost ? ` <span class="tag hot">기분 전환 +50%</span>` : ""}</div>
          <div class="sub-title">곡 숙련도</div>
          ${masteryRows}
        </div>
      </section>

      <section class="slots">
        ${slotHtml("weekday", "평일")}
        ${slotHtml("weekend", "주말")}
      </section>

      <button class="btn primary big" id="advanceBtn" ${plan.weekday && plan.weekend ? "" : "disabled"}>이번 턴 진행 ▶</button>

      ${appliedHtml}
      ${infos.length ? `<div class="info-box future"><div class="info-title">🔮 기억 (미래 정보)</div><ul class="bullets">${infos.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>` : ""}
    </div>`;

  bindSlot("weekday");
  bindSlot("weekend");
  document.getElementById("advanceBtn").onclick = advanceTurn;
  document.getElementById("menuBtn").onclick = openMenu;
}

function slotHtml(slot, label) {
  const p = plan[slot];
  const other = plan[slot === "weekday" ? "weekend" : "weekday"];
  const cards = Object.entries(ACTIONS).filter(([k]) => actionAvailable(k)).map(([k, a]) => {
    const blocked = a.oncePerTurn && other && other.action === k;
    return `<button class="action-card ${p && p.action === k ? "selected" : ""}" data-slot="${slot}" data-action="${k}" ${blocked ? "disabled" : ""}
      title="${esc(a.desc)}"><span class="a-icon">${a.icon}</span><span class="a-label">${a.label}</span></button>`;
  }).join("");
  const needsSong = p && ACTIONS[p.action].needsSong;
  const songChips = needsSong ? `<div class="song-chips">${SONG_IDS.map(id =>
    `<button class="chip ${p.song === id ? "selected" : ""}" data-slot="${slot}" data-song="${id}">${esc(SONGS[id].title)}</button>`).join("")}</div>` : "";
  const desc = p ? `<div class="a-desc">${esc(ACTIONS[p.action].desc)}</div>` : `<div class="a-desc muted">행동 카드를 고르세요</div>`;
  return `
    <div class="slot ${p && (!needsSong || p.song) ? "filled" : ""}">
      <div class="slot-title">${label}</div>
      <div class="action-grid">${cards}</div>
      ${songChips}
      ${desc}
    </div>`;
}

function bindSlot(slot) {
  screen.querySelectorAll(`[data-slot="${slot}"][data-action]`).forEach(b => {
    b.onclick = () => {
      const action = b.dataset.action;
      const keepSong = plan[slot] && plan[slot].song;
      plan[slot] = { action, song: ACTIONS[action].needsSong ? (keepSong || bestSong()) : null };
      renderPlanner();
    };
  });
  screen.querySelectorAll(`[data-slot="${slot}"][data-song]`).forEach(b => {
    b.onclick = () => { plan[slot].song = b.dataset.song; renderPlanner(); };
  });
}

async function openMenu() {
  const c = await showModal({
    title: "메뉴",
    body: `<p class="muted">진행은 턴마다 자동 저장됩니다. 브라우저 기록을 지우면 사라질 수 있으니 가끔 내보내 두세요.</p>`,
    choices: ["계속하기", "저장 파일 내보내기", "엔딩 도감", "타이틀로"]
  });
  if (c === 1) exportSave();
  if (c === 2) renderDex(renderPlanner);
  if (c === 3) renderTitle();
}

/* =====================================================
   턴 진행
===================================================== */
async function advanceTurn() {
  if (busy || !plan.weekday || !plan.weekend) return;
  busy = true;
  try {
    const run = state.run;
    const log = [];
    const before = { skill: run.skill, voice: run.voice, mastery: { ...run.mastery } };
    let skillGained = false;
    const boost = run.boost ? 1.5 : 1;
    run.boost = false;

    for (const slot of ["weekday", "weekend"]) {
      const { action, song } = plan[slot];
      const a = ACTIONS[action];
      const f = (run.voice < BALANCE.hoarseVoice ? 0.5 : 1) * boost;
      const slotName = slot === "weekday" ? "평일" : "주말";

      if (action === "stage") {
        const p = practiceParams(song);
        const res = await playStage({
          song: SONGS[song], label: `실전 연습 · ${SONGS[song].title}`,
          timeMult: p.timeMult, hp: p.hp, typoTolerance: p.typo, voiceLevel: voiceLevel(run.voice),
          endTime: SONGS[song].practiceEnd, allowQuit: true
        });
        gainMastery(song, (4 + res.accuracy * 16) * f);
        gainSkill((1 + res.accuracy * 4) * f);
        skillGained = true;
        log.push(`${slotName}: ${a.icon} 실전 연습 — ${SONGS[song].title} (정확도 ${r(res.accuracy * 100)}%)`);
      } else {
        if (a.skill > 0) { gainSkill(a.skill * f); skillGained = true; }
        else if (a.skill < 0) gainSkill(a.skill);
        if (a.mastery && song) gainMastery(song, a.mastery * f);
        if (action === "backup") run.backup = true;
        log.push(`${slotName}: ${a.icon} ${a.label}${song ? ` — ${SONGS[song].title}` : ""}`);
      }
      run.voice = clamp(run.voice + a.voice);
    }

    if (!skillGained) {
      gainSkill(-BALANCE.skillDecay);
      log.push(`연습을 쉬어서 실력이 조금 줄었다.`);
    }
    if (before.voice >= BALANCE.hoarseVoice && run.voice < BALANCE.hoarseVoice) {
      log.push(`목이 쉬었다. 다음 연습은 효과가 절반이다.`);
    }

    await showModal({
      kicker: CALENDAR[run.turn],
      title: "2주 결산",
      body: `<ul class="bullets">${log.map(l => `<li>${esc(l)}</li>`).join("")}</ul>${diffHtml(before)}`
    });

    if (run.skill <= 0) { await regress("slump"); return; }

    // 랜덤 이벤트 (튜토리얼 기간·고정 이벤트 직전 제외)
    if (run.turn >= 2 && run.turn < FIXED_TURNS.exam - 1 && Math.random() < BALANCE.eventChance) {
      await randomEvent();
      if (run.skill <= 0) { await regress("slump"); return; }
    }

    run.turn++;
    save();
    busy = false;
    resumeTurn();
  } finally {
    busy = false;
  }
}

function diffHtml(before) {
  const run = state.run;
  const d = (a, b) => {
    const x = r(b) - r(a);
    return x === 0 ? "" : `<span class="${x > 0 ? "up" : "down"}">${x > 0 ? "+" : ""}${x}</span>`;
  };
  const items = [`실력 ${r(run.skill)} ${d(before.skill, run.skill)}`];
  SONG_IDS.forEach(id => {
    const x = d(before.mastery[id], run.mastery[id]);
    if (x) items.push(`${esc(SONGS[id].title)} ${r(run.mastery[id])} ${x}`);
  });
  const vl = voiceLabel(run.voice);
  items.push(`목 상태 ${vl.icon} ${vl.text}`);
  return `<div class="diff">${items.map(i => `<span>${i}</span>`).join("")}</div>`;
}

async function randomEvent() {
  const ev = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
  let effect = ev.effect || {};
  let resultText = "";
  if (ev.choices) {
    const c = await showModal({ kicker: "이벤트", body: `<p>${esc(ev.text)}</p>`, choices: ev.choices.map(x => x.label) });
    effect = ev.choices[c].effect;
    resultText = ev.choices[c].result;
  }
  const before = { skill: state.run.skill, voice: state.run.voice, mastery: { ...state.run.mastery } };
  applyEffect(effect);
  await showModal({
    kicker: "이벤트",
    body: `<p>${esc(resultText || ev.text)}</p>${diffHtml(before)}`
  });
}

function applyEffect(e) {
  const run = state.run;
  if (e.skill) gainSkill(e.skill);
  if (e.voice) run.voice = clamp(run.voice + e.voice);
  if (e.masteryBest) gainMastery(bestSong(), e.masteryBest);
  if (e.masteryRandom) gainMastery(SONG_IDS[Math.floor(Math.random() * SONG_IDS.length)], e.masteryRandom);
  if (e.boost) run.boost = true;
}

/* =====================================================
   무대 난이도 / 점수
===================================================== */
function ease(songId) {
  return 0.5 * state.run.skill / 100 + 0.5 * state.run.mastery[songId] / 100;
}

function practiceParams(songId) {
  const e = ease(songId);
  return {
    timeMult: 0.75 + e * 0.6,
    hp: 5,
    typo: e >= 0.7 ? 2 : 1
  };
}

function examParams(songId, timeBase) {
  const e = ease(songId);
  let timeMult = timeBase + e * 0.6;
  if (state.run.voice < 15) timeMult *= 0.85;
  let hp = 2 + Math.round(e * 4);
  if (state.run.accompanistTrouble) hp -= 1;
  return { timeMult, hp: Math.max(1, hp), typo: e >= 0.7 ? 2 : 1 };
}

function finalScore(res, songId) {
  const w = BALANCE.examWeights;
  return r(res.accuracy * w.accuracy + state.run.skill * w.skill + state.run.mastery[songId] * w.mastery);
}

function resultTable(res) {
  const c = res.counts;
  return `<div class="result-grid">
    <span class="perfect">PERFECT ${c.PERFECT}</span><span class="good">GOOD ${c.GOOD}</span>
    <span class="pass">PASS ${c.PASS}</span><span class="miss">MISS ${c.MISS}</span>
    <span>정확도 ${r(res.accuracy * 100)}%</span><span>최대 콤보 ${res.maxCombo}</span>
  </div>${res.cleared ? "" : `<p class="bad">${res.quit ? "무대를 중단했다." : "HP가 바닥나 무대가 중단됐다."}</p>`}`;
}

/* =====================================================
   최종 실기 (가 → 나 → 다)
===================================================== */
async function finalExams() {
  const run = state.run;
  if (!run.applied) { // 저장 파일 손상 등 예외
    await applySchools();
  }
  await teacherSays(["드디어 실기야. 지금까지 한 만큼만 보여 주면 돼.", "가·나·다군 순서대로 세 번 무대에 선다. 결과는 마지막에 한꺼번에 발표돼."], "실기 시험");

  const results = [];
  for (const g of GROUPS) {
    const s = school(run.applied[g]);
    let songId;
    if (s.mode === "assigned") {
      songId = state.world.assigned[s.id];
      await showModal({
        kicker: `${g}군 실기`, title: esc(s.name),
        body: `<p>지정곡 <b>${esc(SONGS[songId].title)}</b> (숙련도 ${r(run.mastery[songId])})</p>`,
        choices: ["무대에 선다"]
      });
    } else {
      const c = await showModal({
        kicker: `${g}군 실기`, title: esc(s.name),
        body: "<p>자유곡 학교. 부를 곡을 고르세요.</p>",
        choices: SONG_IDS.map(id => ({ label: SONGS[id].title, sub: `숙련도 ${r(run.mastery[id])}` }))
      });
      songId = SONG_IDS[c];
    }
    const p = examParams(songId, s.timeBase);
    const res = await playStage({
      song: SONGS[songId], label: `${g}군 실기 · ${s.name}`,
      timeMult: p.timeMult, hp: p.hp, typoTolerance: p.typo, voiceLevel: voiceLevel(run.voice),
      allowQuit: false
    });
    const score = finalScore(res, songId);
    const passed = res.cleared && score >= s.cutoff;
    results.push({ school: s, songId, res, score, passed });
    run.voice = clamp(run.voice - 10);
    await showModal({
      kicker: `${g}군 실기 종료`,
      title: esc(s.name),
      body: `${resultTable(res)}<p class="muted">결과는 합격자 발표일에 확인할 수 있다.</p>`,
      choices: [g === "다" ? "합격자 발표 보기" : "다음 학교로"]
    });
  }

  // 발표
  results.forEach(x => { state.info.cutoffs[x.school.id] = true; });
  const rows = results.map(x => `
    <div class="announce-row ${x.passed ? "pass" : "fail"}">
      <div><b>${x.school.group}군 ${esc(x.school.name)}</b><div class="muted small">${esc(SONGS[x.songId].title)}${x.res.cleared ? "" : " · 무대 중단"}</div></div>
      <div class="announce-score">${x.score}점 <small>/ 합격선 ${x.school.cutoff}</small></div>
      <div class="announce-verdict">${x.passed ? "합격" : "불합격"}</div>
    </div>`).join("");
  await showModal({ kicker: "1월 말", title: "합격자 발표", body: `<div class="announce">${rows}</div>`, wide: true });

  const passed = results.filter(x => x.passed);
  if (!passed.length) { await regress("allfail"); return; }

  let chosen = passed[0];
  if (passed.length > 1) {
    const c = await showModal({
      title: "어느 학교에 등록할까?",
      body: "<p>합격한 학교 중 한 곳에 등록합니다. 학교마다 대학편 시작 보너스가 다르다.</p>",
      choices: passed.map(x => ({ label: x.school.name, sub: x.school.bonus }))
    });
    chosen = passed[c];
  }
  await clearChapter(chosen);
}

async function clearChapter(result) {
  const s = result.school;
  if (!state.endings[s.id]) state.endings[s.id] = state.loop;
  state.run.admission = s.id;
  save();
  const e = ENDINGS[s.id];
  screen.innerHTML = `
    <div class="center-view">
      <div class="panel-card ending success">
        <div class="kicker">1장 입시편 클리어 · ${state.loop}회차</div>
        <h2 class="section-title">${esc(e.title)}</h2>
        <p>${esc(e.text)}</p>
        <div class="info-box"><div class="info-title">대학편 시작 보너스</div><p>${esc(s.bonus)}</p></div>
        <p class="muted">2장 대학편은 준비 중입니다. 더 높은 학교를 노리고 싶다면 스스로 회귀할 수 있다.</p>
        <div class="stack">
          <button class="btn primary" id="selfRegressBtn">회귀해서 다시 도전</button>
          <button class="btn" id="dexBtn2">엔딩 도감</button>
          <button class="btn ghost" id="titleBtn">타이틀로</button>
        </div>
      </div>
    </div>`;
  document.getElementById("selfRegressBtn").onclick = () => startNextLoop();
  document.getElementById("dexBtn2").onclick = () => renderDex(() => clearChapter(result));
  document.getElementById("titleBtn").onclick = renderTitle;
}

/* =====================================================
   회귀
===================================================== */
async function regress(cause) {
  const e = ENDINGS[cause];
  const first = !state.endings[cause];
  if (first) state.endings[cause] = state.loop;
  save();
  await showModal({
    kicker: `실패 엔딩${first ? " · 도감에 새로 등록" : ""}`,
    title: esc(e.title),
    body: `<p>${esc(e.text)}</p><p class="regress-text">…그리고 눈앞이 하얘졌다.</p>`,
    choices: ["회귀한다"]
  });
  startNextLoop();
}

function startNextLoop() {
  state.loop++;
  state.run = newRun(state.run.mastery);
  save();
  resumeTurn();
}

/* ---------- 시작 ---------- */
Stage.init();
renderTitle();
