/* =====================================================
   성악가로 살아남기 — 입시편 데이터
   수치·곡·학교·이벤트는 전부 여기서만 고친다.
   (코드는 survive/game.js, 무대 엔진은 survive/stage.js)
===================================================== */

/* ---------- 밸런스 수치 (초안: 프로토타입으로 조정) ---------- */
const BALANCE = {
  startSkill: 5,           // 시작 실력(경험치)
  startVoice: 75,          // 시작 목 컨디션 (숨은 게이지)
  maxStat: 100,
  skillDecay: 4,           // 이번 턴 실력을 올린 행동이 없으면 감소
  hoarseVoice: 30,         // 이 아래면 목이 쉬어서 연습 효과 절반
  masteryKeepOnRegress: 0.5, // 회귀해도 남는 곡 숙련도 비율
  eventChance: 0.35,       // 랜덤 이벤트 확률(턴당)
  baseLimitTime: 4.0,      // OPERA TYPE 기본 낙하 시간(초)
  // 최종 실기 점수 = 정확도×50 + 실력×0.3 + 곡 숙련도×0.2  (최대 100)
  // → 타자만 잘 쳐서는 못 붙는다. 1회차엔 상위권이 거의 불가능, 회귀로 쌓아야 한다.
  examWeights: { accuracy: 50, skill: 0.3, mastery: 0.2 },
  minigameSkip: 0.7        // 미니게임을 건너뛰면 효과 70%
};

/* ---------- 무대 여유도 (연습량 = 실력·숙련도에 따라) ----------
   ease = 실력/2 + 숙련도/2 (0~1)
   timeMult: 낙하 시간 배율 (작을수록 급박)
   typo: PASS로 봐주는 오타 글자 수
   lookahead: 아직 안 떨어진 다음 가사를 미리 쳐도 인정하는 줄 수
   preview: 화면 위에 미리 보여 주는 다음 가사 줄 수                  */
const STAGE_TIERS = [
  { min: 0,    name: "급박",   timeMult: 0.55, typo: 0, lookahead: 0, preview: 0, hpBonus: -1 },
  { min: 0.3,  name: "빠듯",   timeMult: 0.75, typo: 1, lookahead: 0, preview: 0, hpBonus: 0 },
  { min: 0.55, name: "여유",   timeMult: 1.0,  typo: 1, lookahead: 1, preview: 1, hpBonus: 1 },
  { min: 0.8,  name: "완벽",   timeMult: 1.25, typo: 2, lookahead: 2, preview: 2, hpBonus: 2 }
];

/* ---------- 달력: 2주 = 1턴, 고3 3월 상순 ~ 1월 하순 ---------- */
const CALENDAR = (() => {
  const months = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1];
  const turns = [];
  months.forEach(m => ["상순", "하순"].forEach(h => turns.push(`${m}월 ${h}`)));
  return turns; // 22턴
})();

const FIXED_TURNS = {
  mockExam: 2,       // 4월 상순: 모의 실기 (망쳐도 회귀 없음)
  announce: 9,       // 7월 하순: 지정곡 공지
  apply: 12,         // 9월 상순: 원서 접수
  cold: 16,          // 11월 상순: 감기 유행
  accompanist: 19,   // 12월 하순: 반주 선생님 연락 두절
  exam: 21           // 1월 하순: 가·나·다군 실기
};

/* ---------- 성별 · 성부 ----------
   images: 무대 캐릭터 (메조·베이스는 그림이 생길 때까지 소프라노·바리톤 그림을 빌려 씀) */
const GENDERS = { female: "여성", male: "남성" };

