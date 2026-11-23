/* =====================================================
   무대 엔진 — OPERA TYPE 타자 엔진을 옮겨 온 것
   Stage.play(options) 로 한 곡을 치르고 onEnd(result)로 결과를 돌려준다.

   options = {
     song,            // SONGS 항목
     label,           // 상단에 표시할 무대 이름
     endTime,         // 이 시간(초)까지만 부른다 (없으면 끝까지)
     timeMult,        // 낙하 시간 배율 (클수록 쉬움)
     hp,              // 목숨
     typoTolerance,   // PASS로 인정하는 오타 글자 수 (0~2)
     lookahead,       // 아직 안 떨어진 다음 가사를 미리 쳐도 인정하는 줄 수
     preview,         // 화면 위에 미리 보여 줄 다음 가사 줄 수
     tierName,        // 여유도 이름 (급박/빠듯/여유/완벽)
     typeMode,        // "ko" 한글 발음 / "orig" 원어
     transpose,       // 칩튠 곡 조옮김 (성부에 맞게)
     voiceLevel,      // "ok" | "hoarse" | "bad"  (목 상태 → 가사 흔들림)
     images,          // 성부별 캐릭터 이미지
     allowQuit,       // 중단 버튼 표시
     onEnd            // (result) => {}
   }
===================================================== */

