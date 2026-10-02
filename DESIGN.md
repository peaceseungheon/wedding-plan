---
name: 우리의 결혼준비
description: 예비부부가 받은 견적을 같은 기준으로 놓고 결정하는 차분한 결혼 준비 장부
colors:
  canvas: "#faf7f2"
  surface: "#ffffff"
  line: "#ece6dd"
  line-strong: "#d9d0c3"
  ink: "#2a2420"
  ink-muted: "#6b625a"
  ink-subtle: "#787069"
  accent: "#4e6b58"
  accent-soft: "#e6eee8"
  positive: "#3b6ea5"
  positive-soft: "#e6eef7"
  caution: "#986313"
  caution-soft: "#fbf0dc"
  negative: "#b3402f"
  negative-soft: "#f9e4e0"
  info: "#6a5d8c"
  info-soft: "#eeebf4"
  neutral-soft: "#f1ece5"
typography:
  display:
    fontFamily: "Noto Serif KR, serif"
    fontSize: "44px"
    fontWeight: 600
    lineHeight: 1
  headline:
    fontFamily: "Noto Serif KR, serif"
    fontSize: "28px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  stat:
    fontFamily: "Pretendard Variable, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    letterSpacing: "-0.025em"
    fontFeature: "tnum"
  title:
    fontFamily: "Pretendard Variable, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
  body:
    fontFamily: "Pretendard Variable, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  label:
    fontFamily: "Pretendard Variable, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  caption:
    fontFamily: "Pretendard Variable, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
rounded:
  control: "8px"
  card: "12px"
  pill: "9999px"
spacing:
  section: "32px"
  card-gap: "16px"
  card-gap-mobile: "12px"
  card-inset: "20px"
  gutter: "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.canvas}"
  button-ghost:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-ghost-hover:
    backgroundColor: "{colors.neutral-soft}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.negative}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  button-sm:
    padding: "0 12px"
    height: "32px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-inset}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  nav-tab:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  nav-tab-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  badge-positive:
    backgroundColor: "{colors.positive-soft}"
    textColor: "{colors.positive}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-caution:
    backgroundColor: "{colors.caution-soft}"
    textColor: "{colors.caution}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-negative:
    backgroundColor: "{colors.negative-soft}"
    textColor: "{colors.negative}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-neutral:
    backgroundColor: "{colors.neutral-soft}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  progress-track:
    backgroundColor: "{colors.line}"
    rounded: "{rounded.pill}"
    height: "8px"
---

# Design System: 우리의 결혼준비

## Overview

**Creative North Star: "The Wedding Ledger (웨딩 장부)"**

이 시스템은 잘 정리된 장부다. 아이보리 종이 위에 견적 금액, 합계, 결제 회차가 가지런히 정렬되어 있고, 읽는 사람은 장식이 아니라 숫자를 믿는다. 화면의 주인공은 항상 결정 근거가 되는 숫자 하나다. 대시보드에서는 D-Day와 예산 요약, 견적 비교에서는 옵션 포함 총액이 그 숫자다.

웨딩의 감성은 장부의 표지에만 남는다. 아이보리 바탕, 세리프 제목과 D-Day, 그리고 Deep Garden Sage 포인트 컬러 하나다. 본문과 표는 Pretendard로 단정하게 짜고, 금액은 모두 고정폭 숫자로 세로 정렬한다. 구분은 그림자보다 괘선(테두리)과 바탕색 차이로 한다.

밀도는 중간이다. 데스크톱에서 견적표를 펼쳐 비교하는 장면이 기준이고, 같은 화면이 360px 모바일에서도 깨지지 않는다. 라이트 테마 전용이며, 다크 테마는 토큰 구조만 열어 두었다.

**Key Characteristics:**
- 아이보리 바탕 위 흰 카드, 얇은 괘선으로 구획
- 세리프는 페이지 제목, D-Day, 브랜드 세 자리에만
- 포인트 컬러는 주요 액션 하나와 현재 위치 표시에만
- 상태는 색과 기호(✓ ! ▲) 또는 텍스트를 함께 써서 전달
- 모든 금액과 날짜는 고정폭 숫자(tabular-nums)

## Colors

따뜻한 종이와 호두색 잉크 위에 정원의 세이지 한 방울을 떨어뜨린 팔레트다. 모든 글자·상태색 조합은 해당 배경에서 WCAG AA(4.5:1)를 넘는다.