const VOICE_TYPES = {
  soprano: {
    label: "소프라노",
    gender: "female",
    images: {
      normal: "./soprano-normal.png", perfect: "./soprano-perfect.png",
      good: "./soprano-good.png", pass: "./soprano-pass.png", miss: "./soprano-miss.png"
    }
  },
  mezzo: {
    label: "메조소프라노",
    gender: "female",
    borrowed: true,
    images: {
      normal: "./soprano-normal.png", perfect: "./soprano-perfect.png",
      good: "./soprano-good.png", pass: "./soprano-pass.png", miss: "./soprano-miss.png"
    }
  },
  tenor: {
    label: "테너",
    gender: "male",
    images: {
      normal: "./singer-normal.png", perfect: "./singer-perfect.png",
      good: "./singer-good.png", pass: "./singer-pass.png", miss: "./singer-miss.png"
    }
  },
  baritone: {
    label: "바리톤",
    gender: "male",
    images: {
      normal: "./baritone-normal.png", perfect: "./baritone-perfect.png",
      good: "./baritone-good.png", pass: "./baritone-pass.png", miss: "./baritone-miss.png"
    }
  },
  bass: {
    label: "베이스",
    gender: "male",
    borrowed: true,
    images: {
      normal: "./baritone-normal.png", perfect: "./baritone-perfect.png",
      good: "./baritone-good.png", pass: "./baritone-pass.png", miss: "./baritone-miss.png"
    }
  }
};

/* ---------- 입시곡 (작곡가·작사가 모두 저작권 만료) ----------
   fallSpeed: OPERA TYPE 기준 낙하 배율 (1 = 4초)
   practiceEnd: 실전 연습 때 이 시간(초)까지만 부른다 (없으면 끝까지)      */