const Stage = (() => {
  const $ = id => document.getElementById(id);

  const el = {};
  const SFX_FILES = {
    perfect: "./sfx-perfect.wav",
    good: "./sfx-good.mp3",
    pass: "./sfx-pass.mp3",
    clear: "./sfx-clear.mp3"
  };
  const sfx = {};

  let opts = null;
  let lyrics = [];
  let activeWords = [];
  let nextIndex = 0;
  let hp = 0, score = 0, combo = 0, maxCombo = 0;
  let counts = { PERFECT: 0, GOOD: 0, PASS: 0, MISS: 0 };
  let running = false, rafId = null, wordId = 0, composing = false;
  let fakeClockStart = null; // 음악 재생 실패 시 타이머로 대신 진행
  let useChip = false;       // 악보 곡은 칩튠 플레이어가 시계 역할
  let presung = new Set();   // 미리 쳐서 이미 부른 가사 번호
  let previewCache = "";
  let timers = {};

  function init() {
    ["stageScreen", "stageArt", "gameStage", "fallingLayer", "missLine", "typingInput",
     "submitBtn", "hpValue", "scoreValue", "comboValue", "judgementLayer", "judgementMain",
     "judgementSub", "phaseLayer", "phaseText", "musicProgress", "singerMotion", "singerImage",
     "singerBubble", "singerBubbleText", "stageMusic", "stageLabel", "quitStageBtn", "lyricPreview", "tierBadge"]
      .forEach(id => { el[id] = $(id); });

    Object.entries(SFX_FILES).forEach(([k, src]) => {
      const a = new Audio(src);
      a.preload = "auto";
      sfx[k] = a;
    });

    el.submitBtn.addEventListener("click", handleSubmit);
    el.typingInput.addEventListener("compositionstart", () => { composing = true; });
    el.typingInput.addEventListener("compositionend", () => { composing = false; });
    el.typingInput.addEventListener("keydown", e => {
      if (e.key === "Enter" && !composing && !e.isComposing) {
        e.preventDefault();
        handleSubmit();
      }
    });
    el.quitStageBtn.addEventListener("click", () => {
      if (running && confirm("무대를 중단할까요? 중단하면 실패로 처리됩니다.")) finish(false, true);
    });
    el.stageMusic.addEventListener("ended", () => { if (running) finish(true); });
    window.addEventListener("resize", fitStageArt);
  }

  function playSfx(key) {
    const base = sfx[key];
    if (!base) return;
    const s = base.cloneNode();
    s.volume = key === "clear" ? 0.9 : 0.72;
    const p = s.play();
    if (p && p.catch) p.catch(() => {});
  }

  /* 4:3 무대를 화면에 꽉 차게 (cover) */
  function fitStageArt() {
    const w = el.gameStage.clientWidth, h = el.gameStage.clientHeight;
    if (!w || !h) return;
    const ratio = 4 / 3;
    let width, height;
    if (w / h > ratio) { width = w; height = w / ratio; }
    else { height = h; width = h * ratio; }
    el.stageArt.style.width = width + "px";
    el.stageArt.style.height = height + "px";
  }

  function now() {
    if (useChip) return Chip.time();
    if (fakeClockStart !== null) return (performance.now() - fakeClockStart) / 1000;
    return el.stageMusic.currentTime;
  }

  function updateUI() {
    el.hpValue.textContent = "♥".repeat(Math.max(0, hp)) || "0";
    el.scoreValue.textContent = score;
    el.comboValue.textContent = combo;
  }

  /* ---------- 캐릭터 ---------- */
  function setSinger(state) {
    clearTimeout(timers.singer);
    el.singerImage.src = opts.images[state] || opts.images.normal;
    el.singerMotion.className = "singer-motion state-" + state;
    if (state !== "normal") {
      const dur = { perfect: 950, good: 820, pass: 750, miss: 1050 }[state] || 800;
      timers.singer = setTimeout(() => setSinger("normal"), dur);
    }
  }

  function showBubble(grade, text) {
    clearTimeout(timers.bubble);
    el.singerBubbleText.textContent = text;
    el.singerBubble.className = "singer-bubble";
    void el.singerBubble.offsetWidth;
    el.singerBubble.classList.add("grade-" + grade.toLowerCase(), "show");
    timers.bubble = setTimeout(hideBubble, 2700);
  }

  function hideBubble() {
    clearTimeout(timers.bubble);
    el.singerBubble.className = "singer-bubble";
    el.singerBubbleText.textContent = "";
  }

  function showJudgement(grade, sub) {
    clearTimeout(timers.judge);
    el.judgementMain.textContent = grade;
    el.judgementSub.textContent = sub || "";
    el.judgementLayer.className = "judgement-layer";
    void el.judgementLayer.offsetWidth;
    el.judgementLayer.classList.add(grade.toLowerCase(), "show");
    setSinger(grade.toLowerCase());
    playSfx(grade.toLowerCase());
    timers.judge = setTimeout(() => { el.judgementLayer.className = "judgement-layer"; }, 680);
  }

  /* ---------- 판정 ---------- */
  const noSpace = t => t.replace(/\s+/g, "");

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return dp[m][n];
  }

  /* 원어 입력: 대소문자·악센트·문장부호는 따지지 않는다 (ü → u) */
  const loose = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

  function judge(typed, target) {
    if (opts.normalize) { typed = loose(typed); target = loose(target); }
    if (typed === target) return { grade: "PERFECT", rate: 1 };
    if (noSpace(typed) === noSpace(target)) return { grade: "GOOD", rate: 0.8 };
    const d = levenshtein(noSpace(typed), noSpace(target));
    if (d >= 1 && d <= opts.typoTolerance) return { grade: "PASS", rate: 0.35 };
    return { grade: "MISS", rate: 0 };
  }

  /* ---------- 가사 ---------- */
  function currentTarget() {
    return activeWords.reduce((t, w) => (!t || w.order < t.order ? w : t), null);
  }

  function highlight() {
    const t = currentTarget();
    activeWords.forEach(w => {
      w.element.classList.toggle("target", !!t && t.id === w.id);
      w.element.classList.toggle("waiting", !t || t.id !== w.id);
    });
  }

  function fallDuration() {
    return BALANCE.baseLimitTime * (opts.song.fallSpeed || 1) * opts.timeMult;
  }

  function createWord(lyric, order) {
    const element = document.createElement("div");
    element.className = "word waiting";
    if (opts.voiceLevel === "hoarse") element.classList.add("shaky");
    if (opts.voiceLevel === "bad") element.classList.add("shaky", "blurry");
    element.textContent = lyric.text;
    el.fallingLayer.appendChild(element);
    const maxX = Math.max(5, el.gameStage.clientWidth - element.offsetWidth - 10);
    const dur = fallDuration();
    activeWords.push({
      id: ++wordId, order, text: lyric.text, spawnTime: lyric.time,
      fallDuration: dur, deadline: lyric.time + dur, penalty: false,
      x: Math.random() * maxX, element
    });
    highlight();
  }

  function removeWord(id) {
    const i = activeWords.findIndex(w => w.id === id);
    if (i === -1) return;
    activeWords.splice(i, 1)[0].element.remove();
    highlight();
  }

  function loseHp(text) {
    hp = Math.max(0, hp - 1);
    combo = 0;
    counts.MISS++;
    updateUI();
    showJudgement("MISS", text);
    if (hp <= 0) finish(false);
  }

  function handleSubmit() {
    if (!running) return;
    const typed = el.typingInput.value.trim();
    if (!typed) return;
    const target = currentTarget();
    el.typingInput.value = "";
    el.typingInput.focus();
    hideBubble();
    const r = target ? judge(typed, target.text) : { grade: "MISS", rate: 0 };
    if (r.grade === "MISS" && tryAhead(typed)) return; // 다음 가사를 미리 친 경우
    if (!target) return;
    if (r.grade === "MISS") {
      if (!target.penalty) { target.penalty = true; loseHp("다시!"); }
      else { combo = 0; updateUI(); showJudgement("MISS", "다시!"); }
      return;
    }
    const earned = Math.round(noSpace(target.text).length * 100 * r.rate);
    score += earned;
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    counts[r.grade]++;
    updateUI();
    showJudgement(r.grade, "+" + earned);
    showBubble(r.grade, typed);
    removeWord(target.id);
  }

  /* 아직 떨어지지 않은 다음 가사 (미리 부른 것 제외) */
  function upcoming(n) {
    const out = [];
    for (let i = nextIndex; i < lyrics.length && out.length < n; i++) {
      if (!presung.has(i)) out.push(i);
    }
    return out;
  }

  function tryAhead(typed) {
    if (!opts.lookahead) return false;
    for (const idx of upcoming(opts.lookahead)) {
      const r = judge(typed, lyrics[idx].text);
      if (r.grade === "MISS") continue;
      presung.add(idx);
      const earned = Math.round(noSpace(lyrics[idx].text).length * 100 * r.rate);
      score += earned;
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      counts[r.grade]++;
      updateUI();
      showJudgement(r.grade, "미리! +" + earned);
      showBubble(r.grade, typed);
      return true;
    }
    return false;
  }

  function updatePreview() {
    if (!opts.preview) { if (previewCache) { el.lyricPreview.hidden = true; previewCache = ""; } return; }
    const list = upcoming(opts.preview).map(i => lyrics[i].text);
    const str = list.join(" / ");
    if (str === previewCache) return;
    previewCache = str;
    el.lyricPreview.hidden = !str;
    el.lyricPreview.textContent = str ? "다음 ▸ " + str : "";
  }

  /* ---------- 루프 ---------- */
  function updatePhase(t) {
    if (activeWords.length) { el.phaseLayer.classList.add("hidden"); return; }
    const p = (opts.song.phases || []).find(ph => t >= ph.start && t < ph.end);
    if (!p) { el.phaseLayer.classList.add("hidden"); return; }
    el.phaseText.textContent = p.text;
    el.phaseText.classList.toggle("long", p.text.length > 6);
    el.phaseLayer.classList.remove("hidden");
  }

  function endPoint() {
    const last = lyrics.length ? lyrics[lyrics.length - 1].time : 0;
    return opts.endTime || (last + fallDuration() + 2);
  }

  function loop() {
    if (!running) return;
    const t = now();

    while (nextIndex < lyrics.length && t >= lyrics[nextIndex].time) {
      if (!presung.has(nextIndex)) createWord(lyrics[nextIndex], nextIndex);
      nextIndex++;
    }
    updatePreview();

    const stageTop = el.gameStage.getBoundingClientRect().top;
    const lineY = el.missLine.getBoundingClientRect().top - stageTop;
    for (let i = activeWords.length - 1; i >= 0; i--) {
      const w = activeWords[i];
      const h = w.element.offsetHeight;
      const p = Math.max(0, Math.min(1, (t - w.spawnTime) / w.fallDuration));
      const y = -h + (lineY) * p;
      w.element.style.transform = `translate3d(${w.x}px, ${y}px, 0)`;
      if (t >= w.deadline) {
        removeWord(w.id);
        if (!w.penalty) { w.penalty = true; loseHp(w.text); }
        if (!running) return;
      }
    }

    updatePhase(t);

    const total = opts.endTime || (useChip ? opts.song.duration : el.stageMusic.duration) || endPoint();
    if (total && Number.isFinite(total)) {
      el.musicProgress.style.width = Math.min(100, (t / total) * 100) + "%";
    }

    // 정해진 구간을 다 불렀으면 클리어
    if (nextIndex >= lyrics.length && activeWords.length === 0 &&
        (opts.endTime ? t >= Math.min(opts.endTime, lastDeadline())
          : useChip ? t >= Math.min(opts.song.duration, lastDeadline())
          : fakeClockStart !== null && t >= endPoint())) {
      finish(true);
      return;
    }

    rafId = requestAnimationFrame(loop);
  }

  function lastDeadline() {
    const last = lyrics[lyrics.length - 1];
    return last ? last.time + fallDuration() : 0;
  }

  function maxScore() {
    return lyrics.reduce((s, l) => s + noSpace(l.text).length * 100, 0);
  }

  /* ---------- 시작 / 종료 ---------- */
  function play(options) {
    opts = Object.assign({ timeMult: 1, hp: 5, typoTolerance: 1, lookahead: 0, preview: 0, voiceLevel: "ok", allowQuit: true }, options);
    // 가사 입력 방식: 한글 발음(text) 또는 원어(orig)
    lyrics = opts.song.lyrics
      .filter(l => !opts.endTime || l.time < opts.endTime - 2)
      .map(l => ({ time: l.time, text: opts.typeMode === "orig" && l.orig ? l.orig : l.text }));
    opts.normalize = opts.typeMode === "orig";

    activeWords.forEach(w => w.element.remove());
    activeWords = [];
    nextIndex = 0; wordId = 0;
    hp = opts.hp; score = 0; combo = 0; maxCombo = 0;
    counts = { PERFECT: 0, GOOD: 0, PASS: 0, MISS: 0 };
    fakeClockStart = null;
    presung = new Set();
    previewCache = "x";

    el.stageLabel.textContent = opts.label || opts.song.title;
    el.tierBadge.hidden = !opts.tierName;
    el.tierBadge.textContent = opts.tierName ? `여유도 · ${opts.tierName}` : "";
    el.tierBadge.className = "tier-badge tier-" + (opts.tierName || "");
    el.quitStageBtn.hidden = !opts.allowQuit;
    el.stageScreen.hidden = false;
    fitStageArt();
    setSinger("normal");
    hideBubble();
    updateUI();
    el.musicProgress.style.width = "0%";
    el.typingInput.value = "";

    running = true;
    useChip = !!opts.song.chip;
    if (useChip) {
      Chip.play(opts.song, { transpose: opts.transpose || 0, end: opts.endTime || opts.song.duration });
      setTimeout(() => el.typingInput.focus(), 100);
      rafId = requestAnimationFrame(loop);
      return;
    }
    const m = el.stageMusic;
    m.src = opts.song.audio;
    m.currentTime = 0;
    m.volume = 0.9;
    const p = m.play();
    if (p && p.catch) {
      p.catch(err => {
        console.warn("음악 재생 실패, 타이머로 진행:", err);
        fakeClockStart = performance.now();
      });
    }
    setTimeout(() => el.typingInput.focus(), 100);
    rafId = requestAnimationFrame(loop);
  }

  function finish(cleared, quit = false) {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    el.stageMusic.pause();
    if (useChip) Chip.stop();
    el.phaseLayer.classList.add("hidden");
    hideBubble();
    if (cleared) playSfx("clear");

    const max = maxScore();
    const result = {
      cleared,
      quit,
      score,
      maxScore: max,
      accuracy: cleared && max ? Math.min(1, score / max) : (max ? Math.min(1, score / max) * 0.5 : 0),
      counts: { ...counts },
      maxCombo
    };
    const cb = opts.onEnd;
    setTimeout(() => {
      activeWords.forEach(w => w.element.remove());
      activeWords = [];
      el.stageScreen.hidden = true;
      if (cb) cb(result);
    }, cleared ? 900 : 600);
  }

  return { init, play };
})();
