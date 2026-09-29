# TypeScript 스택 지침

이 문서는 TypeScript 관련 코드 작업 시 준수하는 스택 지침이다. `_template.md` 양식을 그대로 따른다.

## 개요

이 스택은 결혼준비 개인 대시보드 웹앱(웨딩 플래너 MVP) 전체에 쓴다. PRD가 정의한 8개 화면(대시보드, 예산, 업체, 견적 비교, 견적 상세, 계약, 체크리스트, 문서)과 REST API, 총액 계산 엔진을 Next.js 단일 앱으로 구현한다. 화면과 서버를 한 언어로 담는 선택은, 1인 MVP에서 서버를 따로 두는 것보다 빠르고 나중에 분리도 가능하다는 계획 판단에 따른 것이다.

이 문서가 다루는 범위는 TypeScript, Next.js(App Router), Prisma, Tailwind CSS, Vitest다. 테스트·에러 처리 같은 공통 규칙은 `principles/` 문서를 따르되, 이 문서가 해당 스택에 맞게 세부화한 내용이 있다면 이 문서가 우선한다.

## 버전·도구체인

- 언어·런타임: TypeScript 6.0.3(스테이블), Node.js 24 LTS(문서 작성 시점 v24.13.0) — typescript-eslint 8.x 호환 (eslint-config-next가 TS 7에서 하드 에러)
- 패키지 매니저: npm 11.6.2. yarn, pnpm, bun은 쓰지 않는다.
- 프레임워크·주요 라이브러리:
  - Next.js 16.3.7 (App Router)
  - Tailwind CSS 4.3.3
  - Prisma 7.x(스테이블 최신 7.10.0 기준). npm latest 태그가 8.0.0-rc를 가리키고 있어도 프로젝트는 7.x 스테이블에 고정한다.
  - Vitest 5.0.2 (jsdom 환경)
  - ESLint(create-next-app이 설치하는 flat config), Prettier, prettier-plugin-tailwindcss
- 버전 고정 수단: `package.json`과 `package-lock.json`을 커밋해 고정한다. lock 파일이 실제 설치 버전을 결정한다.
- 위 버전은 문서 작성 시점의 스테이블 기준이다. 패키지를 추가할 때는 그 시점의 스테이블 최신을 쓰고, major 점프는 의존성 관리 규칙을 따른다.

## 프로젝트 구조 규약

디렉토리 배치는 계획 문서가 확정한 App Router 레이아웃을 따른다.

- `src/app/`: 라우트(페이지). 한국어 UI이므로 루트 레이아웃의 `<html lang="ko">`를 유지한다.
- `src/app/api/`: REST API route handlers.
- `src/lib/domain/`: 순수 도메인 함수(총액 계산, 비교 집계, 참가격 매칭 등). Prisma와 Next.js를 임포트하지 않는다.
- `src/lib/adapters/`: 외부 연동(Kakao 검색, 문서 저장소). 서버 전용.
- `src/lib/constants/`: 표준 항목 코드(`item-codes.ts`), 예산·체크리스트 템플릿(`templates.ts`).
- `src/lib/auth/`: 세션 서명, requireUser·requireProjectOwner 가드.
- `src/components/`: 여러 화면에서 재쓰는 공용 UI 컴포넌트.
- `prisma/`: `schema.prisma`, `seed.ts`, 마이그레이션 파일.
- `scripts/`: 실행용 CLI 스크립트(참가격 CSV 임포트 등).
- `docs/`: 지침, PRD, ERD, 로드맵 문서.

신규 파일 배치 규칙:

- 테스트는 대상 코드와 같은 계층의 `__tests__/` 디렉토리에 둔다(예: `src/lib/domain/__tests__/totals.test.ts`).
- import 경로는 `@/*` 앨리어스를 쓴다.
- 도메인 로직을 page나 route handler에 인라인으로 두지 않고 `src/lib/domain/`으로 뺀다.
- 시크릿과 서버 전용 모듈은 클라이언트 번들에 들어가지 않는 위치에 둔다.

## 네이밍 표기 규칙

- 파일·디렉토리: kebab-case (예: `item-codes.ts`, `import-benchmarks.ts`)
- 컴포넌트·타입·클래스: PascalCase (예: `QuoteCompareTable`)
- 함수·변수: camelCase (예: `calcTotals`)
- 상수: UPPER_SNAKE_CASE (예: `HALL_RENTAL`, `SESSION_SECRET`)
- 테스트 파일: `*.test.ts`
- Prisma 모델과 컬럼명은 스키마에서 정한 규약을 따른다.

