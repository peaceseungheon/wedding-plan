import type { ReactNode } from "react";
import { Card } from "./card";

/** 요약 숫자 카드. children에는 배지·보조 문구·Progress를 세로로 쌓는다. */
export function Stat({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <Card>
      <p className="text-[13px] text-ink-muted">{label}</p>
      <p className="mt-1 text-[22px] font-bold tracking-tight tabular-nums sm:text-[26px]">{value}</p>
      {children ? <div className="mt-2 flex flex-col items-start gap-3 text-[13px]">{children}</div> : null}
    </Card>
  );
}