const SONGS = {
  lascia: {
    title: "Lascia ch'io pianga",
    ko: "울게 하소서 · 헨델",
    audio: "./lascia.mp3",
    level: "입시",
    voices: ["soprano", "mezzo"],
    fallSpeed: 2,
    practiceEnd: 64,
    lyrics: [
      { time: 8.0, text: "라샤 끼오 삐앙가" }, { time: 14.5, text: "라 두라 쏘르떼" },
      { time: 22.0, text: "에 께 쏘스피리" }, { time: 29.0, text: "라 리베르따" },
      { time: 37.5, text: "에 께 쏘스피리" }, { time: 45.0, text: "에 께 쏘스피리" },
      { time: 52.0, text: "라 리베르따" },
      { time: 60.5, text: "라샤 끼오 삐앙가" }, { time: 68.0, text: "라 두라 쏘르떼" },
      { time: 76.0, text: "에 께 쏘스피리" }, { time: 83.0, text: "라 리베르따" },
      { time: 101.0, text: "일 두올로 인프랑가" }, { time: 107.0, text: "꿰스떼 리또르떼" },
      { time: 113.5, text: "데 미에이 마르띠리" }, { time: 120.0, text: "쏠 뻬르 삐에따" },
      { time: 126.5, text: "데 미에이 마르띠리" }, { time: 133.5, text: "쏠 뻬르 삐에따" },
      { time: 140.0, text: "라샤 끼오 삐앙가" }, { time: 148.5, text: "라 두라 쏘르떼" },
      { time: 156.0, text: "에 께 쏘스피리" }, { time: 163.0, text: "라 리베르따" },
      { time: 171.5, text: "에 께 쏘스피리" }, { time: 179.0, text: "에 께 쏘스피리" },
      { time: 186.0, text: "라 리베르따" },
      { time: 195.0, text: "라샤 끼오 삐앙가" }, { time: 203.0, text: "라 두라 쏘르떼" },
      { time: 211.0, text: "에 께 쏘스피리" }, { time: 218.0, text: "라 리베르따" }
    ],
    phases: [
      { start: 0, end: 8.0, text: "전주 중" },
      { start: 92.0, end: 100.0, text: "간주 중" }
    ]
  },
  santalucia: {
    title: "Santa Lucia",
    ko: "산타 루치아 · 나폴리 민요(코트라우)",
    audio: "./santalucia.mp3",
    level: "입시",
    voices: ["soprano", "mezzo", "tenor", "baritone", "bass"],
    fallSpeed: 1,
    lyrics: [
      { time: 16.0, text: "쑬 마레 루치카" }, { time: 21.0, text: "라스트로 다르젠또" },
      { time: 25.0, text: "플라치다 에 론다" }, { time: 29.5, text: "프로스페 로 에일 벤또" },
      { time: 33.5, text: "쑬 마레 루치카" }, { time: 38.0, text: "라스트로 다르젠또" },
      { time: 42.0, text: "플라치다 에 론다" }, { time: 46.0, text: "프로스페 로 에일 벤또" },
      { time: 49.5, text: "베니떼 알 라지레" }, { time: 54.5, text: "바르께따 미아" },
      { time: 58.5, text: "산타 루치아" }, { time: 62.0, text: "산타 루치아" },
      { time: 66.0, text: "베니떼 알 라지레" }, { time: 71.0, text: "바르께따 미아" },
      { time: 74.5, text: "산타 루치아" }, { time: 78.5, text: "산타 루치아" }
    ],
    phases: [{ start: 0, end: 16.0, text: "전주 중" }]
  },
  osolemio: {
    title: "'O sole mio",
    ko: "오 나의 태양 · 디 카푸아",
    audio: "./osolemio.mp3",
    level: "입시",
    voices: ["tenor", "baritone", "bass"],
    fallSpeed: 2,
    lyrics: [
      { time: 17.0, text: "께 벨라 꼬자" }, { time: 20.0, text: "나 유르 나타 에 쏠레" },
      { time: 24.0, text: "나리아 쎄레나" }, { time: 28.0, text: "돕뽀 나 뗌페스타" },
      { time: 33.0, text: "뻴라리아 프레스카" }, { time: 36.0, text: "빠레 쟈 나 페스따" },
      { time: 40.5, text: "께 벨라 꼬자" }, { time: 43.0, text: "나 유르나타 에 쏠레" },
      { time: 48.5, text: "마 나뚜 쏠레" }, { time: 56.0, text: "뀨 벨로이네" },
      { time: 59.5, text: "오 쏠레미오" }, { time: 64.0, text: "스탄 프론 떼아 떼" },
      { time: 68.5, text: "오 쏠레 오 쏠레 미오" }, { time: 75.0, text: "스탄 프론 떼아 떼" },
      { time: 79.0, text: "스탄 프론 떼아 떼" }
    ],
    phases: [{ start: 0, end: 17.0, text: "전주 중" }]
  }
};

/* ---------- 학교 (패러디 이름) ----------
   timeBase: 학교별 무대 속도 (STAGE_TIERS의 배율에 곱한다. 낮을수록 빠르고 어렵다)
   cutoff: 합격선 (최종 실기 점수)
   mode: assigned = 지정곡 / free = 자유곡                               */
const SCHOOLS = [
  { id: "hanguk",   group: "가", name: "한국음악대학교", tier: "최상위", mode: "assigned", timeBase: 0.8, cutoff: 86,
    bonus: "명문 출신: 대학편 인맥 +20" },
  { id: "seoulart", group: "가", name: "서울예술대학교", tier: "상위",   mode: "free",     timeBase: 0.85, cutoff: 80,
    bonus: "입학 장학금: 대학편 돈 +30" },
  { id: "daehan",   group: "나", name: "대한음악원",     tier: "상위",   mode: "assigned", timeBase: 0.82, cutoff: 82,
    bonus: "엄격한 교수님: 대학편 실력 +10" },
  { id: "hanbit",   group: "나", name: "한빛대학교",     tier: "중위",   mode: "free",     timeBase: 0.9, cutoff: 74,
    bonus: "성적 장학금: 대학편 돈 +15" },
  { id: "saesol",   group: "다", name: "새솔대학교",     tier: "중위",   mode: "assigned", timeBase: 0.92, cutoff: 68,
    bonus: "끈끈한 선후배: 대학편 인맥 +10" },
  { id: "nuri",     group: "다", name: "누리음악대학",   tier: "하위",   mode: "free",     timeBase: 1.0, cutoff: 60,
    bonus: "가습기 지급: 대학편 목 감소 완화" }
];

