import type { ReactNode } from "react";
import type { Tone } from "@/lib/domain/tone";

const TONE_CLASS: Record<Tone, string> = {
  positive: "bg-positive-soft text-positive",
  caution: "bg-caution-soft text-caution",
  negative: "bg-negative-soft text-negative",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-ink-muted",
};

/** 상태 배지. 색만으로 의미를 전달하지 않도록 children에 기호(✓ ! ▲)나 텍스트를 함께 넣는다. */
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}