## 포맷·린트 도구와 설정

- 포맷터: Prettier. `prettier-plugin-tailwindcss`로 Tailwind 클래스 순서를 정렬한다. 설정 파일은 저장소 루트에 둔다.
- 린터: ESLint. create-next-app이 설치하는 flat config를 기준으로 한다.
- 타입 검사: `npx tsc --noEmit`. strict 모드 오류가 0이어야 한다.
- 린트 실행: `npm run lint`
- 공용 게이트: 모든 PR squash-merge 전에 `npm run lint && npx tsc --noEmit && npm test`가 전부 통과해야 한다.

## 테스트 프레임워크와 실행 명령

- 프레임워크: Vitest 5 (jsdom 환경, `vitest.config.ts`).
- 위치·네이밍: 대상 코드와 같은 계층의 `__tests__/*.test.ts`.
- 전체 실행: `npm test`
- 단일 실행: `npx vitest run <경로>`
- 필수 단위테스트 대상(테스트 없이 머지 금지): 총액 계산 엔진, 견적 비교 집계와 누락 감지, 참가격 매칭, 인가 가드, 예산 템플릿 생성, 시드 멱등성.
- API 라우트는 happy-path 위주의 선택 테스트를 허용하고, UI는 수동 QA 스크립트로 검증한다.

## 빌드·실행 명령

- 사전 조건: MySQL이 docker-compose로 떠 있어야 하고, `.env`가 준비돼 있어야 한다(`.env.example` 참고).
- `npm run db:up`: docker compose up -d로 MySQL 8 기동
- `npm run db:migrate`: prisma migrate dev
- `npx prisma db seed`: 시드. 멱등하게 작성되므로 재실행해도 행이 늘지 않는다.
- `npm run dev`: 개발 서버 실행
- `npm run build` / `npm start`: 프로덕션 빌드와 실행
- `npm run import:benchmarks -- <csv>`: 참가격 CSV 임포트 CLI

## 의존성 관리 규칙

- 추가: `npm install <패키지>`. 런타임 의존성은 용도를 PR 설명에 남기고, 같은 일을 하는 라이브러리가 이미 있으면 추가하지 않는다.
- 상태 관리 라이브러리 같은 새 범주의 도입은 계획에 명시된 것이 아니면 사용자에게 묻는다.
- 제거: `npm uninstall <패키지>`. 쓰지 않는 의존성을 남겨두지 않는다.
- 업데이트: `npm outdated`로 확인 후 필요한 것만 올린다. major 업그레이드는 변경 내용 확인 후 별도 PR로 진행한다.
- 금지: yarn·pnpm 등 다른 매니저 혼용, `package-lock.json` 수동 편집, lock 파일 없이 커밋.

## 언어 특화 안티패턴

이 스택에서 반복해서 나오는 금지 패턴이다. 위반하면 리뷰에서 막는다.

- 금액에 Float·Double·Decimal 쓰기 금지. 금액은 Int(원, KRW, 부호 있음)만 쓴다. Prisma 스키마와 계산 로직 모두에 적용한다.
- `any` 타입 금지. 모를 때는 `unknown`으로 받고 타입 가드로 좁힌다.
- `tsconfig`의 strict 모드를 끄거나 완화하는 금지. 컴파일러 옵션으로 타입 오류를 숨기지 않는다.
- Vitest 외 테스트 프레임워크(Jest 등) 도입 금지.
- 도메인 함수에 Prisma·Next.js 의존 넣기 금지. 총액 계산 결과를 DB에 저장하지 않고 조회 시점마다 계산한다.
- 총액 계산 엔진 규칙(최소총액, 옵션포함총액, 1인당비용, DISCOUNT 부호 정규화)을 임의로 바꾸지 않는다. 규칙 변경은 계획 수정과 사용자 확인을 거친다.
- 클라이언트 컴포넌트에서 Kakao API나 외부 어댑터를 직접 호출하는 금지. 외부 연동은 서버 어댑터 경유로만 하고, API 키는 응답에 노출하지 않는다.
- API 경계에서 날짜를 자유 형식으로 주고받지 않는다. 날짜는 ISO 8601 문자열로 직렬화한다.
