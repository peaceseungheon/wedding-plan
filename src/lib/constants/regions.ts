// 프로젝트 지역 선택 어휘. 참가격 매칭(matchBenchmark)이 region 문자열 완전 일치를
// 사용하므로 price_benchmarks 소스(price.go.kr)의 지역명과 정확히 같은 문자열만 담는다.
// 전국/수도권/비수도권은 통계 집계 구분이라 선택 어휘에서 제외한다(DB에는 남고 무해).
export const REGION_OPTIONS = [
  "서울(강남)",
  "서울(강남외)",
  "부산",
  "대구",
  "인천",
  "전남광주",
  "대전",
  "울산",
  "경기도",
  "강원도",
  "충청도",
  "전북",
  "경상도",
  "제주도",
] as const;

export type RegionOption = (typeof REGION_OPTIONS)[number];

// 드롭다운 이전에 자유 텍스트로 저장된 레거시 값 판별용.
export function isRegionOption(value: string): boolean {
  return (REGION_OPTIONS as readonly string[]).includes(value);
}
