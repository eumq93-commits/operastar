"""
Vaghissima sembianza (S. Donaudy, 1918) — 사용자가 준 PDF 악보를 보고 손으로 옮긴 데이터
작곡가(1925 사망)·작사가 알베르토 도나우디(1941 사망) 모두 저작권 만료.

A장조, 3/4, Andante. 1절(7~30마디)과 2절(36~59마디)의 노래 선율이 같다.
음 표기: 'a4' = A4(라), 'cis5' = C#5, 길이는 4분음표 = 1
피아노는 칩튠용으로 단순화: 베이스 줄 + 전주·간주의 오른손 선율만.
"""

TEMPO_QPM = 69   # Andante
BEAT = 3         # 3/4

NOTE = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}


def midi(name):
    """'cis5' → 73"""
    letter = name[0]
    rest = name[1:]
    acc = 0
    while rest.startswith(("is", "es")):
        acc += 1 if rest.startswith("is") else -1
        rest = rest[2:]
    return 12 * (int(rest) + 1) + NOTE[letter] + acc


# 노래 선율 한 절 (마디 = 3박). (음, 길이, 1절 가사, 2절 가사). 음이 None 이면 쉼표
VERSE = [
    # 7마디: 쉼 2박 + 못갖춘 시작
    (None, 2, "", ""), ("e4", 1, "Va-", "La"),
    ("a4", 2, "ghis-", "ca-"), ("b4", 1, "si-", "ra"),
    ("cis5", 2, "ma", "ri-"), ("e5", 1, "sem-", "mem-"),
    ("d5", 3, "bian-", "bran-"),
    ("cis5", 2, "za", "za"), ("d5", 1, "d'an-", "che in"),
    ("e5", 2, "ti-", "cor"), ("cis5", 1, "ca", "mi"),
    ("a4", 2, "don-", "s'è"), ("b4", 1, "na a-", "de-"),
    ("gis4", 1.5, "ma-", "sta-"), ("a4", 0.5, "", ""), ("fis4", 1, "", ""),
    ("e4", 3, "ta,", "ta,"),
    ("b4", 1, "chi,", "sì ar-"), ("cis5", 1, "dun-", "den-"), ("d5", 1, "que,", "te"),
    ("b4", 2, "v'ha", "v'ha"), ("gis4", 1, "ri-", "già"),
    ("a4", 3, "trat-", "fat-"),
    ("b4", 3, "ta", "ta,"),
    ("cis5", 1, "con", "ri-"), ("dis5", 1, "tan-", "na-"), ("e5", 1, "ta", "scer"),
    ("fis5", 2, "si-", "la"), ("a4", 1, "mi-", "spe-"),
    ("b4", 1.5, "glian-", "ran-"), ("cis5", 0.5, "", ""), ("a4", 1, "", ""),
    ("gis4", 2, "za,", "za,"), ("e4", 1, "ch'io", "che un"),
    ("fis4", 1, "guar-", "ba-"), ("d5", 1, "do,", "cio,"), ("fis4", 1, "e", "un"),
    ("gis4", 1, "par-", "vo-"), ("e5", 1, "lo,", "to,"), ("gis4", 1, "e", "un"),
    ("a4", 1, "cre-", "gri-"), ("b4", 1, "do", "do"), ("cis5", 1, "d'a-", "d'a-"),
    ("a5", 1.5, "ver-", "mo-"), ("d5", 0.5, "vi", "re"), ("e5", 0.5, "a", "più"), ("fis5", 0.5, "me", "non"),
    ("cis5", 1, "da-", "chie-"), ("b4", 1, "van-", "do"), ("a4", 1, "ti", "che a"),
    ("d5", 0.5, "co-", "lei"), ("e5", 0.5, "me ai", "che"), ("b4", 1.75, "bei dì", "muta, è"), ("a4", 0.25, "d'a-", "o-"),
    ("a4", 2, "mor?", "gnor."), (None, 1, "", ""),
]

