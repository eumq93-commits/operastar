/* =====================================================
   미니게임 — 오페라타입 말고도 손이 바쁜 순간들
   MiniGames.play(kind, { ease }) → Promise<{ ratio, skipped }>
   ratio: 0~1 (얼마나 잘했나). 효과 배율 = 0.5 + ratio (최대 1.5배)

   breath  : 호흡 훈련 — 눌러서 숨을 채우고 떼서 내쉬며, 움직이는 구간 안에 유지
   solfege : 시창 따라 부르기 — 들려준 선율을 건반으로 똑같이 따라 치기
===================================================== */

const MiniGames = (() => {
  let ctx = null;
  function audio() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /* 칩튠 삑 소리 */
  function beep(freq, dur = 0.25, type = "square", vol = 0.08) {
    const a = audio();
    if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur + 0.02);
  }

  function overlay(html) {
    const el = document.createElement("div");
    el.className = "mini-screen";
    el.innerHTML = `<div class="mini-card px-win">${html}</div>`;
    document.body.appendChild(el);
    return el;
  }

  function intro(title, desc, icon) {
    return `
      <div class="mini-head"><span class="name-tag">미니게임</span> ${title}</div>
      <div class="mini-desc">${icon} ${desc}</div>`;
  }

  /* ---------------- 호흡 훈련 ---------------- */
  function breath({ ease = 0.3 } = {}) {
    return new Promise(resolve => {
      const zoneSize = 0.16 + ease * 0.16;  // 연습할수록 넓어짐
      const duration = 9;                   // 초
      const el = overlay(`
        ${intro("호흡 훈련", "누르고 있으면 숨이 차오르고, 떼면 내려가요. 표시가 <b>금색 구간</b> 안에 머물게 하세요.", "🫁")}
        <div class="breath-wrap">
          <div class="breath-track" id="bTrack">
            <div class="breath-zone" id="bZone"></div>
            <div class="breath-mark" id="bMark"></div>
          </div>
          <div class="breath-side">
            <div class="mini-stat">남은 시간 <b id="bTime">${duration}</b></div>
            <div class="mini-stat">유지율 <b id="bRate">0%</b></div>
          </div>
        </div>
        <button class="px-btn big hold-btn" id="bHold">누르고 있기 (스페이스)</button>
        <div class="row-2">
          <button class="px-btn" id="bStart">시작</button>
          <button class="px-btn sub" id="bSkip">건너뛰기</button>
        </div>`);
      const $ = id => el.querySelector("#" + id);
      let holding = false, running = false, level = 0.2, vel = 0, inZone = 0, total = 0, t0 = 0, last = 0, raf = 0;
      let zoneC = 0.5;
      const track = $("bTrack");

      const setHold = v => { holding = v; $("bHold").classList.toggle("pressed", v); };
      $("bHold").addEventListener("pointerdown", e => { e.preventDefault(); setHold(true); });
      ["pointerup", "pointerleave", "pointercancel"].forEach(ev => $("bHold").addEventListener(ev, () => setHold(false)));
      const kd = e => { if (e.code === "Space") { e.preventDefault(); setHold(true); } };
      const ku = e => { if (e.code === "Space") { e.preventDefault(); setHold(false); } };
      window.addEventListener("keydown", kd);
      window.addEventListener("keyup", ku);

      function draw() {
        const h = track.clientHeight;
        $("bZone").style.height = (zoneSize * 100) + "%";
        $("bZone").style.bottom = ((zoneC - zoneSize / 2) * 100) + "%";
        $("bMark").style.bottom = (level * h - 4) + "px";
      }

      function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const el2 = (now - t0) / 1000;
        // 숨: 누르면 위로, 떼면 아래로 (관성)
        vel += (holding ? 1.6 : -1.3) * dt;
        vel *= 0.9;
        level = Math.max(0, Math.min(1, level + vel * dt * 2.2));
        if (level === 0 || level === 1) vel = 0;
        // 구간: 프레이즈처럼 천천히 오르내림
        zoneC = 0.5 + Math.sin(el2 * 0.9) * 0.22 + Math.sin(el2 * 2.3) * 0.08;
        const ok = Math.abs(level - zoneC) <= zoneSize / 2;
        total += dt;
        if (ok) inZone += dt;
        $("bMark").classList.toggle("ok", ok);
        $("bTime").textContent = Math.max(0, Math.ceil(duration - el2));
        $("bRate").textContent = Math.round((inZone / Math.max(0.01, total)) * 100) + "%";
        draw();
        if (ok && Math.random() < dt * 3) beep(523 + level * 400, 0.08, "triangle", 0.04);
        if (el2 >= duration) return end(false);
        raf = requestAnimationFrame(frame);
      }

      function end(skipped) {
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", kd);
        window.removeEventListener("keyup", ku);
        const ratio = skipped ? 0 : inZone / Math.max(0.01, total);
        if (!skipped) beep(ratio > 0.6 ? 880 : 330, 0.3);
        el.remove();
        resolve({ ratio, skipped });
      }

      $("bStart").onclick = () => {
        if (running) return;
        running = true;
        audio();
        $("bStart").disabled = true;
        t0 = last = performance.now();
        raf = requestAnimationFrame(frame);
      };
      $("bSkip").onclick = () => end(true);
      draw();
    });
  }

  /* ---------------- 시창 따라 부르기 ---------------- */
  function solfege({ ease = 0.3 } = {}) {
    return new Promise(resolve => {
      const NOTES = [
        { name: "도", f: 523.25, c: "#c4404f" },
        { name: "레", f: 587.33, c: "#e08a2e" },
        { name: "미", f: 659.25, c: "#f5c24c" },
        { name: "솔", f: 783.99, c: "#6fd39c" },
        { name: "라", f: 880.0, c: "#63b6e6" }
      ];
      const rounds = [3, 4, 5];
      const speed = 520 - ease * 160; // 연습할수록 천천히 들려줌 (ms)
      const el = overlay(`
        ${intro("시창 따라 부르기", "선율을 듣고 같은 순서로 건반을 누르세요. (키보드 1~5)", "🎶")}
        <div class="sol-status" id="sStatus">시작을 누르면 선율이 나와요</div>
        <div class="sol-keys">${NOTES.map((n, i) => `<button class="sol-key" data-k="${i}" style="--key:${n.c}" disabled>${n.name}<small>${i + 1}</small></button>`).join("")}</div>
        <div class="sol-progress" id="sProg">${rounds.map(() => `<i></i>`).join("")}</div>
        <div class="row-2">
          <button class="px-btn" id="sStart">시작</button>
          <button class="px-btn sub" id="sSkip">건너뛰기</button>
        </div>`);
      const $ = id => el.querySelector("#" + id);
      const keys = [...el.querySelectorAll(".sol-key")];
      let round = 0, seq = [], pos = 0, accepting = false, cleared = 0, partial = 0, done = false;

      const flash = i => {
        keys[i].classList.add("lit");
        beep(NOTES[i].f, 0.28);
        setTimeout(() => keys[i].classList.remove("lit"), 220);
      };

      async function playRound() {
        accepting = false;
        keys.forEach(k => { k.disabled = true; });
        const len = rounds[round];
        seq = Array.from({ length: len }, () => Math.floor(Math.random() * NOTES.length));
        pos = 0;
        $("sStatus").textContent = `${round + 1}라운드 · 잘 들어요…`;
        await new Promise(r => setTimeout(r, 500));
        for (const n of seq) {
          if (done) return;
          flash(n);
          await new Promise(r => setTimeout(r, speed));
        }
        $("sStatus").textContent = `따라 불러요! (${len}음)`;
        keys.forEach(k => { k.disabled = false; });
        accepting = true;
      }

      function press(i) {
        if (!accepting || done) return;
        flash(i);
        if (i === seq[pos]) {
          pos++;
          if (pos === seq.length) {
            accepting = false;
            cleared++;
            $("sProg").children[round].classList.add("on");
            round++;
            if (round >= rounds.length) return finish();
            $("sStatus").textContent = "정답! 다음 선율";
            setTimeout(playRound, 700);
          }
        } else {
          partial = pos / seq.length;
          beep(160, 0.4, "sawtooth");
          $("sStatus").textContent = "음이 틀렸어요";
          accepting = false;
          setTimeout(finish, 700);
        }
      }

      function finish(skipped = false) {
        if (done) return;
        done = true;
        window.removeEventListener("keydown", kd);
        const ratio = skipped ? 0 : Math.min(1, (cleared + partial) / rounds.length);
        el.remove();
        resolve({ ratio, skipped });
      }

      const kd = e => {
        const n = Number(e.key);
        if (n >= 1 && n <= NOTES.length) { e.preventDefault(); press(n - 1); }
      };
      window.addEventListener("keydown", kd);
      keys.forEach((k, i) => k.addEventListener("click", () => press(i)));
      $("sStart").onclick = () => { audio(); $("sStart").disabled = true; playRound(); };
      $("sSkip").onclick = () => finish(true);
    });
  }

  function play(kind, opts) {
    if (kind === "breath") return breath(opts);
    if (kind === "solfege") return solfege(opts);
    return Promise.resolve({ ratio: 0.5, skipped: true });
  }

  return { play, beep };
})();
