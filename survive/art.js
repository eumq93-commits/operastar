/* =====================================================
   그림 파일 목록
   여기 적힌 경로에 PNG를 넣으면 자동으로 바뀐다.
   파일이 없으면 코드로 그린 임시 그림이 보인다.
   (프롬프트와 크기는 survive/art/PROMPTS.md)
===================================================== */

const ART_DIR = "./survive/art/";

const ART = {
  // 배경 (320×180, 16:9)
  bgTitle:    ART_DIR + "bg-title.png",
  bgRoom:     ART_DIR + "bg-room.png",      // 내 방 (휴식·이론·기본)
  bgPractice: ART_DIR + "bg-practice.png",  // 학교 연습실 (개인 연습·실전 연습)
  bgLesson:   ART_DIR + "bg-lesson.png",    // 입시 레슨실

  // 인물
  teacher:    ART_DIR + "teacher.png",      // 레슨 선생님 얼굴 (64×64)

  // 행동 카드 아이콘 (32×32)
  icon: {
    practice: ART_DIR + "icon-practice.png",
    stage:    ART_DIR + "icon-stage.png",
    lesson:   ART_DIR + "icon-lesson.png",
    theory:   ART_DIR + "icon-theory.png",
    rest:     ART_DIR + "icon-rest.png",
    backup:   ART_DIR + "icon-backup.png"
  },

  // 2등신 SD 캐릭터 (64×64). 없으면 기존 무대 캐릭터 그림을 쓴다.
  sd(voice, pose) { return `${ART_DIR}sd-${voice}-${pose}.png`; } // pose: idle | sing | rest | sick
};

/* 행동 → 장면 배경 */
const ACTION_SCENE = {
  practice: "practice",
  stage: "practice",
  lesson: "lesson",
  theory: "room",
  rest: "room",
  backup: "room"
};

/* ---------- 있는 그림만 쓰기 ----------
   시작할 때 그림 파일을 한 번씩 불러 보고, 성공한 것만 화면에 쓴다.
   (없는 파일을 매번 요청해 깜빡이는 것을 막는다)                      */
const ART_OK = new Set();

function artAvailable(path) { return ART_OK.has(path); }

function preloadArt(voices, timeoutMs = 2500) {
  const paths = [ART.bgTitle, ART.bgRoom, ART.bgPractice, ART.bgLesson, ART.teacher, ...Object.values(ART.icon)];
  voices.forEach(v => ["idle", "sing", "rest", "sick"].forEach(p => paths.push(ART.sd(v, p))));
  const jobs = paths.map(src => new Promise(done => {
    const img = new Image();
    img.onload = () => { ART_OK.add(src); done(); };
    img.onerror = () => done();
    img.src = src;
  }));
  return Promise.race([Promise.all(jobs), new Promise(done => setTimeout(done, timeoutMs))]);
}
