# 결혼 준비 웹서비스 — MVP 기획 · 기술설계

한국 결혼 준비 데이터를 활용한 개인 의사결정 도구 설계

작성일  2026-09-28  
문서 상태  v0.1 / 개발 착수용

**문서 목표**

예산·업체·견적·일정·계약 정보를 한곳에 모아, “무엇을 언제 얼마에 결정해야 하는가”를 빠르게 판단할 수 있는 개인용 웹서비스의 1차 설계를 정의한다.

## 목차

- [1. Executive Summary](#1-executive-summary)
- [2. 제품 범위와 원칙](#2-제품-범위와-원칙)
- [3. 결혼 준비 전체 프로세스 분해](#3-결혼-준비-전체-프로세스-분해)
- [4. 활용 API · 데이터 소스 맵](#4-활용-api--데이터-소스-맵)
  - [4.1 확인된 핵심 데이터 포인트](#41-확인된-핵심-데이터-포인트)
- [5. MVP 기능 정의](#5-mvp-기능-정의)
- [6. 핵심 사용자 플로우](#6-핵심-사용자-플로우)
  - [6.1 첫 설정](#61-첫-설정)
  - [6.2 웨딩홀 비교](#62-웨딩홀-비교)
  - [6.3 AI 견적서 분석](#63-ai-견적서-분석)
- [7. 주요 화면 구성](#7-주요-화면-구성)
- [8. DB 스키마 초안](#8-db-스키마-초안)
- [9. 백엔드 REST API 초안](#9-백엔드-rest-api-초안)
- [10. AI 견적서 분석 구조](#10-ai-견적서-분석-구조)
  - [10.1 추출 스키마 예시](#101-추출-스키마-예시)
  - [10.2 표준 항목 체계](#102-표준-항목-체계)
- [11. 권장 기술 아키텍처](#11-권장-기술-아키텍처)
- [12. 개발 로드맵](#12-개발-로드맵)
- [13. 주요 리스크와 대응](#13-주요-리스크와-대응)
- [14. 바로 다음 개발 단계](#14-바로-다음-개발-단계)
- [15. 참고 데이터·공식 문서](#15-참고-데이터공식-문서)

## 1. Executive Summary

결혼 준비의 어려움은 정보가 없어서가 아니라 정보가 흩어져 있고, 비교 단위가 제각각이며, 최초 견적과 실제 지출이 다르다는 점에 있다. 따라서 MVP의 핵심은 업체 검색 자체가 아니라 “견적을 구조화하고 비교 가능한 상태로 만드는 것”이다.

| 핵심 문제 | MVP 해결책 | 가치 |
| --- | --- | --- |
| 예산이 어디서 초과되는지 모름 | 카테고리별 예산·실지출·예정지출 통합 | 총액과 초과요인을 즉시 파악 |
| 웨딩홀·스드메 견적 항목이 제각각 | 견적 항목 표준화 + 옵션/필수비용 분리 | 사과-사과 비교 가능 |
| 평균 가격 감이 없음 | 한국소비자원 참가격을 기준선으로 표시 | 지역/시기 대비 가격 수준 파악 |
| 계약/결제 일정 누락 | 계약금·중도금·잔금·취소조건 관리 | 돈과 일정 리스크 감소 |
| 견적서 읽기 번거로움 | 2차 단계에서 AI 견적서 추출 | 수기 입력 비용 축소 |

**MVP 한 줄 정의**

“웨딩홀/스드메 견적을 등록하면 총비용·숨은 추가비용·지역 평균 대비 수준을 비교하고, 계약·결제 일정까지 관리하는 개인용 결혼 준비 대시보드.”

## 2. 제품 범위와 원칙

- 1차 목표: 개인 사용자가 실제 결혼 준비에 바로 쓸 수 있는 도구. 업체 중개/예약 플랫폼은 아님.
- 가격 정확성: 외부 평균값보다 사용자가 받은 실제 견적을 최우선 데이터로 취급.
- 자동화 우선순위: AI보다 데이터 구조와 비교 로직을 먼저 안정화.
- 출처 구분: 공개 API, 파일형 공공데이터, 사용자 입력, 향후 제휴 데이터를 명확히 분리.
- 확장성: 신혼집·혼수·신혼여행은 코어 MVP 이후 모듈로 확장.

## 3. 결혼 준비 전체 프로세스 분해

| 단계 | 주요 결정 | 관리할 데이터 | 서비스 기능 |
| --- | --- | --- | --- |
| 0. 초기 설정 | 예식 예정일, 지역, 총예산, 하객 규모 | 목표예산, 일정, 지역, 인원 | 프로젝트 생성/기본설정 |
| 1. 웨딩홀 | 지역, 날짜, 식대, 보증인원, 대관료 | 업체, 홀, 견적, 식대, 보증인원, 옵션 | 검색/후보저장/견적비교 |
| 2. 스드메 | 패키지/개별, 추가금, 헬퍼, 원본 | 스튜디오/드레스/메이크업 항목 | 견적비교/옵션관리 |
| 3. 예복·예물·한복 | 브랜드, 수량, 대여/구매 | 업체, 품목, 견적, 결제일 | 예산·지출관리 |
| 4. 본식 준비 | 사진, 영상, 사회, 축가, 청첩장 | 업체/업무/마감일 | 체크리스트/결제일 |
| 5. 신혼여행 | 지역, 일정, 항공, 숙박, 액티비티 | 여행일정, 예약금액 | 확장 모듈 |
| 6. 혼수/가전 | 구매순서, 배송일, 가격 | 품목, 가격, 배송일 | 확장 모듈 |
| 7. 신혼집 | 매매/전세/월세, 지역, 대출 | 실거래가, 보증금, 대출 | 확장 모듈 |
| 8. 최종 정산 | 잔금, 추가금, 실지출 | 결제내역, 최종금액 | 예산 vs 실제 분석 |

## 4. 활용 API · 데이터 소스 맵

| 소스 | 형태 | 활용 | MVP 우선순위 | 비고 |
| --- | --- | --- | --- | --- |
| 한국소비자원 참가격 - 결혼서비스 | 웹/CSV/Excel | 지역·시기별 예식장/스드메 가격 기준선 | A | REST API보다는 파일/웹 데이터 활용 관점 |
| Kakao Local API | REST | 웨딩홀/스튜디오/드레스/메이크업 장소 검색 | A | 이름·주소·좌표·카테고리 확보 |
| Kakao Map / Mobility 관련 API | REST | 지도 표시·접근성 보조 | B | 실제 사용 가능 API/쿼터는 개발 시 재확인 |
| 공공데이터포털/공유누리 | OpenAPI/파일 | 공공예식장 후보 수집 | B | 기관별 데이터 구조 차이 존재 |
| 국토부 부동산 실거래가 | REST(XML) | 신혼집 지역 가격 분석 | C | 코어 MVP 이후 |
| 한국관광공사 TourAPI | REST | 국내 신혼여행 관광/숙박 후보 | C | 코어 MVP 이후 |
| 사용자 견적/계약서 | PDF/이미지/수기 | 실제 가격, 옵션, 계약조건 | A+ | 서비스의 가장 중요한 데이터 |

**데이터 전략**

외부 데이터는 “정답”이 아니라 기준선이다. 실제 의사결정은 사용자가 받은 견적과 계약조건을 중심으로 하고, 공공데이터는 평균/참고값·장소·부동산 등 보조 정보로 사용한다.

### 4.1 확인된 핵심 데이터 포인트

- 한국소비자원 참가격 결혼서비스는 지역별 및 예식 시기별 가격 정보를 제공하며 CSV/Excel 다운로드 기능을 제공한다.
- 참가격의 시기별 화면은 예식장과 스드메의 계약금액 및 표본 정보를 보여주므로, 가격 기준선 테이블을 주기적으로 적재하기 적합하다.
- 국토교통부 아파트 매매 실거래가 OpenAPI는 법정동 코드와 계약년월로 조회하는 REST/XML 형태다.
- Kakao Local API는 키워드 기반 장소검색을 제공하므로 업체 마스터 데이터의 초기 입력 자동화에 적합하다.

## 5. MVP 기능 정의

| Epic | MVP 기능 | 우선순위 | 완료 기준 |
| --- | --- | --- | --- |
| 프로젝트 | 결혼 프로젝트 생성/수정, 예식일/예산/지역 | P0 | 프로젝트 대시보드 진입 가능 |
| 예산 | 카테고리별 목표 예산, 예상/확정/결제 금액 | P0 | 총예산 잔액과 초과액 계산 |
| 업체 | 업체 검색/수기등록, 후보 저장 | P0 | 웨딩홀·스드메 후보 리스트 관리 |
| 견적 | 견적 등록, 항목/옵션/필수 여부 관리 | P0 | 2개 이상 견적을 동일 화면 비교 |
| 가격 기준 | 참가격 기준선 저장 및 비교 | P1 | 지역/시기 기준 편차 표시 |
| 계약 | 선택 업체 계약 상태 및 계약금/잔금 | P0 | 계약/납부 상태 추적 |
| 일정 | 체크리스트, 마감일, 결제 예정일 | P1 | 향후 30일 할 일 표시 |
| 문서 | 견적서/계약서 파일 첨부 | P1 | 원본 파일과 견적 연결 |
| AI 추출 | PDF/이미지 → 초안 항목 추출 | P2 | 사용자 검토 후 확정 저장 |

## 6. 핵심 사용자 플로우

### 6.1 첫 설정

1. 새 결혼 프로젝트 생성
2. 예식 예정일, 희망 지역, 예상 하객, 총예산 입력
3. 예산 카테고리 템플릿 자동 생성
4. 대시보드에서 D-Day, 총예산, 남은 결정사항 확인

### 6.2 웨딩홀 비교

1. 지역/키워드로 웨딩홀 검색 또는 직접 등록
2. 후보 업체에 받은 견적 추가
3. 대관료, 식대×보증인원, 꽃장식, 본식촬영, 필수 옵션을 항목별 입력
4. “최소 예상 총액 / 선택 옵션 포함 총액 / 1인당 비용” 자동 계산
5. 참가격 지역·시기 기준선과 비교
6. 선택 업체를 계약 상태로 변경하고 결제 일정 생성

### 6.3 AI 견적서 분석

1. PDF 또는 이미지 업로드
2. OCR/문서 파싱 → 업체명, 날짜, 항목, 금액, 계약조건 추출
3. 표준 항목 코드에 자동 매핑하고 신뢰도 표시
4. 사용자가 누락/오인식 항목 검토
5. 확정 버튼 후 정식 견적으로 저장

**중요 설계 원칙**

AI가 추출한 값은 바로 재무 데이터로 확정하지 않는다. 반드시 draft 상태로 보관하고 사용자 확인 이후 confirmed 상태로 승격한다.

## 7. 주요 화면 구성

| 화면 | 핵심 컴포넌트 | 주요 행동 |
| --- | --- | --- |
| Dashboard | D-Day, 예산 게이지, 계약현황, 다음 할 일, 결제예정 | 오늘 무엇을 해야 하는지 확인 |
| Budget | 카테고리별 목표/예상/확정/결제금액 | 예산 조정, 초과항목 확인 |
| Vendors | 카테고리 탭, 지역 검색, 후보 상태 | 업체 추가/즐겨찾기 |
| Quote Compare | 업체별 컬럼 + 표준 항목 행 | 비용·조건 비교 |
| Quote Detail | 견적 항목, 옵션, 메모, 원본파일 | 견적 수정/확정 |
| Contract | 계약 상태, 취소조건, 결제 스케줄 | 계약/잔금 관리 |
| Tasks | 체크리스트, 마감일, 카테고리 | 할 일 완료 처리 |
| Documents | 견적서/계약서 파일, AI 분석 상태 | 문서 업로드/검토 |

## 8. DB 스키마 초안

| 테이블 | 핵심 컬럼 | 역할 |
| --- | --- | --- |
| users | id, email, name | 사용자 |
| wedding_projects | id, user_id, title, wedding_date, region_code, guest_count, target_budget | 결혼 프로젝트 |
| budget_categories | id, project_id, code, name, target_amount | 예산 카테고리 |
| vendors | id, category, name, address, lat, lng, external_place_id | 업체 마스터 |
| project_vendors | id, project_id, vendor_id, status, memo | 프로젝트별 후보/계약 상태 |
| quotes | id, project_id, vendor_id, quote_date, status, base_amount, expected_total | 견적 헤더 |
| quote_items | id, quote_id, item_code, raw_name, qty, unit_price, amount, required, selected | 견적 상세 |
| contracts | id, project_id, vendor_id, quote_id, signed_at, cancellation_terms | 계약 정보 |
| payments | id, project_id, contract_id, type, due_date, amount, paid_at | 결제 예정/완료 |
| tasks | id, project_id, category, title, due_date, status | 체크리스트 |
| documents | id, project_id, vendor_id, type, file_url, ai_status | 문서 원본 |
| document_extractions | id, document_id, schema_version, raw_json, confidence, status | AI 추출 초안 |
| price_benchmarks | id, source, region, wedding_month, category, metric, amount, sample_count | 외부 가격 기준선 |

## 9. 백엔드 REST API 초안

| Method | Endpoint | 설명 |
| --- | --- | --- |
| POST | /api/projects | 프로젝트 생성 |
| GET | /api/projects/{id}/dashboard | 대시보드 요약 |
| GET/PUT | /api/projects/{id}/budget | 예산 조회/수정 |
| GET | /api/vendors/search?category=&q=&region= | 업체 검색 |
| POST | /api/projects/{id}/vendors | 후보 업체 추가 |
| POST | /api/projects/{id}/quotes | 견적 생성 |
| PUT | /api/quotes/{quoteId} | 견적 헤더 수정 |
| POST/PUT | /api/quotes/{quoteId}/items | 견적 항목 추가/수정 |
| GET | /api/projects/{id}/quotes/compare | 견적 비교 데이터 |
| POST | /api/projects/{id}/contracts | 계약 생성 |
| POST/PUT | /api/contracts/{id}/payments | 결제일정 관리 |
| GET/POST | /api/projects/{id}/tasks | 체크리스트 조회/생성 |
| POST | /api/projects/{id}/documents | 문서 업로드 |
| POST | /api/documents/{id}/extract | AI 분석 시작 |
| POST | /api/documents/{id}/confirm | AI 추출 결과 확정 |
| GET | /api/benchmarks?region=&month=&category= | 가격 기준 조회 |

## 10. AI 견적서 분석 구조

### 10.1 추출 스키마 예시

문서 → JSON draft 예시

```json
{
  "vendor": {"name": "A웨딩홀", "category": "WEDDING_HALL"},
  "quoteDate": "2026-09-28",
  "items": [
    {"rawName": "대관료", "standardCode": "HALL_RENTAL", "amount": 4000000, "required": true},
    {"rawName": "식대", "standardCode": "MEAL", "unitPrice": 72000, "qty": 250, "amount": 18000000}
  ],
  "terms": {
    "guaranteedGuests": 250,
    "deposit": 2000000,
    "cancellationText": "..."
  },
  "confidence": 0.91
}
```

### 10.2 표준 항목 체계

| 카테고리 | 표준 코드 예시 | 설명 |
| --- | --- | --- |
| 웨딩홀 | HALL_RENTAL, MEAL, FLOWER, BEVERAGE, CEREMONY_PHOTO | 대관/식대/장식/음료/본식 |
| 스튜디오 | STUDIO_BASE, ORIGINAL_FILE, ALBUM_EXTRA | 기본 촬영/원본/앨범 추가 |
| 드레스 | DRESS_BASE, DRESS_UPGRADE, HELPER | 기본/업그레이드/헬퍼 |
| 메이크업 | MAKEUP_BASE, MAKEUP_EXTRA_PERSON | 신랑신부/혼주 등 |
| 공통 | DISCOUNT, VAT, DELIVERY, ETC | 할인/세금/배송/기타 |

## 11. 권장 기술 아키텍처

**기본 구성**

Frontend: React/Next.js 또는 Vue/Nuxt · Backend: Spring Boot · DB: MySQL · Object Storage: S3 · Batch: Spring Batch/스케줄러 · AI: 문서 파싱 + LLM 구조화 · External: Kakao/공공데이터

| 영역 | 권장 설계 | 이유 |
| --- | --- | --- |
| Frontend | SPA/SSR + 반응형 | 모바일에서 견적/체크리스트를 자주 확인 |
| Backend | Spring Boot REST API | 도메인·거래·권한 로직 집중 |
| DB | MySQL | 견적/결제/업체 관계형 데이터에 적합 |
| 파일 | S3 + DB metadata | 견적서/계약서 원본 보관 |
| 외부데이터 | adapter 계층 | Kakao/공공데이터 변경을 도메인과 분리 |
| 배치 | benchmark import job | 참가격 파일/외부 기준 데이터 주기 적재 |
| AI | 비동기 job + draft JSON | 문서 분석이 느려도 사용자 흐름 분리 가능 |

## 12. 개발 로드맵

| Sprint | 범위 | 산출물 |
| --- | --- | --- |
| 0 | 도메인 확정 / 샘플 견적 2~3개 수집 | 표준 항목 코드, ERD v1 |
| 1 | 프로젝트/예산/업체/견적 CRUD | 수기입력 가능한 MVP 골격 |
| 2 | 견적 비교/총액 계산/계약·결제 | 실사용 가능한 코어 |
| 3 | Kakao 검색 + 참가격 기준선 import | 외부 데이터 결합 |
| 4 | 체크리스트/문서 첨부/대시보드 | 운영 편의 |
| 5 | AI 견적서 draft 추출 | 업로드→검토→확정 |
| 6 | 신혼집/여행/혼수 확장 검토 | 모듈화된 확장 |

## 13. 주요 리스크와 대응

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| 웨딩 업체 가격의 비공개/수시변동 | 자동 가격비교 한계 | 사용자 실제 견적을 1차 데이터로 사용 |
| 공공데이터 포맷 변경 | 배치 실패 | source adapter + raw snapshot 보관 |
| AI 금액 오인식 | 잘못된 의사결정 | draft/confirmed 분리 + 필수 사용자 검증 |
| 옵션·할인 조건 복잡성 | 총액 계산 오류 | quote_item에 required/selected/discount type 명시 |
| 문서 개인정보 | 보안 리스크 | 접근제어, 암호화, 보관기간/삭제 정책 |
| 외부 API 쿼터/정책 | 검색 장애 | 캐시 + 수기입력 fallback |

## 14. 바로 다음 개발 단계

1. 실제 받은 웨딩홀 또는 스드메 견적서 2~3개를 기준으로 quote/quote_item 구조 검증
2. ERD를 확정하고 MySQL DDL 작성
3. Spring Boot 도메인/Repository/API skeleton 구현
4. 견적 비교 화면 와이어프레임 구현
5. 참가격 benchmark import 규격 설계
6. 이후 AI 견적 추출을 붙여 수기 입력을 대체

**가장 먼저 검증할 것**

“서로 다른 웨딩홀 견적서 2개를 이 데이터 모델에 넣었을 때 누락 없이 비교 가능한가?” 이 질문에 Yes가 나오면 AI와 외부 데이터 연동으로 넘어간다.

## 15. 참고 데이터·공식 문서

- [한국소비자원 참가격 - 결혼서비스 통계정보](https://www.price.go.kr/tprice/portal/wedding/areaStatistic.do)

- [한국소비자원 참가격 - 시기별 가격정보](https://www.price.go.kr/tprice/portal/wedding/areaStatisticDetailByPeriod.do)

- [Kakao Developers - Local API](https://developers.kakao.com/docs/latest/ko/local/dev-guide)

- [공공데이터포털 - 국토교통부 아파트 매매 실거래가](https://www.data.go.kr/data/15126469/openapi.do)

- [한국관광공사 TourAPI](https://api.visitkorea.or.kr/)

- [공유누리](https://www.eshare.go.kr/)

주의: 외부 API의 이용약관, 호출 한도, 데이터 재배포 가능 범위는 실제 구현 시점에 각 제공기관의 최신 정책을 다시 확인해야 한다.
