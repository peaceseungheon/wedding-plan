import type { ReactNode } from "react";

/**
 * 표 클래스 규칙(DESIGN.md Comparison Table에서 추출). 헤더 하단·합계 상단은 line-strong,
 * 일반 행은 line, 숫자 열은 우측 정렬. 첫 열 고정이 필요하면 thClass/tdClass 뒤에 stickyCellClass를 붙인다.
 */
export const thClass = "px-3 py-2.5 text-left align-bottom text-[13px] font-medium text-ink-muted first:pl-0 last:pr-0";
export const tdClass = "px-3 py-2.5 align-middle first:pl-0 last:pr-0";
export const numClass = "whitespace-nowrap text-right tabular-nums";
export const headRowClass = "border-b border-line-strong";
export const rowClass = "border-b border-line";
export const totalRowClass = "border-t border-line-strong";
export const stickyCellClass = "sticky left-0 z-10 bg-surface";

/** 가로 스크롤 래퍼 + 표. minWidth는 360px에서 표가 찌그러지지 않을 최소 폭이다. */
export function DataTable({ minWidth = 560, children }: { minWidth?: number; children: ReactNode }) {
  return (
    // relative: sr-only 헤더 같은 absolute 자식이 래퍼를 벗어나 페이지를 넓히지 않게 한다.
    <div className="relative overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}