# 베이스 (마디별). 전주 1~7마디 / 1절 8~30마디
BASS_INTRO = [  # 못갖춘마디(1박 쉼) 뒤 1~7마디
    [("cis3", 1), ("e3", 1), ("gis3", 1)],
    [("g3", 1), ("a3", 1), ("g3", 1)],
    [("fis3", 1), ("e3", 1), ("d3", 1)],
    [("cis3", 1), ("bis2", 1), ("b2", 1)],
    [("e2", 1), ("b2", 1), ("e3", 1)],
    [("b2", 1), ("e3", 2)],
    [("a2", 2), (None, 1)],
]
BASS_VERSE = [  # 8~29마디 (30마디는 다음 구간이 이어받음)
    [("a2", 1), ("e3", 1), ("gis3", 1)],
    [("a3", 2), ("cis4", 1)],
    [("b3", 2), ("e3", 1)],
    [("a3", 2), ("b3", 1)],
    [("cis4", 2), ("a3", 1)],
    [("fis3", 2), ("b2", 1)],
    [("e3", 2), ("b2", 1)],
    [("e2", 2), ("b2", 1)],
    [("e3", 3)],
    [("e3", 3)],
    [("fis3", 3)],
    [("gis3", 3)],
    [("a3", 1), ("b3", 1), ("cis4", 1)],
    [("b2", 3)],
    [("e2", 1), ("gis3", 1), ("fis3", 1)],
    [("e3", 3)],
    [("a2", 1), ("fis3", 1), ("a3", 1)],
    [("cis3", 1), ("e3", 1), ("b3", 1)],
    [("fis2", 1), ("d3", 1), ("a3", 1)],
    [("d3", 3)],
    [("e2", 1), ("a2", 1), ("cis3", 1)],
    [("e3", 3)],
]
# 전주·간주·후주의 오른손 선율 (1~7마디)
UPPER_INTRO = [
    [("a4", 2), ("b4", 1)],
    [("cis5", 2), ("e5", 1)],
    [("d5", 1), ("cis5", 1), ("fis5", 1)],
    [("e5", 1), ("dis5", 1), ("a5", 1)],
    [("gis5", 0.5), ("fis5", 0.5), ("e5", 0.5), ("d5", 0.5), ("cis5", 1)],
    [("d5", 0.5), ("b4", 0.5), ("a4", 1.5), ("gis4", 0.5)],
    [("a4", 2), (None, 1)],
]


def build_tracks():
    """read_midi 와 같은 모양: [{'name','notes':[(초,길이,음)],'lyrics':[(초,글자)]}]"""
    spq = 60.0 / TEMPO_QPM
    melody, lyrics, bass, upper = [], [], [], []

    def put(track, t, seq):
        for p, d in seq:
            if p:
                track.append((t * spq, d * spq, midi(p)))
            t += d
        return t

    # 못갖춘마디 1박 + 전주 1~6마디
    t = 1.0
    t_intro = t
    for bar in BASS_INTRO[:6]:
        t = put(bass, t, bar)
    put(upper, t_intro, [x for bar in UPPER_INTRO[:6] for x in bar])

    def verse(t, which):
        start = t
        for p, d, l1, l2 in VERSE:
            if p:
                melody.append((t * spq, d * spq, midi(p)))
                text = l1 if which == 1 else l2
                if text:
                    lyrics.append((t * spq, text))
            t += d
        # 베이스: 7마디(첫 마디)는 전주 7마디 패턴, 이어서 8~29마디
        b = start
        b = put(bass, b, BASS_INTRO[6])
        for bar in BASS_VERSE:
            b = put(bass, b, bar)
        return t  # 30마디 끝 + 1박 쉼까지 지난 시점

    t = verse(t, 1)                     # 7~30마디
    # 30마디 셋째 박에서 간주 시작: 30~35마디 = 전주 1~6마디 패턴
    t_inter = t - BEAT
    put(bass, t_inter, [x for bar in BASS_INTRO[:6] for x in bar])
    put(upper, t_inter, [x for bar in UPPER_INTRO[:6] for x in bar])
    t = t_inter + 6 * BEAT              # 36마디
    t = verse(t, 2)                     # 36~59마디
    t_end = t - BEAT                    # 59마디부터 후주
    put(bass, t_end, [x for bar in BASS_INTRO[:6] for x in bar] + [("a2", 3)])
    put(upper, t_end, [x for bar in UPPER_INTRO[:6] for x in bar] + [("a4", 3)])

    return [
        dict(name="voice", notes=sorted(melody), lyrics=lyrics),
        dict(name="upper", notes=sorted(upper), lyrics=[]),
        dict(name="bass", notes=sorted(bass), lyrics=[]),
    ]
