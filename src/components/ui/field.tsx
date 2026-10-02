import type { ReactNode } from "react";

/** input·select 공통 클래스. */
export const inputClass =
  "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft";

/** 라벨로 입력 요소를 감싼다. hint는 라벨 아래 보조 설명이다. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
      {hint !== undefined && <span className="text-xs font-normal text-ink-subtle">{hint}</span>}
    </label>
  );
}