### Primary
- **Deep Garden Sage** (`accent`): primary 버튼, 활성 탭, D-Day, 브랜드명의 강조 단어. 화면마다 손에 꼽을 만큼만 쓴다.
- **Sage Wash** (`accent-soft`): 활성 탭 배경과 입력창 포커스 링. 세이지가 글자로 올라갈 때의 바탕이다.

### Secondary
상태 전용 색이다. 각 색에는 같은 계열의 옅은 바탕(`*-soft`)이 짝으로 있고, 배지는 이 둘을 함께 쓴다.
- **Ledger Blue** (`positive` / `positive-soft`): 예산 이내, 항목별 최저가, 최저 총액, 지역 평균 이하. 포인트가 초록이라 "양호"를 일부러 파랑으로 두었다.
- **Amber Seal** (`caution` / `caution-soft`): 예산 90% 이상, 지역 평균 대비 +20% 이하, 마감 임박.
- **Brick Red** (`negative` / `negative-soft`): 예산 초과, 지역 평균 대비 +20% 초과, 에러, 삭제.
- **Dusk Violet** (`info` / `info-soft`): 상담 예정 같은 중립 상태.

### Neutral
- **Ledger Ivory** (`canvas`): 페이지 바탕. 순백보다 한 톤 따뜻한 종이색이다.
- **Clean Sheet** (`surface`): 카드, 표, 입력창.
- **Ruled Line** (`line`): 카드 테두리, 목록 행 구분선, 진행 바 트랙.
- **Total Rule** (`line-strong`): 표 헤더 하단, 합계 행 상단, secondary 버튼과 입력창 테두리. 장부의 합계선처럼 한 단계 진하다.
- **Walnut Ink** (`ink`): 본문, 제목, 금액.
- **Faded Walnut** (`ink-muted`): 라벨, 보조 설명, 표의 항목명.
- **Pencil Note** (`ink-subtle`): 캡션, 메타, 날짜 보조 정보.
- **Linen** (`neutral-soft`): 중립 배지("미정", "없음") 바탕, ghost 버튼 hover.

### Named Rules
**The One Sage Rule.** 포인트 컬러는 주요 액션 하나와 현재 위치 표시에만 쓴다. 강조가 필요하면 굵기와 크기로 해결한다.

**The Color-Plus-Sign Rule.** 상태색은 절대 혼자 오지 않는다. 배지에는 기호(✓ ! ▲)나 문구를 넣고, 글자색 강조(최저가의 파란 굵은 금액)에는 범례를 단다.

**The No Raw Palette Rule.** 화면 코드는 Tailwind 기본 팔레트(`zinc-*`, `red-*` 등)를 쓰지 않는다. 위 토큰만 쓴다.

## Typography

**Display Font:** Noto Serif KR 500·600 (with serif)
**Body Font:** Pretendard Variable (with system-ui, sans-serif). 저장소에 포함해 로드한다.

**Character:** 세리프는 장부 표지의 제목처럼 격식을 더하고, Pretendard는 본문과 숫자를 담백하고 또렷하게 읽히게 한다. 두 서체의 대비가 "감성은 정해진 자리에만"을 글자로 보여준다.

### Hierarchy
- **Display** (serif 600, 44px, 모바일 36px, line-height 1): D-Day 전용.
- **Headline** (serif 600, 28px, 모바일 24px, tracking -0.025em, text-balance): 페이지 제목.
- **Stat** (700, 26px, 모바일 22px, tracking -0.025em, 고정폭 숫자): 요약 카드의 금액. 만원 단위로 표기한다(`1,240만원`).
- **Title** (600, 16px): 카드 제목. 페이지 안 섹션 제목은 18px.
- **Body** (400, 15px): 본문 기본 크기. body에 지정되어 있다.
- **Label** (400–500, 13–14px): 표, 목록, 폼 라벨, 메타.
- **Caption** (400–600, 12px): 배지, 범례, 힌트.

### Named Rules
**The Three Serif Seats Rule.** 세리프는 페이지 제목, D-Day, 브랜드 세 자리에만 앉는다. 카드 제목이나 숫자에는 쓰지 않는다.

**The Tabular Money Rule.** 금액과 날짜는 모두 고정폭 숫자로 쓴다. 표와 목록은 원 단위 정확 표기(`12,400,000원`), 요약 숫자만 만원 단위다.

