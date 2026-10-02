import type { Tone } from "@/lib/domain/tone";

type ProgressTone = Tone | "accent";

const BAR_CLASS: Record<ProgressTone, string> = {
  positive: "bg-positive",
  caution: "bg-caution",
  negative: "bg-negative",
  info: "bg-info",
  neutral: "bg-ink-subtle",
  accent: "bg-accent",
};

/** 비율 바. value는 0~1 비율이며 범위를 넘으면 잘라서 그린다. */
export function Progress({ value, tone, label }: { value: number; tone: ProgressTone; label: string }) {
  const percent = Math.min(100, Math.max(0, Math.round(value * 100)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-2 w-full overflow-hidden rounded-full bg-line"
    >
      <div className={`h-full rounded-full ${BAR_CLASS[tone]}`} style={{ width: `${percent}%` }} />
    </div>
  );
}
