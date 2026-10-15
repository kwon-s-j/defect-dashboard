"use client";

import { clsx, type ClassValue } from "clsx";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { fmtPct } from "@/lib/format";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-xl border border-border bg-card p-4 shadow-sm", className)}>{children}</section>;
}

export function CardTitle({ title, note, right }: { title: string; note?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      </div>
      {right}
    </div>
  );
}

/** 증감 표시. 비용·건수는 증가 = 악화(빨강) */
export function Delta({ rate, label, upIsBad = true }: { rate: number | null; label: string; upIsBad?: boolean }) {
  if (rate === null) return <span className="text-xs text-muted-foreground">{label} 비교 불가</span>;
  const flat = Math.abs(rate) < 0.005;
  const bad = !flat && (rate > 0) === upIsBad;
  const Icon = flat ? Minus : rate > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs tabular", flat ? "text-muted-foreground" : bad ? "text-delta-bad" : "text-delta-good")}>
      <Icon className="size-3.5" aria-hidden />
      {label} {rate > 0 ? "+" : ""}
      {fmtPct(rate)}
    </span>
  );
}

export function Kpi({
  label,
  value,
  children,
  source,
}: {
  label: string;
  value: React.ReactNode;
  children?: React.ReactNode;
  source: string;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
      <div className="flex flex-col gap-0.5">{children}</div>
      <span className="mt-auto pt-2 text-[11px] text-muted-foreground">{source}</span>
    </Card>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

export function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "critical" | "info" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        tone === "neutral" && "border-border bg-muted text-muted-foreground",
        tone === "critical" && "border-critical/30 bg-critical/10 text-delta-bad",
        tone === "info" && "border-series-1/30 bg-series-1/10 text-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function Tooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <Info className="size-3.5 text-muted-foreground" aria-label={text} />
      <span className="pointer-events-none absolute left-1/2 top-5 z-20 hidden w-64 -translate-x-1/2 rounded-md border border-border bg-card p-2 text-[11px] font-normal leading-relaxed text-foreground shadow-md group-hover:block">
        {text}
      </span>
    </span>
  );
}

export interface ChartColors {
  series1: string;
  series2: string;
  neutral: string;
  grid: string;
  axis: string;
  text: string;
  muted: string;
  surface: string;
  critical: string;
  seqLow: string;
  seqHigh: string;
}

function readColors(): ChartColors {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    series1: v("--series-1"),
    series2: v("--series-2"),
    neutral: v("--series-neutral"),
    grid: v("--chart-grid"),
    axis: v("--chart-axis"),
    text: v("--foreground"),
    muted: v("--muted-foreground"),
    surface: v("--chart-surface"),
    critical: v("--status-critical"),
    seqLow: v("--seq-100"),
    seqHigh: v("--seq-700"),
  };
}

const FALLBACK: ChartColors = {
  series1: "#2a78d6",
  series2: "#eb6834",
  neutral: "#b8bec8",
  grid: "#e2e8f0",
  axis: "#94a3b8",
  text: "#0f172a",
  muted: "#64748b",
  surface: "#ffffff",
  critical: "#d03b3b",
  seqLow: "#cde2fb",
  seqHigh: "#0d366b",
};

/** SVG 속성에 CSS 변수를 직접 쓸 수 없어 계산된 값을 읽는다 (다크 모드 전환 반영) */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(FALLBACK);
  useEffect(() => {
    const update = () => setColors(readColors());
    update();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return colors;
}

/** 두 hex 색 사이 보간 (순차 색 램프) */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const x = (pa >> shift) & 255;
    const y = (pb >> shift) & 255;
    return Math.round(x + (y - x) * t);
  };
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

export function ChartTooltipBox({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{title}</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 tabular">
          <span className="text-muted-foreground">{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}
