# 성악가로 살아남기 — 그림 프롬프트 모음

뽑은 그림을 **이 폴더(`survive/art/`)에 아래 파일 이름 그대로** 넣으면 게임에 바로 들어간다.
파일이 없는 동안에는 코드로 그린 임시 그림과 이모지가 보인다.

## 공통 규칙 (모든 프롬프트 끝에 붙이기)

```
16-bit pixel art, SNES-era style, crisp hard pixel edges, no anti-aliasing, no blur,
no gradients, limited 16-color palette:
#1b1024 #2a1c3d #45305e #6b4f96 #7d2b45 #c4404f #f28ba0 #f5c24c
#e08a2e #fff3d6 #f1dca8 #9a6440 #62402b #63b6e6 #6fd39c #8e8299,
1px dark outline (#1b1024), cozy Korean life-sim game look, no text, no watermark
```

## AI 그림 → 게임용으로 다듬기

1. AI 그림은 "픽셀 느낌"일 뿐 실제 픽셀 격자가 아니다. 크게 뽑은 뒤 **Pixelorama 또는 Piskel**(무료)에서
   표의 크기로 줄인다. 줄일 때 반드시 **최근접(Nearest Neighbor)** 방식으로.
2. 팔레트를 위 16색으로 맞춘다 (Pixelorama: 이미지 → 팔레트로 색 줄이기).
3. 캐릭터·아이콘·얼굴은 **배경 투명 PNG**로 저장한다.
4. 같은 캐릭터를 여러 장 뽑을 때는 첫 장(idle)을 함께 올리고 "같은 캐릭터, 같은 옷, 같은 얼굴"이라고 적는다.

---

## 1. 배경 (4장)

| 파일 | 크기 | 쓰이는 곳 |
|---|---|---|
| `bg-title.png` | 320×240 | 타이틀·클리어 화면 |
| `bg-room.png` | 320×180 | 기본 화면, 휴식·청음 |
| `bg-practice.png` | 320×180 | 개인 연습·실전 연습 |
| `bg-lesson.png` | 320×180 | 입시 레슨 |

캐릭터가 **화면 왼쪽 1/3**에 서므로 그 자리는 비워 두고, 위쪽 왼편에 날짜 표시가 올라간다.

**bg-title.png**
```
Side view of a small opera concert hall stage, deep red velvet curtains half-open,
golden proscenium arch, warm spotlight on an empty wooden stage floor,
large empty space in the upper half for a game logo, empty stage (no people),
4:3 composition, [공통 규칙]
```

**bg-room.png**
```
Interior of a Korean high school senior's small bedroom at evening, side view like a
life-sim game room, single bed on the right, desk with sheet music and a lamp,
window with city night view, posters of opera singers on the wall,
empty floor space on the left third for a character to stand, 16:9, [공통 규칙]
```

**bg-practice.png**
```
Small school music practice room, side view, upright piano against the wall,
music stand with sheet music, mirror, soundproof wall panels, fluorescent light,
empty floor space on the left third for a character to stand, 16:9, [공통 규칙]
```

**bg-lesson.png**
```
Elegant private vocal lesson studio, side view, black grand piano on the right,
bookshelf with scores, framed concert photos, warm wooden floor and soft lamp light,
empty floor space on the left third for a character to stand, 16:9, [공통 규칙]
```

## 2. 레슨 선생님 얼굴 (1장)

| 파일 | 크기 |
|---|---|
| `teacher.png` | 64×64, 배경은 하늘색(#63b6e6) 또는 투명 |

```
Pixel art face portrait (bust) of a Korean female vocal teacher in her 40s,
kind but strict expression, short permed hair, glasses, cardigan,
RPG dialogue portrait, front view, [공통 규칙]
```

## 3. 행동 카드 아이콘 (6장)

모두 **32×32, 투명 배경**, 같은 스타일로 한 번에 뽑으면 좋다:
```
Set of 6 game item icons in a row, 32x32 each, transparent background:
1) sheet music with a treble clef, 2) vintage stage microphone,
3) vocal teacher pointing at a piano, 4) open book with music notes,
5) bed with a pillow and "Zz", 6) piano keys with a small star,
[공통 규칙]
```
| 파일 | 카드 |
|---|---|
| `icon-practice.png` | 개인 연습 (악보) |
| `icon-stage.png` | 실전 연습 (마이크) |
| `icon-lesson.png` | 입시 레슨 (선생님) |
| `icon-theory.png` | 청음·시창 (책) |
| `icon-rest.png` | 휴식 (침대) |
| `icon-backup.png` | 예비 반주자 섭외 (피아노) |

## 4. 2등신 SD 주인공 (성부 3명 × 포즈 4장 = 12장)

**64×64, 투명 배경, 전신, 오른쪽을 살짝 바라보는 3/4 측면.** 고3이므로 무대 의상이 아니라 **교복이나 사복**.

| 파일 | 포즈 |
|---|---|
| `sd-{성부}-idle.png` | 가만히 서 있기 (기본) |
| `sd-{성부}-sing.png` | 입 벌리고 한 손을 들어 노래 |
| `sd-{성부}-rest.png` | 하품하거나 기지개 |
| `sd-{성부}-sick.png` | 마스크를 쓰고 목을 감싼 모습 (목이 쉬었을 때) |

`{성부}` 자리에는 `soprano`, `tenor`, `baritone`.

**soprano**
```
Chibi 2-head-tall pixel art sprite of a Korean high school girl, long black hair with
a red flower hairpin, school uniform with red ribbon, full body, 3/4 view facing right,
[포즈], transparent background, 64x64 game sprite, [공통 규칙]
```
**tenor**
```
Chibi 2-head-tall pixel art sprite of a Korean high school boy, fluffy brown hair,
bright eager expression, school uniform blazer, full body, 3/4 view facing right,
[포즈], transparent background, 64x64 game sprite, [공통 규칙]
```
**baritone**
```
Chibi 2-head-tall pixel art sprite of a tall calm Korean high school boy, wavy black hair,
school uniform with loosened tie, full body, 3/4 view facing right,
[포즈], transparent background, 64x64 game sprite, [공통 규칙]
```
`[포즈]` 자리에 넣을 말:
- idle: `standing relaxed, hands at sides`
- sing: `singing with mouth open, one hand raised expressively`
- rest: `yawning and stretching arms`
- sick: `wearing a white face mask, holding throat, tired eyes`

---

## 우선순위 추천

1. `bg-room.png`: 가장 자주 보이는 화면
2. `sd-{내 성부}-idle.png`: 내가 고른 주인공 1장
3. 행동 아이콘 6장
4. `teacher.png`
5. 나머지 배경과 포즈
