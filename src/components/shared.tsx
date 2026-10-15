"use client";

import { ArrowDown, ArrowUp, Lightbulb } from "lucide-react";
import { TOP_N } from "@/lib/analytics";
import { fmtCount, fmtMoney, fmtWon } from "@/lib/format";
import type { Insight } from "@/lib/insights";
import type { Dataset, ProductStat } from "@/lib/types";
import { Badge, Card, CardTitle } from "./ui";

export function InsightPanel({
  insights,
  onSelectProduct,
}: {
  insights: Insight[];
  onSelectProduct?: (p: number) => void;
}) {
  return (
    <Card>
      <CardTitle title="확인해볼 지점" note="탐지 조건에 걸린 항목을 제안합니다. 판단은 회의에서 확인해 주십시오." />
      {insights.length === 0 ? (
        <p className="text-sm text-muted-foreground">이번 범위에서는 탐지 조건에 걸린 항목이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {insights.map((x, i) => (
            <li key={i} className="flex gap-2.5">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={x.kind === "기회 발견" ? "info" : "critical"}>{x.kind}</Badge>
                  {x.product !== undefined && onSelectProduct && (
                    <button
                      onClick={() => onSelectProduct(x.product!)}
                      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      원인 분석 보기
                    </button>
                  )}
                </div>
                <p className="text-sm leading-relaxed">{x.text}</p>
                <p className="text-xs text-muted-foreground">근거: {x.basis}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RankChange({ prev, cur }: { prev: number | undefined; cur: number }) {
  if (prev === undefined) return <Badge tone="critical">신규</Badge>;
  const d = prev - cur;
  if (d === 0) return <span className="text-xs text-muted-foreground">–</span>;
  const Icon = d > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center text-xs tabular ${d > 0 ? "text-delta-bad" : "text-delta-good"}`}>
      <Icon className="size-3" aria-hidden />
      {Math.abs(d)}
    </span>
  );
}

export function TopTable({
  ds,
  stats,
  prevRank,
  prevLabel,
  onSelectProduct,
  compact = false,
}: {
  ds: Dataset;
  stats: ProductStat[];
  prevRank: Map<number, number>;
  prevLabel: string;
  onSelectProduct: (p: number) => void;
  compact?: boolean;
}) {
  const top = stats.filter((x) => x.rank > 0 && x.rank <= TOP_N);
  if (!top.length) return <p className="text-sm text-muted-foreground">순위를 매길 품목이 없습니다 (최소 표본 미달).</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="py-2 pr-2 font-medium">순위</th>
            <th className="py-2 pr-2 font-medium">{prevLabel}</th>
            <th className="py-2 pr-2 font-medium">품목</th>
            {!compact && <th className="py-2 pr-2 font-medium">제품군</th>}
            <th className="py-2 pr-2 text-right font-medium">건수</th>
            <th className="py-2 pr-2 text-right font-medium">비용</th>
            {!compact && <th className="py-2 pr-2 text-right font-medium">건당 비용</th>}
            <th className="py-2 font-medium">주요 증상</th>
          </tr>
        </thead>
        <tbody>
          {top.map((x) => {
            const [code, name, group] = ds.products[x.p];
            return (
              <tr
                key={x.p}
                onClick={() => onSelectProduct(x.p)}
                className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted"
                title="클릭하면 품목 원인 분석으로 이동"
              >
                <td className="py-2 pr-2 font-semibold tabular">{x.rank}</td>
                <td className="py-2 pr-2">
                  <RankChange prev={prevRank.get(x.p)} cur={x.rank} />
                </td>
                <td className="py-2 pr-2">
                  <div className="font-medium">{code}</div>
                  <div className="text-xs text-muted-foreground">{name}</div>
                </td>
                {!compact && <td className="py-2 pr-2 text-xs">{group}</td>}
                <td className="py-2 pr-2 text-right tabular">{fmtCount(x.cases)}</td>
                <td className="py-2 pr-2 text-right tabular">{fmtMoney(x.cost)}</td>
                {!compact && <td className="py-2 pr-2 text-right tabular">{fmtWon(x.unitCost)}</td>}
                <td className="py-2 text-xs">{x.topSymptom !== null ? ds.symptoms[x.topSymptom] : "–"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function rankMap(stats: ProductStat[]): Map<number, number> {
  return new Map(stats.filter((x) => x.rank > 0).map((x) => [x.p, x.rank]));
}
