/**
 * 예식일 경계 파싱과 체크리스트 마감일 계산. 도메인 계층 규칙(typescript.md)에 따라
 * Prisma·Next.js를 임포트하지 않는 순수 함수만 둔다.
 */

const WEDDING_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * API 경계의 "YYYY-MM-DD" 문자열을 UTC 자정 Date로 파싱한다.
 * 형식 위반·실존하지 않는 날짜(2026-02-30 등)는 null로 반환하고,
 * 호출부(라우트)가 이를 400 응답으로 바꾼다.
 */
export function parseWeddingDate(raw: string): Date | null {
  if (!WEDDING_DATE_PATTERN.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  // Date 생성자는 2026-02-30을 3월 2일로 조용히 정규화하므로 왕복 대조로 걸러낸다.
  if (date.toISOString().slice(0, 10) !== raw) return null;
  return date;
}

/**
 * 예식일에서 dueOffsetMonths만큼 이전 날짜(UTC 기준). 월말 로울오버는 JS Date
 * 정규화를 따른다(예: 2026-01-31 −1개월 → 2026-03-03). dueOffsetMonths는
 * CHECKLIST_TEMPLATE 상수라 0..6 범위가 보장된다.
 */
export function taskDueDate(weddingDate: Date, dueOffsetMonths: number): Date {
  const due = new Date(weddingDate);
  due.setUTCMonth(due.getUTCMonth() - dueOffsetMonths);
  return due;
}