/* ---------- 행동 카드 ----------
   needsSong: 곡을 골라야 하는 카드
   skill/mastery/voice: 기본 변화량 (실력·숙련도 상승은 높을수록 둔화)    */
const ACTIONS = {
  practice: { label: "개인 연습",   icon: "🎼", needsSong: true,  skill: 1,   mastery: 6,  voice: -8, minigame: "breath",
              desc: "호흡 훈련 미니게임. 고른 곡의 숙련도 ++, 실력 +, 목 −" },
  stage:    { label: "실전 연습",   icon: "🎤", needsSong: true,  skill: 0,   mastery: 0,  voice: -10,
              desc: "직접 무대를 치른다. 잘할수록 숙련도·실력이 크게 오른다. 목 −" },
  lesson:   { label: "입시 레슨",   icon: "👩‍🏫", needsSong: true,  skill: 3,   mastery: 4,  voice: -8, oncePerTurn: true,
              desc: "실력 ++, 숙련도 +, 목 − (한 턴에 한 번)" },
  theory:   { label: "청음·시창",   icon: "📖", needsSong: false, skill: 2,   mastery: 0,  voice: 0, minigame: "solfege",
              desc: "선율 따라 부르기 미니게임. 목을 쓰지 않고 실력 +" },
  rest:     { label: "휴식",       icon: "🛌", needsSong: false, skill: -1,  mastery: 0,  voice: 30,
              desc: "목 +++, 실력 −" },
  backup:   { label: "예비 반주자 섭외", icon: "🎹", needsSong: false, skill: 0, mastery: 0, voice: 0, oncePerRun: true,
              requiresInfo: "accompanist",
              desc: "12월 하순 반주 선생님 연락 두절에 대비한다 (미래 정보)" }
};

/* ---------- 랜덤 이벤트 ----------
   effect: { skill, voice, masteryBest, masteryRandom, boost }
   boost: 다음 턴 연습 효과 +50%                                       */
const RANDOM_EVENTS = [
  { id: "karaoke", text: "친구들이 수행평가 끝났다고 노래방에 가자고 한다.",
    choices: [
      { label: "간다", result: "목은 좀 상했지만 기분이 개운하다. 다음 턴 연습 효과가 오른다.", effect: { voice: -15, boost: true } },
      { label: "참는다", result: "아쉽지만 집에 가서 일찍 잤다.", effect: { voice: 5 } }
    ] },
  { id: "masterclass", text: "입시 선생님이 주말 마스터클래스 청강을 권하신다.",
    choices: [
      { label: "청강한다", result: "프로의 호흡을 눈앞에서 봤다. 실력이 올랐다.", effect: { skill: 4 } },
      { label: "쉰다", result: "주말에 푹 쉬었다.", effect: { voice: 10 } }
    ] },
  { id: "rival", text: "옆 반 친구가 같은 곡을 엄청 잘 부른다는 소문이 돈다.",
    choices: [
      { label: "자극받아 더 연습한다", result: "밤늦게까지 연습했다.", effect: { masteryBest: 6, voice: -8 } },
      { label: "내 페이스대로 간다", result: "흔들리지 않기로 했다.", effect: {} }
    ] },
  { id: "dust", text: "황사가 심한 주간이다. 목이 칼칼하다.", effect: { voice: -12 } },
  { id: "doraji", text: "엄마가 도라지청을 사 오셨다.", effect: { voice: 20 } },
  { id: "mocktest", text: "학교 모의고사 기간이라 연습실에 거의 못 갔다.", effect: { skill: -2 } },
  { id: "praise", text: "레슨 선생님이 \"요즘 소리가 좋아졌다\"고 칭찬하셨다.", effect: { skill: 3 } },
  { id: "youtube", text: "명연주 영상을 보다가 새벽 3시가 됐다.", effect: { voice: -8, masteryRandom: 4 } }
];

