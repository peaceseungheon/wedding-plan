# UI 디자인 지침

이 문서는 화면(UI)을 만들거나 고치는 작업이 디자인 시스템을 따르도록 하는 작업 규칙을 정의한다. 시각 기준 자체(색, 타이포, 컴포넌트, 금지 패턴)는 저장소 루트의 [DESIGN.md](../../../DESIGN.md)에 있고, 제품 맥락(사용자, 목적, 원칙)은 [PRODUCT.md](../../../PRODUCT.md)에 있다. 이 문서는 그 두 문서를 언제 읽고, 어떻게 지키고, 언제 갱신하는지를 다룬다.

## 1. 작업 전

- 규칙: UI 코드를 작성하기 전에 DESIGN.md를 읽는다. 새 화면이나 새 흐름을 만들 때는 PRODUCT.md도 읽는다.
- 왜: 토큰, 컴포넌트, 금지 패턴이 DESIGN.md 한곳에 모여 있다. 읽지 않고 만들면 이미 있는 컴포넌트를 다시 만들거나 금지된 패턴을 쓰게 된다.
- 좋은 예: 예산 화면 개편 전에 DESIGN.md의 Components Catalog와 Status Tone Mapping을 확인하고 `Stat`, `Badge`, `budgetTone`을 쓴다.
- 나쁜 예: 기존 화면의 클래스를 복사해 새 화면을 만든다.

- 규칙: 새 컴포넌트를 만들기 전에 `src/components/ui/`에 쓸 수 있는 컴포넌트가 있는지 확인한다.
- 왜: 같은 버튼과 카드가 화면마다 다르게 생기는 것이 디자인 시스템 도입 전의 핵심 문제였다.
- 좋은 예: 링크를 버튼 모양으로 그릴 때 `buttonClass("secondary", "sm")`를 쓴다.
- 나쁜 예: `<Link className="rounded-lg border px-3 ...">`처럼 버튼 스타일을 인라인으로 다시 만든다.

## 2. 작성 중

- 규칙: 색은 DESIGN.md의 토큰 유틸리티(`bg-canvas`, `text-ink-muted`, `border-line` 등)만 쓴다. Tailwind 기본 팔레트(`zinc-*`, `red-*`, `blue-*`, `green-*`, `amber-*`, `emerald-*`)와 임의 색상값(`text-[#...]`)은 쓰지 않는다.
- 왜: 기본 팔레트를 직접 쓰면 위계와 상태 구분이 화면마다 달라지고, 색 대비 검증과 이후 테마 변경이 토큰 한곳에서 끝나지 않는다.
- 좋은 예: `<p role="alert" className="text-sm text-negative">`
- 나쁜 예: `<p className="text-sm text-red-600">`

- 규칙: 상태 톤 판정은 `src/lib/domain/tone.ts`의 함수와 상수만 쓰고, 상태색에는 기호(✓ ! ▲)나 문구를 함께 쓴다.
- 왜: 임계값(90%, +20%)이 화면마다 하드코딩되면 같은 금액이 화면마다 다른 색으로 보인다. 색만으로 상태를 전달하면 색각 이상 사용자가 의미를 놓친다.
- 좋은 예: `<Badge tone={budgetTone(used, planned)}>! 예산의 98%</Badge>`
- 나쁜 예: `className={ratio > 0.9 ? "text-caution" : "text-positive"}`

- 규칙: 금액 표기는 요약 숫자에 `formatManwon`, 표·목록에 `formatKRW`를 쓰고, 금액과 날짜에는 `tabular-nums`를 붙인다.
- 왜: 요약은 빠르게 읽혀야 하고 표는 정확해야 한다. 고정폭 숫자가 아니면 표의 금액 자릿수가 세로로 맞지 않는다.
- 좋은 예: 요약 카드 `formatManwon(12_400_000)` → `1,240만원`, 비교표 셀 `formatKRW(amount)`
- 나쁜 예: 화면에서 `(n / 10000).toFixed(0) + "만원"`처럼 직접 변환한다.

## 3. 검증

- 규칙: 개편하거나 새로 만든 화면은 1280px과 360px에서 직접 확인하고, 스크린샷을 `docs/design/qa/<단계>-<화면>-<폭>.png`로 남긴다.
- 왜: TypeScript 스택 지침대로 UI는 자동 테스트가 아니라 수동 QA로 검증한다. 360px에서만 드러나는 넘침, 줄바꿈, sticky 겹침 같은 결함이 실제로 있었다.
- 좋은 예: `docs/design/qa/3-budget-1280.png`, `docs/design/qa/3-budget-360.png`
- 나쁜 예: 데스크톱에서만 확인하고 PR을 연다.

- 규칙: PR 전에 변경 범위에서 원색 클래스가 0건인지 확인한다.
- 왜: 기본 팔레트 직접 사용은 리뷰에서 눈으로 찾기 어렵다. 명령 한 줄로 확인할 수 있다.
- 좋은 예: `grep -rnE '(zinc|red|blue|green|amber|emerald)-[0-9]' <변경한 파일>` 결과가 없다.
- 나쁜 예: 리뷰어가 찾아 주기를 기대한다.

## 4. 문서 갱신

- 규칙: 토큰 값, 컴포넌트 API, 톤 규칙을 바꾸거나 컴포넌트를 추가하면 같은 PR에서 DESIGN.md를 갱신한다. 색을 추가하거나 바꾸면 대비를 측정해 Contrast 표에 기록하고, AA(4.5:1)에 미달하면 쓰지 않는다.
- 왜: DESIGN.md가 코드와 어긋나면 다음 작업자가 틀린 기준을 따른다. 문서가 기준 역할을 하려면 코드와 함께 바뀌어야 한다.
- 좋은 예: `DataTable`을 추출한 PR이 Components Catalog에 행을 추가하고 "아직 만들지 않은 것"에서 지운다.
- 나쁜 예: 새 배지 톤을 추가하고 문서는 나중에 고치기로 한다.

- 규칙: DESIGN.md를 크게 고쳤다면 `.impeccable/design.json`도 함께 다시 생성한다. impeccable 스킬을 쓰면 `/impeccable document`로 둘을 함께 갱신할 수 있다.
- 왜: 사이드카는 DESIGN.md의 서술과 컴포넌트 예시를 그대로 옮긴 파일이라, 따로 두면 둘이 어긋난다.
- 좋은 예: 포인트 컬러를 바꾼 PR에 DESIGN.md와 `.impeccable/design.json` 변경이 함께 있다.
- 나쁜 예: DESIGN.md만 고치고 사이드카에는 옛 색이 남는다.

- 규칙: DESIGN.md에 없는 시각 결정(새 색, 새 서체, 새 그림자, 새 컴포넌트 유형)이 필요하면 임의로 정하지 않고 사용자에게 묻는다.
- 왜: 한 화면에서 정한 예외는 다음 화면에 그대로 복사되어 시스템을 조용히 흔든다.
- 좋은 예: 차트가 필요해지면 라이브러리와 색 규칙을 먼저 질의하고, 결과를 DESIGN.md에 반영한 뒤 구현한다.
- 나쁜 예: 차트 라이브러리를 설치하고 기본 색으로 그린다.