**The No Eyebrow Rule.** 제목 위에 작은 보조 라벨을 두지 않는다. 제목이 스스로 위계를 갖고, 보조 정보는 제목 아래 메타 줄에 둔다.

## Layout

콘텐츠 폭은 최대 1080px이고 좌우 여백은 16px다. 페이지는 상단 바(높이 56px, 흰 바탕, 하단 괘선) 아래에 위 32px·아래 64px 여백으로 시작한다. 섹션 사이는 32px, 카드 사이는 16px(모바일 12px), 카드 안쪽은 20px다. 간격은 Tailwind 기본 4px 단위를 따른다.

화면 구성은 "핵심 숫자 → 근거 → 상세 → 설정" 순서다. 요약 숫자 카드 3칸이 위에 오고, 그 아래 2열 그리드(대시보드는 1.4fr : 1fr, `lg` 이상), 더 아래에 목록과 폼이 온다. 모바일에서는 모두 1열로 쌓인다.

표는 래퍼에서 가로 스크롤한다. 첫 열(항목명)은 sticky로 고정하고 바탕을 흰색으로 덮는다. 숫자 열은 우측 정렬한다. 탭 내비도 모바일에서는 가로 스크롤하며 스크롤바는 숨긴다.

### Named Rules
**The 360 Rule.** 360px 폭에서 페이지 가로 넘침이 없어야 한다. 넘치는 것은 표와 탭뿐이고, 둘 다 자기 래퍼 안에서 스크롤한다.

## Elevation & Depth

거의 평평한 시스템이다. 깊이는 아이보리 바탕과 흰 카드의 명도 차이, 그리고 괘선으로 만든다. 그림자는 카드에만 아주 옅게 한 단계 쓴다. 존재감보다는 종이가 바탕에서 살짝 떠 있는 정도다. hover나 포커스로 그림자가 커지지 않는다.

### Shadow Vocabulary
- **Sheet lift** (`box-shadow: 0 1px 2px rgb(42 36 32 / 0.04)`): 모든 카드. 다른 요소에는 쓰지 않는다.

### Named Rules
**The Ruled Not Raised Rule.** 구획이 필요하면 그림자를 키우지 말고 괘선(`line`, `line-strong`)이나 바탕색으로 나눈다.

## Shapes

모서리는 부드럽지만 둥글지 않다. 버튼·입력·탭 같은 컨트롤은 8px, 카드는 12px, 배지와 진행 바는 완전히 둥글다. 테두리는 1px 단색만 쓰고, 한쪽에만 두꺼운 색 테두리를 두는 장식은 쓰지 않는다. 카드 안에 카드를 겹치지 않는다.

## Components

컴포넌트는 절제되고 단정하다. 상태 변화는 색과 바탕만 바뀌고, 크기나 위치는 움직이지 않는다. 위치는 `src/components/ui/`다.

### Buttons
- **Shape:** 컨트롤 모서리(8px), 높이 40px(md) 또는 32px(sm), 글자 600.
- **Primary:** Deep Garden Sage 바탕에 흰 글자. 화면당 한 개가 원칙이다.
- **Secondary:** 흰 바탕, Total Rule 테두리, Walnut Ink 글자. hover 시 Ledger Ivory 바탕.
- **Ghost:** 바탕 없이 Faded Walnut 글자. hover 시 Linen 바탕과 Walnut Ink 글자.
- **Danger:** Brick Red 바탕에 흰 글자. 삭제처럼 되돌릴 수 없는 액션에만 쓴다.
- **Hover / Focus:** 채운 버튼은 hover 시 바탕이 90% 불투명도로 옅어진다. 키보드 포커스는 2px 세이지 외곽선(offset 2px). disabled는 50% 불투명도.
- 링크를 버튼 모양으로 그릴 때도 같은 클래스(`buttonClass`)를 쓴다.

### Badges
- **Style:** 완전히 둥근 알약, 12px 600, 고정폭 숫자, 좌우 8px. 바탕은 상태색의 옅은 바탕, 글자는 상태색.
- **Tones:** positive, caution, negative, info, neutral. neutral은 Linen 바탕에 Faded Walnut 글자다.
- **Content:** 항상 기호나 문구를 포함한다(`✓ 남은 예산 970만원`, `! 예산의 98%`, `▲ 120만원 초과`, `평균 대비 +4.0%`, `미정`, `없음`).

