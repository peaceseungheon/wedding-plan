import type { ReactNode } from "react";
import Link from "next/link";

/** 상단 바. 서비스명은 브랜드 작업 전까지 임시 문구다(DESIGN.md Rollout). */
export function AppShell({ nav, children }: { nav?: ReactNode; children: ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[1080px] items-center gap-4 px-4 sm:gap-6">
          <Link href="/" className="whitespace-nowrap font-serif text-base font-semibold sm:text-[17px]">
            우리의 <span className="text-accent">결혼준비</span>
          </Link>
          {nav}
        </div>
      </header>
      {children}
    </>
  );
}