/* ---------- 레슨 선생님 튜토리얼 (처음 4주 = 2턴) ---------- */
const TUTORIAL = {
  0: [
    "어서 와. 오늘부터 1월 실기까지 내가 입시 레슨을 맡을 거야.",
    "한 턴은 2주야. 평일 칸과 주말 칸에 행동 카드를 하나씩 놓고 '이번 턴 진행'을 누르면 돼.",
    "실기에서 보는 건 세 가지야. 무대 정확도, 평소 쌓은 실력, 그리고 그 곡을 얼마나 연습했는지(숙련도).",
    "그리고 목! 연습이나 레슨을 하면 목을 써. 목이 쉬면 연습 효과가 반으로 줄고, 무대에서 가사가 흔들려 보여. 가끔은 쉬어야 해."
  ],
  1: [
    "'실전 연습'은 직접 오페라타입 무대를 치르는 거야. 잘 부를수록 숙련도가 확 오르지.",
    "숙련도가 높은 곡은 무대에서 가사가 천천히 떨어지고, 목숨(HP)도 넉넉해져.",
    "진행은 턴마다 자동 저장돼. 브라우저 기록을 지우면 사라질 수 있으니 가끔 '저장 파일 내보내기'도 해 둬.",
    "다음 턴엔 모의 실기가 있어. 망쳐도 괜찮은 연습 무대니까 부담 갖지 마."
  ]
};

/* ---------- 엔딩 (도감) ---------- */
const ENDINGS = {
  slump:   { title: "슬럼프",       text: "연습을 놓은 사이 소리가 무너졌다. 결국 전과를 결심했다.", fail: true },
  allfail: { title: "전원 불합격",   text: "세 곳 모두 이름이 없었다. 합격자 명단을 몇 번이고 새로고침했다.", fail: true },
  hanguk:   { title: "한국음악대학교 합격", text: "모두가 꿈꾸는 학교. 첫 레슨 날, 교수님이 이름을 기억하고 계셨다." },
  seoulart: { title: "서울예술대학교 합격", text: "장학금 소식에 엄마가 울었다." },
  daehan:   { title: "대한음악원 합격",     text: "엄격하기로 소문난 교수님 문하에 들어갔다." },
  hanbit:   { title: "한빛대학교 합격",     text: "캠퍼스가 예쁘다. 연습실도 넉넉하다." },
  saesol:   { title: "새솔대학교 합격",     text: "선배들이 합격 축하 회식을 열어 줬다." },
  nuri:     { title: "누리음악대학 합격",   text: "작은 학교지만, 무대는 어디서든 시작된다." }
};

/* ---------- 3장 진로 (대학편 이후, 나중에 구현) ---------- */
const CAREERS = [
  { id: "grad-kr",   label: "국내 대학원",       play: "강사 자리·교수 임용 경쟁",                    endings: ["대학 교수", "시립합창단 단원"] },
  { id: "grad-abroad", label: "해외 대학원",     play: "언어 게이지, 비용과 장학금 경쟁, 극장 오디션", endings: ["해외 극장 전속 가수", "오페라 주역"] },
  { id: "media",     label: "유튜브·방송",       play: "구독자·인기 게이지, 오디션 프로그램",          endings: ["크로스오버 스타", "트로트 스타"] },
  { id: "edu",       label: "음악교육대학원",    play: "임용시험 미니게임",                            endings: ["음악교사 (숨겨진 엔딩)"] }
];

/* 대학편에서 망치면 회귀하는 무대 (실기시험·정기연주회·졸업연주) */
const COLLEGE_FAIL_STAGES = ["학기말 실기시험", "정기연주회", "졸업연주"];