### Cards / Containers
- **Corner Style:** 12px
- **Background:** Clean Sheet
- **Shadow Strategy:** Sheet lift 한 단계(Elevation 참고)
- **Border:** Ruled Line 1px
- **Internal Padding:** 20px
- **Header:** 제목(16px 600)과 오른쪽 "더보기 →" 링크(13px, Faded Walnut, hover 시 세이지). 제목과 내용 사이 16px.

### Stat (요약 숫자 카드)
카드 안에 라벨(13px Faded Walnut), Stat 크기 금액, 그 아래 배지·보조 문구·진행 바를 세로로 쌓는다. 시스템의 대표 컴포넌트이며 화면의 핵심 숫자를 담는다.

### Progress
높이 8px, 완전히 둥근 트랙(Ruled Line) 위에 채움 막대. 톤은 positive, caution, negative, accent, neutral 중 하나이고, 비율은 0–100%로 잘라 그린다. 항상 접근성 라벨을 붙인다.

### Inputs / Fields
- **Style:** 흰 바탕, Total Rule 1px 테두리, 8px 모서리, 높이 40px, 14px 글자. placeholder는 Pencil Note.
- **Focus:** 테두리가 세이지로 바뀌고 Sage Wash 2px 링이 생긴다.
- **Label:** 입력 위에 14px 500 라벨, 아래에 12px Pencil Note 힌트. 라벨이 입력 요소를 감싼다.
- **Error:** 폼 아래 Brick Red 14px 문구, `role="alert"`.

### Navigation
- **Top bar:** 흰 바탕, 높이 56px, 하단 Ruled Line. 왼쪽에 세리프 브랜드명("우리의 **결혼준비**", 뒷단어만 세이지).
- **Tabs:** 14px, 8px 모서리, 좌우 12px. 기본은 Faded Walnut, hover는 Walnut Ink, 현재 위치는 Sage Wash 바탕에 세이지 600 글자와 `aria-current="page"`.
- **Mobile:** 탭 줄이 가로 스크롤된다.

### Date Chip (다가오는 결제)
44px 폭의 테두리 상자에 일(16px 굵게)과 월(11px Pencil Note)을 위아래로 쌓는다. 결제 행의 왼쪽 기준점이다.

### Comparison Table (견적 비교)
헤더 하단과 합계 행 상단은 Total Rule, 일반 행은 Ruled Line으로 나눈다. 업체 열은 우측 정렬하고, 항목별 최저가는 Ledger Blue 굵은 글자로, 없는 항목은 neutral 배지로 표시한다. 표 아래에 색 의미와 출처(한국소비자원 참가격) 범례를 단다.

## Do's and Don'ts

### Do:
- **Do** 화면마다 결정 근거가 되는 숫자 하나를 첫 화면 위쪽에 Stat 크기(26px 700)로 둔다.
- **Do** 상태색에는 항상 기호(✓ ! ▲)나 문구를 함께 쓴다.
- **Do** 상태 톤 판정은 `src/lib/domain/tone.ts`의 함수와 임계값(90%, +20%)만 쓴다.
- **Do** 금액과 날짜는 고정폭 숫자로 쓰고, 요약은 `formatManwon`, 표·목록은 `formatKRW`로 표기한다.
- **Do** 구획은 괘선(Ruled Line 1px, 합계는 Total Rule)과 바탕색으로 나눈다.
- **Do** 새 화면은 360px와 1280px에서 함께 확인한다.

### Don't:
- **Don't** Tailwind 기본 팔레트(`zinc-*`, `red-*`, `blue-*`, `green-*`, `amber-*`)를 화면 코드에 쓰지 않는다.
- **Don't** 세리프를 페이지 제목, D-Day, 브랜드 밖에서 쓰지 않는다.
- **Don't** 포인트 컬러를 장식, 아이콘, 일반 링크, 상태 표시에 쓰지 않는다. "양호"는 Ledger Blue다.
- **Don't** 제목 위에 작은 보조 라벨(eyebrow)을 두지 않는다.
- **Don't** 카드 그림자를 키우거나 카드 안에 카드를 겹치지 않는다.
- **Don't** 한쪽에만 두꺼운 색 테두리를 두는 강조 카드나 알림을 만들지 않는다.
- **Don't** 다크 테마 값을 화면에서 임의로 정의하지 않는다. 필요해지면 토큰을 재정의한다.
