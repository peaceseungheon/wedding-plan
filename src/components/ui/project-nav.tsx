"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 인덱스 페이지가 있는 화면만 탭으로 둔다. 견적 비교·계약은 다른 화면에서 진입한다. */
const NAV_ITEMS = [
  { label: "대시보드", segment: "" },
  { label: "예산", segment: "/budget" },
  { label: "업체", segment: "/vendors" },
  { label: "할 일", segment: "/tasks" },
  { label: "문서", segment: "/documents" },
] as const;

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  return (
    <nav aria-label="프로젝트 메뉴" className="flex flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
      {NAV_ITEMS.map(({ label, segment }) => {
        const href = `${base}${segment}`;
        const active = segment === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
              active ? "bg-accent-soft font-semibold text-accent" : "text-ink-muted hover:text-ink"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
