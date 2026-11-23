#!/usr/bin/env python3
"""
악보(Mutopia LilyPond) → 게임용 칩튠 곡 데이터 변환기

사용법:
  python3 tools/build_songs.py [곡id ...]        # 목록 전체 또는 일부만 변환

필요한 것:
  - lilypond (apt-get install lilypond), convert-ly
  - pip install mido
  - Mutopia 악보 저장소 (git clone https://github.com/MutopiaProject/mutopiaproject)
    경로는 환경 변수 MUTOPIA_DIR 로 지정 (기본: ../mutopiaproject/mutopiaproject)

출력:
  survive/songs/<id>.js  — 게임이 바로 읽는 곡 데이터 (멜로디·반주·가사 타이밍)

안전:
  LilyPond 악보에는 Scheme 코드가 들어갈 수 있어서, 변환 전에 위험한 함수
  (파일 읽기/쓰기, 프로그램 실행 등)가 있는지 검사하고, 있으면 건너뛴다.
  변환은 네트워크를 끈 상태(unshare -n)로 실행한다.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata

import mido

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MUTOPIA = os.environ.get("MUTOPIA_DIR", os.path.join(ROOT, "..", "mutopiaproject", "mutopiaproject"))
# OpenScore Lieder (MusicXML, CC0): git clone https://github.com/OpenScore/Lieder
OPENSCORE = os.environ.get("OPENSCORE_DIR", os.path.join(ROOT, "..", "openscore", "lieder"))
OUT_DIR = os.path.join(ROOT, "survive", "songs")

# ---------------------------------------------------------------------------
# 곡 목록 — 여기에 한 줄 추가하면 곡이 늘어난다
#   voices: 이 곡을 부를 수 있는 성부
#   level: 입시 / 대학1~4 / 오브리 등 (게임에서 곡을 고를 때 쓰는 분류)
#   limit: 게임에서 쓸 최대 길이(초). 아리아는 길어서 앞부분만 쓴다
#   tempo: 템포 배율 (악보에 템포가 없거나 너무 느릴 때)
# ---------------------------------------------------------------------------
SONG_LIST = [
    dict(id="caromioben", path="GiordanoG/caromioben/caromioben.ly",
         title="Caro mio ben", ko="카로 미오 벤 · 조르다니", level="입시",
         voices=["soprano", "mezzo", "tenor", "baritone", "bass"], limit=110, tempo=1.0),
    dict(id="iogiatamai", path="HandelGF/HWV19/IoGiaTAmai/IoGiaTAmai.ly",
         title="Io già t'amai", ko="이오 쟈 따마이 · 헨델", level="대학2",
         voices=["tenor", "baritone"], limit=110, tempo=1.0),
    dict(id="nonpensi", path="HandelGF/HWV26/NonPensiQuellAltera/NonPensiQuellAltera.ly",
         title="Non pensi quell'altera", ko="논 뻰시 꿸랄떼라 · 헨델", level="대학2",
         voices=["tenor", "baritone"], limit=110, tempo=1.0),
    dict(id="eccoilsol", path="HandelGF/HWV47/Ecco_il_sol/Ecco_il_sol.ly",
         title="Ecco il sol", ko="에꼬 일 쏠 · 헨델", level="대학2",
         voices=["tenor"], limit=110, tempo=1.0),
    dict(id="belpiacer", path="PorporaN/BelPiacer/BelPiacer.ly",
         title="Bel piacer", ko="벨 삐아체르 · 포르포라", level="대학2",
         voices=["soprano", "mezzo"], limit=110, tempo=1.0),
    dict(id="miseropargoletto", path="LeoL/MiseroPargoletto/MiseroPargoletto.ly",
         title="Misero pargoletto", ko="미제로 빠르골레또 · 레오", level="대학2",
         voices=["soprano", "mezzo"], limit=110, tempo=1.0),
    dict(id="voglioche", path="HandelGF/HWV39/Voglio_che_sia_l_indegno/Voglio_che_sia_l_indegno.ly",
         title="Voglio che sia l'indegno", ko="볼료 께 씨아 린데뇨 · 헨델", level="대학2",
         voices=["soprano"], limit=110, tempo=1.0),
    dict(id="norisolvo", path="HandelGF/HWV21/NoRisolvoAbbandonar/NoRisolvoAbbandonar.ly",
         title="No! Risolvo abbandonar", ko="노 리졸보 아반도나르 · 헨델", level="대학2",
         voices=["mezzo"], limit=110, tempo=1.0),
    dict(id="sepotessero", path="HandelGF/HWV41/Se_potessero/Se_potessero.ly",
         title="Se potessero i sospir' miei", ko="세 뽀떼쎄로 · 헨델", level="대학2",
         voices=["mezzo"], limit=110, tempo=1.0),
    dict(id="lagloriasola", path="HandelGF/HWV22/LaGloriaSola/LaGloriaSola.ly",
         title="La gloria sola", ko="라 글로리아 쏠라 · 헨델", level="대학2",
         voices=["bass", "baritone"], limit=110, tempo=1.0),
    dict(id="imparaingrata", path="HandelGF/HWV35/ImparaIngrata/ImparaIngrata.ly",
         title="Impara, ingrata", ko="임빠라 인그라따 · 헨델", level="대학2",
         voices=["bass", "baritone"], limit=110, tempo=1.0),
    dict(id="signorsignor", path="HandelGF/HWV40/SignorSignorLasciateFarAMe/SignorSignorLasciateFarAMe.ly",
         title="Signor, lasciate far a me", ko="시뇨르 라샤떼 파르 아 메 · 헨델", level="대학2",
         voices=["bass", "baritone"], limit=110, tempo=1.0),
    dict(id="notteegiorno", path="MozartWA/KV527/NotteEGiorno/NotteEGiorno.ly",
         title="Notte e giorno faticar", ko="노떼 에 조르노 · 모차르트", level="대학4",
         voices=["bass", "baritone"], limit=110, tempo=1.0),
    dict(id="vorreibaciarti", path="CeresiniG/Vorrei_baciarti/Vorrei_baciarti.ly",
         title="Vorrei baciarti", ko="보레이 바챠르띠 · 체레시니", level="대학2",
         voices=["tenor", "baritone"], limit=110, tempo=1.0),

    # ---- OpenScore Lieder (MusicXML) ----
    dict(id="spiratepur", mxl="Donaudy,_Stefano/36_Arie_di_Stile_Antico/10_Spirate_pur,_spirate/lc29420288.mxl",
         title="Spirate pur, spirate", ko="스삐라떼 뿌르 스삐라떼 · 도나우디", level="입시",
         voices=["soprano", "mezzo", "tenor", "baritone", "bass"], limit=110, tempo=1.0),
    dict(id="ideale", mxl="Tosti,_Francesco_Paolo/_/Ideale/lc29381987.mxl",
         title="Ideale", ko="이데알레 · 토스티", level="대학1",
         voices=["soprano", "mezzo", "tenor", "baritone", "bass"], limit=110, tempo=1.0),
    dict(id="sogno", mxl="Tosti,_Francesco_Paolo/_/Sogno/lc29748842.mxl",
         title="Sogno", ko="쏜뇨 · 토스티", level="대학1",
         voices=["soprano", "mezzo", "tenor", "baritone"], limit=110, tempo=1.0),
    dict(id="mattinata", mxl="Leoncavallo,_Ruggero/_/Mattinata/lc29421746.mxl",
         title="Mattinata", ko="마띠나따 · 레온카발로", level="대학1",
         voices=["tenor", "baritone", "soprano"], limit=110, tempo=1.0),
    dict(id="insolitaria", mxl="Verdi,_Giuseppe/6_Romanze/3_In_solitaria_stanza/lc29477486.mxl",
         title="In solitaria stanza", ko="인 쏠리따리아 스딴짜 · 베르디", level="대학1",
         voices=["soprano", "mezzo"], limit=110, tempo=1.0),
]

# ---------------------------------------------------------------------------
# 1. 안전 검사
# ---------------------------------------------------------------------------
DANGEROUS = re.compile(
    r"ly:system|\(system|system\*|open-(input|output|file|pipe)|primitive-load|\(load\b|"
    r"delete-file|rename-file|getenv|setenv|chdir|mkdir|ly:gulp-file|eval-string|"
    r"ly:parser-include-string|\(eval\b|popen|ly:command-line|exit\b",
    re.I,
)


def check_safe(ly_path):
    """악보와 그 악보가 include 하는 파일(같은 폴더)에서 위험한 코드를 찾는다."""
    problems = []
    seen = set()

    def scan(p):
        if p in seen or not os.path.exists(p):
            return
        seen.add(p)
        text = open(p, encoding="utf-8", errors="replace").read()
        for m in DANGEROUS.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            problems.append(f"{os.path.basename(p)}:{line}: {m.group(0)}")
        for inc in re.findall(r'\\include\s+"([^"]+)"', text):
            if os.path.isabs(inc) or ".." in inc:
                problems.append(f"{os.path.basename(p)}: 바깥 경로 include {inc}")
            scan(os.path.join(os.path.dirname(p), inc))

    scan(ly_path)
    return problems


# ---------------------------------------------------------------------------
# 2. LilyPond → MIDI
# ---------------------------------------------------------------------------
def to_midi(ly_path, work):
    src_dir = os.path.dirname(ly_path)
    for f in os.listdir(src_dir):  # 같은 폴더의 include 파일까지 복사
        if f.endswith((".ly", ".ily")):
            shutil.copy(os.path.join(src_dir, f), work)
    main = os.path.join(work, os.path.basename(ly_path))
    conv = subprocess.run(["convert-ly", main], capture_output=True, text=True)
    if conv.stdout.strip():
        open(main, "w").write(conv.stdout)
    # 가사의 음절 연결(--)은 MIDI에 남지 않으므로, 음절 끝에 '-'를 붙여 단어를 복원할 수 있게 한다
    for f in os.listdir(work):
        if f.endswith((".ly", ".ily")):
            fp = os.path.join(work, f)
            src = open(fp, encoding="utf-8", errors="replace").read()
            open(fp, "w", encoding="utf-8").write(mark_hyphens(src))
    # 그림(PDF)은 만들지 않고 MIDI만
    r = subprocess.run(["unshare", "-n", "lilypond", "-dno-print-pages", "-dmidi-extension=mid",
                        "-o", os.path.join(work, "out"), main],
                       capture_output=True, text=True, cwd=work, timeout=600)
    mids = sorted(f for f in os.listdir(work) if f.endswith(".mid"))
    if not mids:
        raise RuntimeError("MIDI가 만들어지지 않음:\n" + r.stderr[-800:])
    return os.path.join(work, mids[0])


def mark_hyphens(text):
    """\\lyricmode / \\addlyrics / \\lyrics 블록 안의 'ma -- ni' 를 'ma- -- ni' 로."""
    out, i = [], 0
    for m in re.finditer(r"\\(lyricmode|addlyrics|lyrics)\b", text):
        start = text.find("{", m.end())
        if start < 0 or start < i:
            continue
        depth, j = 0, start
        while j < len(text):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        block = re.sub(r'(?<=\S)(\s+--\s+)', lambda mm: "-" + mm.group(1), text[start:j])
        out.append(text[i:start] + block)
        i = j
    out.append(text[i:])
    return "".join(out)


# ---------------------------------------------------------------------------
# 3. MIDI 읽기
# ---------------------------------------------------------------------------
def fix_text(t):
    try:
        return t.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return t


def read_midi(path, tempo_scale=1.0):
    mid = mido.MidiFile(path, clip=True)
    tpb = mid.ticks_per_beat
    # 템포 지도
    tempos = [(0, 500000)]
    for tr in mid.tracks:
        tick = 0
        for msg in tr:
            tick += msg.time
            if msg.type == "set_tempo":
                tempos.append((tick, msg.tempo))
    tempos.sort()

    def sec(tick):
        s, last_tick, last_tempo = 0.0, 0, tempos[0][1]
        for t, tempo in tempos[1:]:
            if t >= tick:
                break
            s += (t - last_tick) * last_tempo / tpb / 1e6
            last_tick, last_tempo = t, tempo
        s += (tick - last_tick) * last_tempo / tpb / 1e6
        return s / tempo_scale

    tracks = []
    for tr in mid.tracks:
        name = ""
        tick = 0
        on = {}
        notes, lyrics = [], []
        for msg in tr:
            tick += msg.time
            if msg.type == "track_name":
                name = fix_text(msg.name)
            elif msg.type == "lyrics":
                lyrics.append((sec(tick), fix_text(msg.text)))
            elif msg.type == "note_on" and msg.velocity > 0:
                on.setdefault(msg.note, []).append(tick)
            elif msg.type in ("note_off", "note_on"):
                if on.get(msg.note):
                    start = on[msg.note].pop(0)
                    notes.append((sec(start), sec(tick) - sec(start), msg.note))
        notes.sort()
        tracks.append(dict(name=name, notes=notes, lyrics=lyrics))
    return tracks


def read_mxl(path, tempo_scale=1.0):
    """MusicXML(OpenScore) → read_midi 와 같은 모양의 트랙 목록. 코드 실행 없이 데이터만 읽는다."""
    from music21 import converter, tempo as m21tempo

    score = converter.parse(path).stripTies()
    # 템포 구간 (박 → 초)
    bounds = score.metronomeMarkBoundaries()

    def sec(ql):
        total = 0.0
        for start, end, mm in bounds:
            qpm = mm.getQuarterBPM() or 72
            if ql <= start:
                break
            seg = min(ql, end) - start
            total += seg * 60.0 / qpm
        return total / tempo_scale

    tracks = []
    for part in score.parts:
        notes, lyrics = [], []
        for el in part.flatten().notes:
            off = float(el.getOffsetInHierarchy(score))
            s0 = sec(off)
            d = sec(off + float(el.quarterLength)) - s0
            pitches = [el.pitch] if el.isNote else list(el.pitches)
            for pt in pitches:
                notes.append((s0, d, pt.midi))
            if el.isNote and el.lyrics:
                ly = el.lyrics[0]
                t = ly.text or ""
                if ly.syllabic in ("begin", "middle"):
                    t += "-"
                if t.strip():
                    lyrics.append((s0, t))
        notes.sort()
        tracks.append(dict(name=part.partName or "", notes=notes, lyrics=lyrics))
    return tracks


def pick_tracks(tracks):
    """노래 성부 트랙, 가사 트랙(원어), 반주 트랙(위·아래)을 고른다."""
    lyric_tracks = [t for t in tracks if sum(1 for _, x in t["lyrics"] if x.strip()) > 8]
    note_tracks = [t for t in tracks if t["notes"]]
    if not lyric_tracks or not note_tracks:
        raise RuntimeError("가사나 음표 트랙을 찾지 못함")
    lyr = lyric_tracks[0]
    lyr_times = [round(s, 2) for s, x in lyr["lyrics"] if x.strip()]

    # 가사 시점과 음표 시작이 가장 잘 맞는 트랙 = 노래 트랙
    def match(t):
        starts = {round(n[0], 2) for n in t["notes"]}
        return sum(1 for s in lyr_times if s in starts) / len(lyr_times)

    voice = max(note_tracks, key=match)
    others = [t for t in note_tracks if t is not voice]
    avg = lambda t: sum(n[2] for n in t["notes"]) / len(t["notes"])
    bass = min(others, key=avg) if others else None
    upper = max(others, key=avg) if len(others) > 1 else None
    return voice, lyr, bass, upper


def top_line(notes):
    """화음은 맨 위 음만 남긴다 (칩튠 한 채널용)."""
    by = {}
    for s, d, p in notes:
        k = round(s, 3)
        if k not in by or p > by[k][2]:
            by[k] = (s, d, p)
    return sorted(by.values())


def bottom_line(notes):
    by = {}
    for s, d, p in notes:
        k = round(s, 3)
        if k not in by or p < by[k][2]:
            by[k] = (s, d, p)
    return sorted(by.values())


# ---------------------------------------------------------------------------
# 4. 가사 → 줄 나누기
# ---------------------------------------------------------------------------
def build_lines(lyrics, limit):
    """음절 이벤트들을 타자용 한 줄(2~4단어)로 묶는다."""
    words = []  # (시작 시각, 단어, 문장부호로 끝나나)
    cur, cur_t = "", None
    for t, raw in lyrics:
        x = raw.strip().replace("\u203f", " ").replace("_", " ").strip()
        if not x or x in ("--", "__", "-"):
            continue
        cont = x.endswith("-")
        x = x.rstrip("-").strip()
        if cur_t is None:
            cur_t = t
        cur += x
        if not cont:
            for i, w in enumerate(cur.split()):
                words.append((cur_t, w))
            cur, cur_t = "", None
    if cur:
        words.append((cur_t, cur))

    lines = []
    line, start, last_t = [], None, None
    for t, w in words:
        if t > limit:
            break
        gap = last_t is not None and t - last_t > 1.6
        if line and (gap or len(" ".join(line)) >= 16 or re.search(r"[,.;:!?]$", line[-1])):
            lines.append(dict(time=round(start, 2), orig=" ".join(line)))
            line, start = [], None
        if start is None:
            start = t
        line.append(w)
        last_t = t
    if line:
        lines.append(dict(time=round(start, 2), orig=" ".join(line)))
    # 너무 가까운 줄은 앞 줄에 합친다 (타자 칠 시간 확보)
    merged = []
    for ln in lines:
        if merged and ln["time"] - merged[-1]["time"] < 1.3 and len(merged[-1]["orig"] + ln["orig"]) < 26:
            merged[-1]["orig"] += " " + ln["orig"]
        else:
            merged.append(ln)
    return merged


# ---------------------------------------------------------------------------
# 5. 이탈리아어 → 한글 발음 (입시곡 대부분이 이탈리아어)
#    가곡 표기 관례에 가깝게: c/p/t → 된소리(ㄲ ㅃ ㄸ), 겹자음 → 받침 ㅅ
# ---------------------------------------------------------------------------
CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
JUNG = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"]
JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"]
V_PLAIN = dict(a="ㅏ", e="ㅔ", i="ㅣ", o="ㅗ", u="ㅜ")
V_Y = dict(a="ㅑ", e="ㅖ", i="ㅣ", o="ㅛ", u="ㅠ")
V_W = dict(a="ㅘ", e="ㅞ", i="ㅟ", o="ㅝ", u="ㅜ")
SIMPLE = dict(b="ㅂ", c="ㄲ", d="ㄷ", f="ㅍ", g="ㄱ", k="ㄲ", l="ㄹ", m="ㅁ", n="ㄴ", p="ㅃ",
              q="ㄲ", r="ㄹ", s="ㅆ", t="ㄸ", v="ㅂ", z="ㅉ", x="ㅆ", j="ㅇ")
CODA_OK = {"ㄴ": "ㄴ", "ㅁ": "ㅁ", "ㄹ": "ㄹ"}
VOWELS = "aeiou"


def compose(on, v, coda=""):
    return chr(0xAC00 + (CHO.index(on) * 21 + JUNG.index(v)) * 28 + JONG.index(coda))


def it_word(word):
    w = unicodedata.normalize("NFD", word.lower())
    w = "".join(c for c in w if not unicodedata.combining(c))
    w = re.sub(r"[^a-z]", "", w)
    if not w:
        return ""
    toks = []  # ("C", onset) | ("V", jamo) | ("K", coda)  K = 앞 음절 받침
    i = 0
    n = len(w)
    nxt = lambda k: w[k] if k < n else ""
    while i < n:
        c = w[i]
        if c in VOWELS:
            toks.append(("V", V_PLAIN[c]))
            i += 1
            continue
        if c == "h":
            i += 1
            continue
        # 겹자음
        if nxt(i + 1) == c and c not in "h":
            if c in "lmn":
                toks.append(("K", {"l": "ㄹ", "m": "ㅁ", "n": "ㄴ"}[c]))
            elif c == "r":
                toks.append(("R", "ㄹ"))  # 르 + 라
            else:
                toks.append(("K", "ㅅ"))
            i += 1
            continue
        if w.startswith("sc", i) and nxt(i + 2) in ("e", "i"):
            if nxt(i + 2) == "i" and nxt(i + 3) in VOWELS and nxt(i + 3):
                toks.append(("CY", "ㅅ"))
                i += 3
            elif nxt(i + 2) == "e":
                toks.append(("CY", "ㅅ"))
                i += 2
            else:
                toks.append(("C", "ㅅ"))
                i += 2
                toks.append(("V", "ㅟ" if False else "ㅣ"))
                i += 1
            continue
        if c in "cg" and nxt(i + 1) in ("e", "i"):
            on = "ㅊ" if c == "c" else "ㅈ"
            if nxt(i + 1) == "i" and nxt(i + 2) in VOWELS and nxt(i + 2):
                toks.append(("C", on))
                i += 2
            else:
                toks.append(("C", on))
                i += 1
            continue
        if w.startswith("gli", i):
            toks.append(("K", "ㄹ"))
            toks.append(("C", "ㄹ"))
            if nxt(i + 3) in VOWELS and nxt(i + 3):
                toks.append(("Y", ""))
                i += 3
            else:
                i += 2
            continue
        if w.startswith("gn", i):
            toks.append(("K", "ㄴ"))
            toks.append(("CY", "ㄴ"))
            i += 2
            if nxt(i) == "i" and nxt(i + 1) in VOWELS and nxt(i + 1):
                i += 1
            continue
        if c == "q" or (c == "g" and nxt(i + 1) == "u" and nxt(i + 2) in VOWELS and nxt(i + 2)):
            toks.append(("CW", "ㄲ" if c == "q" else "ㄱ"))
            i += 2 if nxt(i + 1) == "u" else 1
            continue
        if c == "s" and i > 0 and w[i - 1] in VOWELS and nxt(i + 1) in VOWELS and nxt(i + 1):
            toks.append(("C", "ㅈ"))  # 모음 사이 s = z
            i += 1
            continue
        if c == "s" and nxt(i + 1) and nxt(i + 1) not in VOWELS:
            toks.append(("C", "ㅅ"))  # 자음 앞 s = 스
            i += 1
            continue
        if c == "r":
            toks.append(("R", "ㄹ"))  # r 은 받침이 되지 않는다 (cor → 꼬르)
            i += 1
            continue
        toks.append(("L" if c == "l" else "C", SIMPLE.get(c, "ㅇ")))
        i += 1

    # 음절 만들기
    syl = []  # [onset, vowel, coda]
    pend = []  # 대기 중인 자음 (종류, 자모)
    glide = ""

    def flush(keep_last):
        nonlocal pend
        rest = pend[:-1] if keep_last else pend
        for k, (kind, j) in enumerate(rest):
            if k == 0 and syl and not syl[-1][2] and j in CODA_OK and kind in ("C", "L", "LV"):
                syl[-1][2] = CODA_OK[j]
            else:
                syl.append([j, "ㅡ", ""])
        pend = pend[-1:] if keep_last else []

    prev_kind = ""
    for kind, j in toks:
        if kind == "K":
            if pend:
                flush(False)
            if syl and not syl[-1][2]:
                syl[-1][2] = j
        elif kind in ("C", "CY", "CW", "R", "L"):
            if kind == "L" and prev_kind == "V":
                kind = "LV"  # 모음 바로 뒤의 l
            pend.append((kind, j))
        elif kind == "Y":
            glide = "y"
        elif kind == "V":
            if pend and pend[-1][0] in ("L", "LV"):
                if len(pend) >= 2:          # 자음+l (gl, pl, bl…) → 글로, 쁠라
                    flush(True)
                    if syl and syl[-1][1] == "ㅡ" and not syl[-1][2]:
                        syl[-1][2] = "ㄹ"
                elif pend[0][0] == "LV" and syl and not syl[-1][2]:  # 모음 사이 l → ㄹㄹ (sola → 쏠라)
                    syl[-1][2] = "ㄹ"
            if pend:
                flush(True)
                pk, on = pend[0]
                pend = []
                g = "y" if pk == "CY" else "w" if pk == "CW" else glide
            else:
                on, g = "ㅇ", glide
            plain = [k for k, v in V_PLAIN.items() if v == j][0]
            v = V_Y[plain] if g == "y" else V_W[plain] if g == "w" else j
            if on in ("ㅊ", "ㅈ") and v in ("ㅑ", "ㅛ", "ㅠ", "ㅖ"):
                v = {"ㅑ": "ㅏ", "ㅛ": "ㅗ", "ㅠ": "ㅜ", "ㅖ": "ㅔ"}[v]
            syl.append([on, v, ""])
            glide = ""
        prev_kind = kind
    if pend:
        flush(False)
    for a, b in zip(syl, syl[1:]):      # ㄴ + ㄱ → ㅇ (pianga → 삐앙가)
        if a[2] == "ㄴ" and b[0] in ("ㄱ", "ㄲ"):
            a[2] = "ㅇ"
    return "".join(compose(a, b, c) for a, b, c in syl)


def it_line(text):
    text = re.sub(r"['’]", "", text)  # 생략 부호는 붙여 읽는다 (t'amai → 따마이)
    return " ".join(filter(None, (it_word(w) for w in text.split())))


# ---------------------------------------------------------------------------
# 6. 출력
# ---------------------------------------------------------------------------
def pack(notes, limit):
    return [[round(s, 3), round(d, 3), p] for s, d, p in notes if s < limit]


def build(song):
    if song.get("mxl"):
        tracks = read_mxl(os.path.join(OPENSCORE, "scores", song["mxl"]), song.get("tempo", 1.0))
    else:
        ly = os.path.join(MUTOPIA, "ftp", song["path"])
        problems = check_safe(ly)
        if problems:
            print(f"  ✗ 건너뜀 (위험한 코드): {problems[:3]}")
            return None
        with tempfile.TemporaryDirectory() as work:
            mid = to_midi(ly, work)
            tracks = read_midi(mid, song.get("tempo", 1.0))
    voice, lyr, bass, upper = pick_tracks(tracks)
    limit = song.get("limit", 110)
    lines = build_lines(lyr["lyrics"], limit)
    if not lines:
        raise RuntimeError("가사 줄이 비었음")
    # 마지막 가사 뒤 몇 초까지만
    end = min(limit, lines[-1]["time"] + 6)
    for ln in lines:
        ln["text"] = it_line(ln["orig"])
    first = voice["notes"][0][0]
    pitches = [p for _, _, p in voice["notes"]]
    data = dict(
        id=song["id"], title=song["title"], ko=song["ko"], level=song["level"],
        voices=song["voices"], source="Mutopia Project (public domain)",
        duration=round(end, 2), practiceEnd=round(min(end, lines[min(len(lines) - 1, 7)]["time"] + 4), 2),
        melodyRange=[min(pitches), max(pitches)],
        lyrics=lines,
        phases=[dict(start=0, end=round(max(0.1, lines[0]["time"]), 2), text="전주 중")],
        chip=dict(
            melody=pack(voice["notes"], end),
            upper=pack(top_line(upper["notes"]), end) if upper else [],
            bass=pack(bottom_line(bass["notes"]), end) if bass else [],
        ),
    )
    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, song["id"] + ".js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("// 자동 생성: tools/build_songs.py — 직접 고치려면 가사(lyrics)의 text만 고치세요\n")
        f.write("CHIP_SONGS.push(" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ");\n")
    return data


def main():
    want = set(sys.argv[1:])
    built = []
    for song in SONG_LIST:
        if want and song["id"] not in want:
            continue
        print(f"▶ {song['id']}  ({song.get('path') or song.get('mxl')})")
        try:
            d = build(song)
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ 실패: {e}")
            continue
        if d:
            print(f"  ✓ {len(d['lyrics'])}줄, {d['duration']}초, 음역 {d['melodyRange']}")
            for ln in d["lyrics"][:3]:
                print(f"     {ln['time']:6.1f}  {ln['orig']}  →  {ln['text']}")
            built.append(song["id"])
    # 곡 목록 파일 (게임이 불러올 순서)
    ids = sorted(f[:-3] for f in os.listdir(OUT_DIR) if f.endswith(".js") and f != "index.js")
    with open(os.path.join(OUT_DIR, "index.js"), "w", encoding="utf-8") as f:
        f.write("// 자동 생성: 변환된 칩튠 곡 목록\nconst CHIP_SONG_IDS = " + json.dumps(ids) + ";\n")
    print(f"\n완료: {len(built)}곡 변환")


if __name__ == "__main__":
    main()
