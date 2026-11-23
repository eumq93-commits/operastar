/* =====================================================
   성악가로 살아남기 — 입시편 게임 로직
   화면: 타이틀 → 성부 선택 → (주간 계획 ↔ 무대) → 실기 → 합격 / 회귀
===================================================== */

const SAVE_KEY = "operastar-survive-v1";
const SAVE_VERSION = 1;
const ALL_SONG_IDS = Object.keys(SONGS);
/* 내 성부가 부를 수 있는 곡 */
const songsFor = voice => ALL_SONG_IDS.filter(id => SONGS[id].voices.includes(voice));
const GROUPS = ["가", "나", "다"];

let state = null;          // 저장되는 전체 상태
let plan = { weekday: null, weekend: null }; // 이번 턴 계획 (저장 안 함)
let busy = false;          // 진행 중 중복 클릭 방지

const screen = document.getElementById("screen");

/* ---------- 유틸 ---------- */
const clamp = (v, lo = 0, hi = BALANCE.maxStat) => Math.max(lo, Math.min(hi, v));
const r = v => Math.round(v);
const wait = ms => new Promise(res => setTimeout(res, ms));
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
function mySongs() { return songsFor(state.voiceType); }

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
  return mySongs().reduce((b, id) => (state.run.mastery[id] > state.run.mastery[b] ? id : b), mySongs()[0]);
}

/* =====================================================
   그림 (파일이 없으면 임시 그림)
===================================================== */
function iconHtml(action, size = 40) {
  const src = ART.icon[action];
  const inner = artAvailable(src) ? `<img src="${src}" alt="">` : `<span class="emo">${ACTIONS[action].icon}</span>`;
  return `<span class="ico" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.7)}px">${inner}</span>`;
}

function charImg(pose = "idle", voice = state.voiceType) {
  const sd = ART.sd(voice, pose);
  const fb = VOICE_TYPES[voice].images[pose === "sing" ? "perfect" : pose === "sick" ? "miss" : "normal"];
  return `<img src="${artAvailable(sd) ? sd : fb}" alt="">`;
}

function sceneArtHtml(kind) {
  const src = { title: ART.bgTitle, room: ART.bgRoom, practice: ART.bgPractice, lesson: ART.bgLesson }[kind];
  if (artAvailable(src)) return `<div class="scene-art"><img src="${src}" alt=""></div>`;
  const name = { title: "타이틀", room: "내 방", practice: "연습실", lesson: "레슨실" }[kind];
  const ph = kind === "title" ? `<div class="ph-stage"></div>` : `<div class="ph-room ${kind}"></div>`;
  return `<div class="scene-art">${ph}<span class="ph-label">임시 배경 · ${name}</span></div>`;
}

function setScene(kind) {
  const art = document.querySelector("#scene .scene-art");
  if (art) art.outerHTML = sceneArtHtml(kind);
}

function setCharPose(pose, motion = "bob") {
  const c = document.querySelector("#scene .scene-char");
  if (!c) return;
  c.className = "scene-char " + motion;
  c.innerHTML = charImg(pose);
}

function showSceneBubble(html) {
  const scene = document.getElementById("scene");
  if (!scene) return;
  scene.querySelectorAll(".scene-bubble").forEach(b => b.remove());
  if (!html) return;
  const b = document.createElement("div");
  b.className = "scene-bubble";
  b.innerHTML = html;
  scene.appendChild(b);
}

