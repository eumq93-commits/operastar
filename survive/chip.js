/* =====================================================
   칩튠 플레이어 — 악보 데이터를 브라우저가 직접 8비트 소리로 연주
   (음원 파일 없음. tools/build_songs.py 가 만든 survive/songs/*.js 를 연주)

   Chip.play(song, { transpose, volume, loop, start, end }) → 재생 시작
   Chip.time()  → 현재 곡 위치(초)   Chip.stop()
   채널: 멜로디(사각파) · 위 성부(얇은 펄스) · 베이스(삼각파)
===================================================== */

const Chip = (() => {
  let ctx = null, master = null, pulse25 = null;
  let cur = null; // { song, t0, end, loop, idx, timer, opts, nodes }

  function ensure() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(ctx.destination);
      // 25% 펄스파 (NES 느낌)
      const n = 32, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
      pulse25 = ctx.createPeriodicWave(re, im);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  const hz = p => 440 * Math.pow(2, (p - 69) / 12);

  const CH = {
    melody: { type: "square", vol: 0.075, rel: 0.05 },
    upper:  { type: "pulse",  vol: 0.032, rel: 0.04 },
    bass:   { type: "triangle", vol: 0.16, rel: 0.03 }
  };

  function voice(chName, when, dur, pitch, volScale) {
    const ch = CH[chName];
    const o = ctx.createOscillator();
    if (ch.type === "pulse") o.setPeriodicWave(pulse25); else o.type = ch.type;
    o.frequency.value = hz(pitch);
    const g = ctx.createGain();
    const v = ch.vol * volScale;
    const len = Math.max(0.06, dur * 0.92);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(v, when + 0.008);
    g.gain.setValueAtTime(v, when + len - ch.rel);
    g.gain.linearRampToValueAtTime(0, when + len);
    o.connect(g).connect(master);
    o.start(when);
    o.stop(when + len + 0.02);
    cur.nodes.push(o);
    o.onended = () => { if (cur) { const i = cur.nodes.indexOf(o); if (i >= 0) cur.nodes.splice(i, 1); } };
  }

  /* 0.6초 앞까지 조금씩 예약한다 (노드를 한꺼번에 만들지 않음) */
  function pump() {
    if (!cur) return;
    const songT = time();
    const horizon = songT + 0.6;
    const { song, opts } = cur;
    for (const chName of ["melody", "upper", "bass"]) {
      const list = song.chip[chName] || [];
      let i = cur.idx[chName];
      while (i < list.length && list[i][0] < horizon) {
        const [s, d, p] = list[i];
        if (s >= cur.start && s < cur.end) {
          const tr = chName === "melody" ? opts.transpose : opts.transpose; // 반주도 같이 조옮김
          let pitch = p + tr;
          if (chName === "bass") while (pitch < 33) pitch += 12; // 너무 낮으면 한 옥타브 위로
          const when = cur.t0 + s;
          if (when >= ctx.currentTime - 0.01) voice(chName, Math.max(when, ctx.currentTime), d, pitch, opts.volume);
        }
        i++;
      }
      cur.idx[chName] = i;
    }
    if (songT >= cur.end) {
      if (cur.loop) restartLoop();
      else { clearInterval(cur.timer); cur.done = true; }
    }
  }

  function restartLoop() {
    cur.t0 = ctx.currentTime + 0.4 - cur.start;
    for (const k of Object.keys(cur.idx)) cur.idx[k] = 0;
  }

  function play(song, opts = {}) {
    stop();
    if (!ensure()) return false;
    const o = Object.assign({ transpose: 0, volume: 1, loop: false, start: 0, end: song.duration }, opts);
    cur = {
      song, opts: o, loop: o.loop, start: o.start, end: Math.min(o.end, song.duration),
      t0: ctx.currentTime + 0.15 - o.start,
      idx: { melody: 0, upper: 0, bass: 0 },
      nodes: [], done: false
    };
    cur.timer = setInterval(pump, 120);
    pump();
    return true;
  }

  function time() {
    if (!cur || !ctx) return 0;
    return Math.max(0, ctx.currentTime - cur.t0);
  }

  function ended() { return !!cur && cur.done && time() >= cur.end; }

  function stop() {
    if (!cur) return;
    clearInterval(cur.timer);
    const now = ctx ? ctx.currentTime : 0;
    cur.nodes.forEach(n => { try { n.stop(now); } catch (e) { /* 이미 멈춤 */ } });
    cur = null;
  }

  function setVolume(v) { ensure(); if (master) master.gain.value = v; }

  /* 성부에 맞게 조옮김: 곡 음역의 가운데를 성부의 가운데로 (±6반음 안에서) */
  const VOICE_CENTER = { soprano: 72, mezzo: 68, tenor: 64, baritone: 59, bass: 55 };
  function transposeFor(song, voiceKey) {
    if (!song.melodyRange) return 0;
    const center = (song.melodyRange[0] + song.melodyRange[1]) / 2;
    let shift = Math.round((VOICE_CENTER[voiceKey] || center) - center);
    while (shift > 6) shift -= 12;
    while (shift < -6) shift += 12;
    return shift;
  }

  return { play, stop, time, ended, setVolume, transposeFor, ensure, playing: () => !!cur };
})();
