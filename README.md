# wedding-plan

결혼 준비에 흩어지는 일을 하나로 모으는 대시보드 웹 앱이다. 예산, 업체, 견적 비교, 계약·결제, 체크리스트, 문서 관리를 단일 Next.js 앱에서 처리한다. 핵심은 견적 비교다. 여러 업체의 견적을 한 화면에 나란히 놓고 공공 참가격(price.go.kr 공표 평균) 대비 ±%를 항목별로 보여줘 어느 견적이 유리한지 판단하게 돕는다.

## 사전 요구

- Node.js LTS. 이 저장소는 Node 24에서 개발하고 검증했다.
- Docker. MySQL 8을 docker compose로 띄운다.

## 시작하기

```bash
git clone https://github.com/peaceseungheon/wedding-plan.git
cd wedding-plan
cp .env.example .env   # 아래 표를 보고 값을 채운다
docker compose up -d
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

브라우저에서 http://localhost:3000 을 연다.

`.env`에 채울 값은 `.env.example`에 주석과 함께 정리돼 있다.

| 키 | 설명 |
| --- | --- |
| DATABASE_URL | MySQL 접속 문자열. 포트는 아래 안내대로 3307 |
| SESSION_SECRET | 세션 서명용 시크릿. `openssl rand -base64 32`로 생성 |
| KAKAO_API_KEY | 선택. 카카오 로컬 검색 API 키. 없으면 업체 수동 등록으로 대체 |
| UPLOAD_DIR | 업로드 문서 저장 디렉터리. 기본값 `storage/uploads` |

**포트 3307 안내**: docker compose는 MySQL을 `127.0.0.1:3307`로 노출한다(컨테이너 내부는 3306 그대로). 호스트의 3306은 네이티브 MySQL이 이미 점유하고 있는 머신이 많아, DATABASE_URL의 포트를 3307로 맞춰야 연결된다. `.env.example`에 이미 반영돼 있다.

**팁**: Prisma 7은 `migrate dev` 뒤 클라이언트 타입을 자동 생성하지 않는다. 새 클론에서 타입 오류가 보이면 `npx prisma generate`를 한 번 실행하면 된다.

`docker compose up -d`와 `npx prisma migrate dev`는 각각 `npm run db:up`, `npm run db:migrate` 단축 스크립트로도 실행할 수 있다.

개발 중 검증은 `npm run lint`와 `npm run test`로 한다.

## 참가격 임포트 가이드

견적 화면의 "지역 평균 대비 ±%"는 price_benchmarks 테이블의 참가격 데이터에서 나온다. [price.go.kr](https://price.go.kr)에서 지역별 평균가격 자료를 CSV로 내려받아 아래 포맷으로 정리한 뒤 임포트한다. 저장소에는 예제 파일 `data/sample-benchmarks.csv`가 들어 있다.

CSV는 헤더를 포함하며 컬럼 순서는 다음과 같다.

| 컬럼 | 의미 |
| --- | --- |
| region | 지역명 (예: 서울) |
| category | 카테고리 (예: 웨딩홀, 스드메) |
| itemCode | 표준 항목 코드. 비워도 허용되며, 빈 값 행은 그 카테고리의 대표행이 된다 |
| avgPrice | 평균 가격(원) |
| sampleSize | 표본 수 |
| sourcePeriod | 조사 시기 (예: 2026-H1) |

```csv
region,category,itemCode,avgPrice,sampleSize,sourcePeriod
서울,웨딩홀,,32000000,120,2026-H1
서울,웨딩홀,HALL_RENTAL,4000000,95,2026-H1
```

임포트 실행:

```bash
npm run import:benchmarks -- data/sample-benchmarks.csv
```

동작 특성은 두 가지다. 파싱에 실패한 행은 건너뛰고 나머지를 계속 처리하며(fail-soft), 같은 region·category·itemCode·sourcePeriod 조합은 upsert 되므로 같은 파일을 여러 번 실행해도 중복 행이 생기지 않는다.

## 기능 안내

| 화면 | 경로 | 설명 |
| --- | --- | --- |
| 홈 | `/` | 프로젝트 목록과 생성. 생성 시 예산 8카테고리·체크리스트 12항목이 자동으로 만들어진다 |
| 로그인/회원가입 | `/login` | 이메일과 비밀번호로 가입·로그인한다 |
| 대시보드 | `/projects/{id}` | 예산 총액, 계약·완납 현황, 다가오는 결제, 체크리스트 진행률, D-Day |
| 예산 | `/projects/{id}/budget` | 카테고리별 계획 금액 관리 |
| 업체 | `/projects/{id}/vendors` | 카카오 장소 검색으로 등록. API 키가 없으면 수동 등록으로 대체 |
| 견적 상세 | `/projects/{id}/quotes/{quoteId}` | 항목 입력, 총액 3종(최소·옵션포함·1인당), 지역 평균 대비, 확정 |
| 견적 비교 | `/projects/{id}/quotes/compare` | 여러 견적을 항목별로 대조. 한쪽에 없는 항목은 '없음' 표시 |
| 계약·결제 | `/projects/{id}/contracts/{contractId}` | 견적을 계약으로 전환하고 계약금·중도금·잔금 결제를 관리 |
| 체크리스트 | `/projects/{id}/tasks` | 템플릿 12항목. 예식일을 설정하면 마감일이 임박순으로 정렬된다 |
| 문서 | `/projects/{id}/documents` | 파일 업로드와 다운로드. 로컬 디스크에 저장된다 |

## 비-MVP 로드맵

MVP 범위 밖의 확장 계획은 [비-MVP 백로그](docs/ROADMAP-non-mvp.md)에 정리돼 있다.
