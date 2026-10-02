import type { ReactNode } from "react";

/** 페이지 제목 영역. 제목은 세리프, aside는 오른쪽(모바일에서는 아래)에 붙는다. */
export function PageHeader({ title, meta, aside }: { title: string; meta?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-balance sm:text-[28px]">{title}</h1>
        {meta !== undefined && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-muted">{meta}</div>
        )}
      </div>
      {aside}
    </header>
  );
}