function floatNums(items) {
  const scene = document.getElementById("scene");
  if (!scene) return;
  items.forEach((it, i) => {
    const el = document.createElement("div");
    el.className = "float-num " + (it.cls || "");
    el.textContent = it.text;
    el.style.left = (40 + (i % 2) * 18 + Math.random() * 6) + "%";
    el.style.top = (46 + Math.floor(i / 2) * 13) + "%";
    el.style.animationDelay = (i * 120) + "ms";
    scene.appendChild(el);
    setTimeout(() => el.remove(), 1400 + i * 120);
  });
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
  ALL_SONG_IDS.forEach(id => {
    mastery[id] = prevMastery ? (prevMastery[id] || 0) * BALANCE.masteryKeepOnRegress : 0;
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
  const songs = shuffle(songsFor(voiceType));
  const assigned = {};
  assignedSchools.forEach((s, i) => { assigned[s.id] = songs[i % songs.length]; });
  state = {
    version: SAVE_VERSION,
    name: name || "나",
    voiceType,
    gender: VOICE_TYPES[voiceType].gender,
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
   모달 · 대화창 (Promise로 선택지 번호 반환)
   speaker가 있으면 화면 아래 RPG 대화창 + 타자 효과
===================================================== */
const modal = document.getElementById("modal");
const modalCard = document.getElementById("modalCard");

function choiceHtml(choices) {
  return `<div class="menu-list">${choices.map((c, i) => {
    const label = typeof c === "string" ? c : c.label;
    const sub = typeof c === "object" && c.sub ? `<small>${c.sub}</small>` : "";
    const dis = typeof c === "object" && c.disabled ? "disabled" : "";
    return `<button class="menu-item" data-i="${i}" ${dis}><span>${label}</span>${sub}</button>`;
  }).join("")}</div>`;
}

function showModal({ kicker = "", title = "", body = "", choices = ["확인"], speaker = null, text = "", wide = false }) {
  return new Promise(resolve => {
    modal.className = "modal" + (speaker ? " dialog-mode" : "");
    modalCard.className = "modal-card px-win" + (wide ? " wide" : "");

    if (speaker) {
      modalCard.innerHTML = `
        <div class="talk">
          <div class="portrait-box">${speaker.art && artAvailable(speaker.art) ? `<img src="${speaker.art}" alt="">` : `<span class="emo">${speaker.emo}</span>`}</div>
          <div>
            <div class="name-tag">${esc(speaker.name)}</div>
            <div class="talk-text typing" id="talkText"></div>
          </div>
        </div>
        <div class="modal-choices">${choiceHtml(choices)}</div>`;
    } else {
      modalCard.innerHTML = `
        ${kicker ? `<div class="modal-kicker">${kicker}</div>` : ""}
        ${title ? `<h2 class="modal-title">${title}</h2>` : ""}
        <div class="modal-body">${body}</div>
        <div class="modal-choices">${choiceHtml(choices)}</div>`;
    }
    modal.hidden = false;

    // 타자 효과
    let typing = false, timer = null;
    const box = modalCard.querySelector("#talkText");
    const finishTyping = () => {
      clearInterval(timer);
      typing = false;
      if (box) { box.textContent = text; box.classList.remove("typing"); }
    };
    if (box) {
      typing = true;
      let i = 0;
      const chars = Array.from(text);
      timer = setInterval(() => {
        i++;
        box.textContent = chars.slice(0, i).join("");
        if (i >= chars.length) finishTyping();
      }, 28);
      box.parentElement.parentElement.addEventListener("click", () => { if (typing) finishTyping(); });
    }

    modalCard.querySelectorAll("[data-i]").forEach(b => {
      b.addEventListener("click", () => {
        if (typing) { finishTyping(); return; }
        modal.hidden = true;
        resolve(Number(b.dataset.i));
      });
    });
    const first = modalCard.querySelector(".menu-item:not([disabled])");
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
  });
}

const TEACHER = { name: "입시 레슨 선생님", emo: "👩‍🏫", get art() { return ART.teacher; } };

async function teacherSays(lines) {
  for (let i = 0; i < lines.length; i++) {
    await showModal({ speaker: TEACHER, text: lines[i], choices: [i < lines.length - 1 ? "다음" : "알겠어요"] });
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
  const chars = Object.keys(VOICE_TYPES).filter(v => !VOICE_TYPES[v].borrowed).map(v => charImg("idle", v)).join("");
  screen.innerHTML = `
    <div class="wrap center">
      <div class="scene title-scene" id="scene">
        ${sceneArtHtml("title")}
        <div class="logo">
          <div class="logo-sub">OPERA TYPE</div>
          <div class="logo-main">성악가로<br>살아남기</div>
          <div class="logo-chapter">1장 · 입시편</div>
        </div>
        <div class="title-chars">${chars}</div>
      </div>
      <div class="px-win">
        <p class="title-tagline">실력이 바닥나거나 입시에 실패하면<br>고3 3월로 돌아간다. 성악가로 살아남아라.</p>
        <div class="menu-list">
          ${saved ? `<button class="menu-item" id="continueBtn"><span>이어하기</span><small>${saved.loop}회차 · ${CALENDAR[saved.run.turn]}</small></button>` : ""}
          <button class="menu-item" id="newBtn"><span>새 게임</span></button>
          <button class="menu-item" id="importBtn"><span>저장 파일 불러오기</span></button>
          ${saved ? `<button class="menu-item" id="dexBtn"><span>엔딩 도감</span></button>` : ""}
          <a class="menu-item" href="./index.html"><span>OPERA TYPE 자유 연주</span></a>
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
  const first = screen.querySelector(".menu-item");
  if (first) first.focus({ preventScroll: true });
}

function renderVoiceSelect() {
  let gender = "female";
  let picked = "soprano";
  const draw = () => {
    const cards = Object.entries(VOICE_TYPES).filter(([, v]) => v.gender === gender).map(([k, v]) => `
      <button class="voice-card ${k === picked ? "selected" : ""}" data-voice="${k}">
        ${charImg("idle", k)}
        <div class="v-name">${v.label}</div>
        ${v.borrowed ? `<div class="borrow">그림 준비 중</div>` : ""}
      </button>`).join("");
    const songs = songsFor(picked).map(id => SONGS[id].title).join(", ");
    const name = (document.getElementById("nameInput") || {}).value || "";
    screen.innerHTML = `
      <div class="wrap center">
        <div class="px-win">
          <div class="win-title">새 게임</div>
          <h2 class="modal-title">나는 어떤 성악가?</h2>
          <div class="sec-label">성별</div>
          <div class="seg">${Object.entries(GENDERS).map(([k, l]) => `<button data-gender="${k}" class="${k === gender ? "on" : ""}">${l}</button>`).join("")}</div>
          <div class="sec-label" style="margin-top:12px">성부</div>
          <div class="voice-grid">${cards}</div>
          <div class="desc-box">🎵 입시곡: ${esc(songs)}</div>
          <label class="field">이름 <input id="nameInput" maxlength="8" placeholder="나" autocomplete="off" value="${esc(name)}"></label>
          <button class="px-btn big" id="goBtn">고3, 3월부터 시작 ▶</button>
          <button class="px-btn sub" id="backBtn">처음으로</button>
        </div>
      </div>`;
    screen.querySelectorAll("[data-gender]").forEach(b => {
      b.onclick = () => {
        gender = b.dataset.gender;
        picked = Object.keys(VOICE_TYPES).find(k => VOICE_TYPES[k].gender === gender);
        draw();
      };
    });
    screen.querySelectorAll("[data-voice]").forEach(b => { b.onclick = () => { picked = b.dataset.voice; draw(); }; });
    document.getElementById("backBtn").onclick = renderTitle;
    document.getElementById("goBtn").onclick = () => newGame(picked, document.getElementById("nameInput").value.trim());
  };
  draw();
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
    <div class="wrap">
      <div class="px-win">
        <div class="win-title">엔딩 도감 ${count} / ${Object.keys(ENDINGS).length}</div>
        <p class="small muted">실패 엔딩도 수집 대상이다.</p>
        <div class="dex-grid">${items}</div>
        <button class="px-btn sub" id="dexBack" style="margin-top:16px">돌아가기</button>
      </div>
    </div>`;
  document.getElementById("dexBack").onclick = back;
}

/* =====================================================
   턴 진입: 고정 이벤트 → 계획 화면
===================================================== */
async function resumeTurn() {
  const run = state.run;
  plan = { weekday: null, weekend: null };
  renderPlanner();
  if (run.entered !== run.turn) {
    run.entered = run.turn;
    save();
    const ok = await enterTurnEvents();
    if (!ok) return; // 실기/회귀 등으로 흐름이 넘어감
    renderPlanner();
  }
}

async function enterTurnEvents() {
  const run = state.run;
  const t = run.turn;

  if (state.loop > 1 && t === 0) await showRegressIntro();
  if (state.loop === 1 && TUTORIAL[t]) await teacherSays(TUTORIAL[t]);

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
        ${infos.map(i => `<li>${esc(i)}</li>`).join("")}
      </ul>`,
    choices: ["다시 시작한다"]
  });
}

/* ---------- 고정 이벤트 ---------- */
async function mockExam() {
  const intro = state.loop === 1
    ? ["오늘은 모의 실기야. 실제 시험처럼 한 곡을 불러 볼 거야.", "망쳐도 회귀하지 않아. 지금 실력이 어느 정도인지 확인하는 무대야."]
    : ["모의 실기 날이다. 이미 아는 무대지만, 몸은 다시 고3이다."];
  await teacherSays(intro);

  const c = await showModal({
    kicker: "모의 실기",
    title: "어떤 곡을 부를까?",
    body: "<p>망쳐도 회귀하지 않는 연습 무대입니다.</p>",
    choices: [...mySongs().map(id => ({ label: SONGS[id].title, sub: `숙련도 ${r(state.run.mastery[id])}` })),
      ...(state.loop > 1 ? ["이번엔 건너뛴다"] : [])]
  });
  if (c >= mySongs().length) return;
  const songId = mySongs()[c];
  const p = stageParams(songId, 1);
  const res = await playStage({
    song: SONGS[songId], label: `모의 실기 · ${SONGS[songId].title}`,
    ...stageOpts(songId, p), endTime: SONGS[songId].practiceEnd, allowQuit: true
  });
  const score = finalScore(res, songId);
  gainMastery(songId, 5);
  state.run.voice = clamp(state.run.voice - 5);
  await showModal({
    kicker: "모의 실기 결과",
    title: `<span class="big-score">${score}</span>점`,
    body: resultTable(res)
  });
  const comment = !res.cleared ? "무대가 중간에 끊겼네. 괜찮아, 지금은 4월이야."
    : score >= 75 ? "벌써 이 정도면 상위권 학교도 노려볼 만해."
    : score >= 60 ? "나쁘지 않아. 숙련도를 올리면 점수가 확 오를 거야."
    : "처음엔 다 그래. 실력과 숙련도를 같이 올려 보자.";
  await teacherSays([comment]);
}

async function announceAssigned() {
  const known = state.info.assigned;
  state.info.assigned = true;
  const rows = SCHOOLS.filter(s => s.mode === "assigned").map(s =>
    `<li><b>${s.group}군 ${esc(s.name)}</b> — ${esc(SONGS[state.world.assigned[s.id]].title)}</li>`).join("");
  await showModal({
    kicker: "7월 하순 · 게시판",
    title: "올해 지정곡 공지",
    body: `<ul class="bullets">${rows}</ul>
      <p class="small muted">${known ? "기억하던 그대로다." : "자유곡 학교는 셋 중 숙련도가 가장 높은 곡을 고르면 된다."}</p>`
  });
}

async function applySchools() {
  await teacherSays(["9월이야. 원서를 쓸 때가 됐어. 가·나·다군에 한 곳씩, 총 세 곳에 지원할 수 있어."]);
  const applied = {};
  for (const g of GROUPS) {
    const opts = SCHOOLS.filter(s => s.group === g);
    const c = await showModal({
      kicker: `원서 접수 · ${g}군`,
      title: `${g}군 지원 학교`,
      body: `<p class="small muted">합격선은 한 번 시험을 본 학교만 알 수 있다.</p>`,
      choices: opts.map(s => ({
        label: `${s.name} <span class="tag">${s.tier}</span>`,
        sub: `${schoolSongText(s)}<br>합격선 ${state.info.cutoffs[s.id] ? s.cutoff + "점" : "???"}`
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
    setCharPose("sick", "");
    await showModal({ kicker: "11월 상순", title: "감기 유행", body: "<p>결국 감기에 걸렸다. 목이 크게 상했다.</p><p class=\"small muted\">(목 컨디션이 좋았다면 버틸 수 있었을지도…)</p>" });
  }
}

async function accompanistEvent() {
  state.info.accompanist = true;
  if (state.run.backup) {
    await showModal({ kicker: "12월 하순", title: "반주 선생님 연락 두절", body: "<p>예상대로 반주 선생님이 잠수했다. 미리 섭외해 둔 예비 반주자와 바로 맞춰 봤다.</p>" });
  } else {
    state.run.accompanistTrouble = true;
    mySongs().forEach(id => { state.run.mastery[id] = clamp(state.run.mastery[id] - 5); });
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

function gauge(value, cls, blocks = 20) {
  const on = Math.round((value / 100) * blocks);
  return `<div class="gauge ${cls}">${Array.from({ length: blocks }, (_, i) => `<i class="${i < on ? "on" : ""}"></i>`).join("")}</div>`;
}

function renderPlanner() {
  const run = state.run;
  const vl = voiceLabel(run.voice);
  const turnsLeft = FIXED_TURNS.exam - run.turn;
  const infos = futureInfoList();

  const masteryRows = mySongs().map(id => {
    const tags = SCHOOLS.filter(s => s.mode === "assigned" && state.info.assigned && state.world.assigned[s.id] === id)
      .map(s => `<span class="tag">${s.group}군</span>`).join(" ");
    return `
      <div class="stat-row song">
        <div class="stat-name">${esc(SONGS[id].title)} ${tags}</div>
        ${gauge(run.mastery[id], "mastery", 12)}
        <div class="stat-num">${r(run.mastery[id])}</div>
      </div>`;
  }).join("");

  const appliedHtml = run.applied
    ? `<div class="px-win info-win"><div class="win-title">지원 학교</div><ul class="bullets">${GROUPS.map(g => {
        const s = school(run.applied[g]);
        return `<li>${g}군 <b>${esc(s.name)}</b> · ${schoolSongText(s)}</li>`;
      }).join("")}</ul></div>`
    : "";

  const pose = run.voice < 15 ? "sick" : run.voice < BALANCE.hoarseVoice ? "sick" : "idle";

  screen.innerHTML = `
    <div class="wrap">
      <div class="scene" id="scene">
        ${sceneArtHtml("room")}
        <div class="scene-char bob">${charImg(pose)}</div>
        <div class="hud">
          <div class="hud-date">고3 · ${CALENDAR[run.turn]}<small>실기까지 ${turnsLeft}턴 · ${run.turn + 1}/${CALENDAR.length}</small></div>
          <div class="hud-right">
            ${state.loop > 1 ? `<span class="loop-badge">회귀 ${state.loop}회차</span>` : ""}
            <button class="hud-btn" id="menuBtn" aria-label="메뉴">☰</button>
          </div>
        </div>
      </div>

      <div class="px-win">
        <div class="win-title">${esc(state.name)} · ${VOICE_TYPES[state.voiceType].label}</div>
        <div class="stat-row"><div>실력</div>${gauge(run.skill, "skill")}<div class="stat-num">${r(run.skill)}</div></div>
        <div class="voice-line">목 상태 <span class="voice-face ${vl.cls}">${vl.icon} ${vl.text}</span>
          ${run.boost ? `<span class="tag gold">기분 전환 +50%</span>` : ""}</div>
        <div class="divider"></div>
        <div class="sec-label">곡 숙련도</div>
        ${masteryRows}
      </div>

      <div class="px-win">
        <div class="win-title">이번 2주 일정</div>
        <div class="schedule">
          ${slotCell("weekday", "평일")}
          ${slotCell("weekend", "주말")}
        </div>
      </div>

      <button class="px-btn big" id="advanceBtn" ${planReady() ? "" : "disabled"}>2주 보내기 ▶</button>

      ${appliedHtml}
      ${infos.length ? `<div class="px-win dark info-win"><div class="win-title" style="background:var(--violet)">🔮 기억 (미래 정보)</div><ul class="bullets">${infos.map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>` : ""}
    </div>`;

  screen.querySelectorAll("[data-slot-open]").forEach(b => { b.onclick = () => openSheet(b.dataset.slotOpen); });
  document.getElementById("advanceBtn").onclick = advanceTurn;
  document.getElementById("menuBtn").onclick = openMenu;
}

function planReady() {
  return ["weekday", "weekend"].every(s => plan[s] && (!ACTIONS[plan[s].action].needsSong || plan[s].song));
}

function slotCell(slot, label) {
  const p = plan[slot];
  if (!p) {
    return `<button class="slot-cell empty ${slot}" data-slot-open="${slot}">
      <div class="slot-day">${label}</div><div class="slot-hint">＋ 카드 놓기</div></button>`;
  }
  const a = ACTIONS[p.action];
  return `<button class="slot-cell ${slot}" data-slot-open="${slot}">
    <div class="slot-day">${label}</div>
    ${iconHtml(p.action, 40)}
    <div class="slot-name">${a.label}</div>
    ${p.song ? `<div class="slot-song">${esc(SONGS[p.song].title)}</div>` : ""}
  </button>`;
}

/* ---------- 카드 선택 시트 ---------- */
const sheetBack = document.getElementById("sheetBack");
const sheet = document.getElementById("sheet");

function openSheet(slot) {
  const label = slot === "weekday" ? "평일" : "주말";
  const other = plan[slot === "weekday" ? "weekend" : "weekday"];
  let pick = plan[slot] ? { ...plan[slot] } : null;

  const draw = () => {
    const cards = Object.entries(ACTIONS).filter(([k]) => actionAvailable(k)).map(([k, a]) => {
      const blocked = (a.oncePerTurn || a.oncePerRun) && other && other.action === k;
      return `<button class="act-card ${pick && pick.action === k ? "selected" : ""}" data-action="${k}" ${blocked ? "disabled" : ""}>
        ${iconHtml(k, 40)}<span class="a-name">${a.label}</span><span class="a-fx">${fxText(a)}</span></button>`;
    }).join("");
    const needsSong = pick && ACTIONS[pick.action].needsSong;
    const songs = needsSong ? `
      <div class="sec-label">곡 고르기</div>
      <div class="song-pick">${mySongs().map(id => {
        const tags = SCHOOLS.filter(s => s.mode === "assigned" && state.info.assigned && state.world.assigned[s.id] === id)
          .map(s => `<span class="tag">${s.group}군</span>`).join("");
        return `<button class="song-opt ${pick.song === id ? "selected" : ""}" data-song="${id}">
          <span>${esc(SONGS[id].title)}${tags} <span class="tag violet">${tierFor(ease(id)).name}</span></span>${gauge(state.run.mastery[id], "mastery", 10)}<span class="stat-num">${r(state.run.mastery[id])}</span></button>`;
      }).join("")}</div>` : "";
    sheet.innerHTML = `
      <div class="sheet-head"><span class="name-tag">${label}</span> 무엇을 할까?</div>
      <div class="card-grid">${cards}</div>
      <div class="desc-box">${pick ? esc(ACTIONS[pick.action].desc) : "카드를 고르세요."}</div>
      ${songs}
      <button class="px-btn" id="sheetOk" ${pick && (!needsSong || pick.song) ? "" : "disabled"}>이 카드로 정하기</button>
      <button class="px-btn sub" id="sheetCancel">닫기</button>`;
    sheet.querySelectorAll("[data-action]").forEach(b => {
      b.onclick = () => {
        const action = b.dataset.action;
        const keep = pick && pick.song;
        pick = { action, song: ACTIONS[action].needsSong ? (keep || bestSong()) : null };
        draw();
      };
    });
    sheet.querySelectorAll("[data-song]").forEach(b => { b.onclick = () => { pick.song = b.dataset.song; draw(); }; });
    document.getElementById("sheetOk").onclick = () => { plan[slot] = pick; closeSheet(); renderPlanner(); };
    document.getElementById("sheetCancel").onclick = closeSheet;
  };
  draw();
  sheetBack.hidden = false;
}

function closeSheet() { sheetBack.hidden = true; }
sheetBack.addEventListener("click", e => { if (e.target === sheetBack) closeSheet(); });

function fxText(a) {
  const parts = [];
  const sign = (v, big) => v > 0 ? "+".repeat(Math.min(3, Math.ceil(v / big))) : "−".repeat(Math.min(3, Math.ceil(-v / big)));
  if (a === ACTIONS.stage) return "실력·숙련도<br>(실력껏)";
  if (a.skill) parts.push("실력" + sign(a.skill, 2));
  if (a.mastery) parts.push("숙련" + sign(a.mastery, 4));
  if (a.voice) parts.push("목" + sign(a.voice, 10));
  return parts.join(" ") || "대비";
}

async function openMenu() {
  const c = await showModal({
    title: "메뉴",
    body: `<p class="small muted">진행은 턴마다 자동 저장됩니다. 브라우저 기록을 지우면 사라질 수 있으니 가끔 내보내 두세요.</p>`,
    choices: ["계속하기", "저장 파일 내보내기", "엔딩 도감", "타이틀로"]
  });
  if (c === 1) exportSave();
  if (c === 2) renderDex(renderPlanner);
  if (c === 3) renderTitle();
}

/* =====================================================
   턴 진행 (장면 연출 → 결산 → 이벤트)
===================================================== */
async function advanceTurn() {
  if (busy || !planReady()) return;
  busy = true;
  try {
    const run = state.run;
    const log = [];
    const before = snapshot();
    let skillGained = false;
    const boost = run.boost ? 1.5 : 1;
    run.boost = false;
    document.getElementById("advanceBtn").disabled = true;

    for (const slot of ["weekday", "weekend"]) {
      const { action, song } = plan[slot];
      const a = ACTIONS[action];
      const f = (run.voice < BALANCE.hoarseVoice ? 0.5 : 1) * boost;
      const slotName = slot === "weekday" ? "평일" : "주말";
      const pre = snapshot();

      if (action === "stage") {
        const p = stageParams(song, 1.1);
        const res = await playStage({
          song: SONGS[song], label: `실전 연습 · ${SONGS[song].title}`,
          ...stageOpts(song, p), endTime: SONGS[song].practiceEnd, allowQuit: true
        });
        gainMastery(song, (4 + res.accuracy * 16) * f);
        gainSkill((1 + res.accuracy * 4) * f);
        skillGained = true;
        log.push(`${slotName}: 실전 연습 — ${SONGS[song].title} (정확도 ${r(res.accuracy * 100)}%)`);
      } else {
        let g = f;
        let note = "";
        if (a.minigame) {
          const m = await MiniGames.play(a.minigame, { ease: song ? ease(song) : run.skill / 100 });
          g *= m.skipped ? BALANCE.minigameSkip : 0.5 + m.ratio;
          note = m.skipped ? " (미니게임 건너뜀)" : ` (미니게임 ${r(m.ratio * 100)}점)`;
        }
        if (a.skill > 0) { gainSkill(a.skill * g); skillGained = true; }
        else if (a.skill < 0) gainSkill(a.skill);
        if (a.mastery && song) gainMastery(song, a.mastery * g);
        if (action === "backup") run.backup = true;
        log.push(`${slotName}: ${a.label}${song ? ` — ${SONGS[song].title}` : ""}${note}`);
      }
      run.voice = clamp(run.voice + a.voice);

      await playMontage(slotName, action, song, pre);
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

    // 랜덤 이벤트 (튜토리얼 기간·실기 직전 제외)
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

function snapshot() {
  return { skill: state.run.skill, voice: state.run.voice, mastery: { ...state.run.mastery } };
}

/* 장면: 배경 전환 + 캐릭터 동작 + 숫자가 떠오름 */
async function playMontage(slotName, action, song, pre) {
  const run = state.run;
  setScene(ACTION_SCENE[action]);
  setCharPose(action === "rest" ? "rest" : (action === "theory" || action === "backup") ? "idle" : "sing", action === "rest" ? "bob" : "act");
  showSceneBubble(`${iconHtml(action, 24)}${slotName} · ${ACTIONS[action].label}`);
  const items = [];
  const ds = r(run.skill) - r(pre.skill);
  if (ds) items.push({ text: `실력 ${ds > 0 ? "+" : ""}${ds}`, cls: ds < 0 ? "minus" : "" });
  if (song) {
    const dm = r(run.mastery[song]) - r(pre.mastery[song]);
    if (dm) items.push({ text: `숙련 ${dm > 0 ? "+" : ""}${dm}`, cls: "" });
  }
  const dv = r(run.voice) - r(pre.voice);
  if (dv) items.push({ text: dv > 0 ? "목 회복" : "목 −", cls: dv > 0 ? "voice" : "minus" });
  await wait(250);
  floatNums(items);
  await wait(1150);
  showSceneBubble(null);
}

function diffHtml(before) {
  const run = state.run;
  const d = (a, b) => {
    const x = r(b) - r(a);
    return x === 0 ? "" : `<span class="${x > 0 ? "up" : "down"}">${x > 0 ? "+" : ""}${x}</span>`;
  };
  const items = [`실력 ${r(run.skill)} ${d(before.skill, run.skill)}`];
  mySongs().forEach(id => {
    const x = d(before.mastery[id], run.mastery[id]);
    if (x) items.push(`${esc(SONGS[id].title)} ${r(run.mastery[id])} ${x}`);
  });
  const vl = voiceLabel(run.voice);
  items.push(`목 ${vl.icon} ${vl.text}`);
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
  const before = snapshot();
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
  if (e.masteryRandom) gainMastery(mySongs()[Math.floor(Math.random() * mySongs().length)], e.masteryRandom);
  if (e.boost) run.boost = true;
}

/* =====================================================
   무대 난이도 / 점수
===================================================== */
function ease(songId) {
  return 0.5 * state.run.skill / 100 + 0.5 * state.run.mastery[songId] / 100;
}

function tierFor(e) {
  return STAGE_TIERS.reduce((t, x) => (e >= x.min ? x : t), STAGE_TIERS[0]);
}

/* 연습량(실력·숙련도)이 무대의 여유를 정한다 */
function stageParams(songId, schoolSpeed = 1) {
  const e = ease(songId);
  const tier = tierFor(e);
  let timeMult = tier.timeMult * schoolSpeed;
  if (state.run.voice < 15) timeMult *= 0.85;
  let hp = 3 + tier.hpBonus;
  if (state.run.accompanistTrouble) hp -= 1;
  return {
    timeMult, hp: Math.max(1, hp), typo: tier.typo,
    lookahead: tier.lookahead, preview: tier.preview, tierName: tier.name
  };
}

function stageOpts(songId, p) {
  return {
    timeMult: p.timeMult, hp: p.hp, typoTolerance: p.typo, lookahead: p.lookahead,
    preview: p.preview, tierName: p.tierName, voiceLevel: voiceLevel(state.run.voice)
  };
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
  if (!run.applied) await applySchools(); // 저장 파일 손상 등 예외
  await teacherSays(["드디어 실기야. 지금까지 한 만큼만 보여 주면 돼.", "가·나·다군 순서대로 세 번 무대에 선다. 결과는 마지막에 한꺼번에 발표돼."]);

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
        choices: mySongs().map(id => ({ label: SONGS[id].title, sub: `숙련도 ${r(run.mastery[id])}` }))
      });
      songId = mySongs()[c];
    }
    const p = stageParams(songId, s.timeBase);
    const res = await playStage({
      song: SONGS[songId], label: `${g}군 실기 · ${s.name}`,
      ...stageOpts(songId, p), allowQuit: false
    });
    const score = finalScore(res, songId);
    const passed = res.cleared && score >= s.cutoff;
    results.push({ school: s, songId, res, score, passed });
    run.voice = clamp(run.voice - 10);
    await showModal({
      kicker: `${g}군 실기 종료`,
      title: esc(s.name),
      body: `${resultTable(res)}<p class="small muted">결과는 합격자 발표일에 확인할 수 있다.</p>`,
      choices: [g === "다" ? "합격자 발표 보기" : "다음 학교로"]
    });
  }

  // 발표
  results.forEach(x => { state.info.cutoffs[x.school.id] = true; });
  const rows = results.map(x => `
    <div class="announce-row ${x.passed ? "pass" : "fail"}">
      <div><b>${x.school.group}군 ${esc(x.school.name)}</b><div class="small muted">${esc(SONGS[x.songId].title)}${x.res.cleared ? "" : " · 무대 중단"}</div></div>
      <div class="announce-score">${x.score}점 <small>/ ${x.school.cutoff}</small></div>
      <div class="stamp">${x.passed ? "합격" : "불합격"}</div>
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
    <div class="wrap center">
      <div class="scene" id="scene">
        ${sceneArtHtml("title")}
        <div class="scene-char act" style="left:50%">${charImg("sing")}</div>
      </div>
      <div class="px-win">
        <div class="win-title">1장 입시편 클리어 · ${state.loop}회차</div>
        <h2 class="modal-title">${esc(e.title)}</h2>
        <p>${esc(e.text)}</p>
        <div class="desc-box"><b>대학편 시작 보너스</b><br>${esc(s.bonus)}</div>
        <p class="small muted">2장 대학편은 준비 중입니다. 더 높은 학교를 노리고 싶다면 스스로 회귀할 수 있다.</p>
        <div class="menu-list">
          <button class="menu-item" id="selfRegressBtn"><span>회귀해서 다시 도전</span></button>
          <button class="menu-item" id="dexBtn2"><span>엔딩 도감</span></button>
          <button class="menu-item" id="titleBtn"><span>타이틀로</span></button>
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
    body: `<p>${esc(e.text)}</p><p class="small" style="color:var(--violet);margin-top:12px">…그리고 눈앞이 하얘졌다.</p>`,
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
preloadArt(Object.keys(VOICE_TYPES)).then(renderTitle);
