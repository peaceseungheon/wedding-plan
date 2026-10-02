import type { ReactNode } from "react";
import Link from "next/link";

/** 섹션 컨테이너. title을 주면 카드 상단에 제목과 action 슬롯을 그린다. */
export function Card({
  title,
  action,
  className = "",
  children,
}: {
  title?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgb(42_36_32/0.04)] ${className}`}>
      {title !== undefined && (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

/** 카드 제목 옆 "더보기 →" 링크. */
export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[13px] text-ink-muted hover:text-accent">
      {children} →
    </Link>
  );
}
