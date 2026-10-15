"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MIN_CASES, TOP_N, WEIGHT_CASES, WEIGHT_COST, median, previousRange, productLabel, productStats, rangeOf, scopeOf } from "@/lib/analytics";
import { changeRate, fmtCount, fmtMoney, fmtPct, fmtWeek, fmtWon } from "@/lib/format";
import { selectionInsights } from "@/lib/insights";
import type { Dataset, Filters, ProductStat } from "@/lib/types";
import { InsightPanel, TopTable, rankMap } from "./shared";
import { Card, CardTitle, ChartTooltipBox, Delta, Kpi, Tooltip as InfoTip, useChartColors } from "./ui";

function topShare(stats: ProductStat[]) {
  const total = stats.reduce((a, x) => a + x.cost, 0);
  const top = stats.filter((x) => x.rank > 0 && x.rank <= TOP_N).reduce((a, x) => a + x.cost, 0);
  return total ? top / total : 0;
}

export function SelectionView({ ds, f, onSelectProduct }: { ds: Dataset; f: Filters; onSelectProduct: (p: number) => void }) {
  const colors = useChartColors();

  const data = useMemo(() => {
    const range = rangeOf(f);
    const prev = previousRange(range);
    const stats = productStats(ds, scopeOf(f, range[0], range[1]));
    const prevStats = prev ? productStats(ds, scopeOf(f, prev[0], prev[1])) : [];
    const ranked = stats.filter((x) => x.rank > 0);
    const totalCases = stats.reduce((a, x) => a + x.cases, 0);
    const totalCost = stats.reduce((a, x) => a + x.cost, 0);
    const prevCases = prevStats.reduce((a, x) => a + x.cases, 0);
    const prevCost = prevStats.reduce((a, x) => a + x.cost, 0);

    const medCases = median(ranked.map((x) => x.cases));
    const medCost = median(ranked.map((x) => x.cost));
    const points = ranked
      .filter((x) => x.cost > 0)
      .map((x) => ({ ...x, label: productLabel(ds, x.p), top: x.rank <= TOP_N }));

    // 로그 눈금 축 범위 — 끝 점이 축에 붙지 않도록 여유를 둔다
    const logDomain = (vals: number[]): [number, number] =>
      vals.length ? [Math.min(...vals) / 1.5, Math.max(...vals) * 1.5] : [1, 10];
    const xDomain = logDomain(points.map((x) => x.cases));
    const yDomain = logDomain(points.map((x) => x.cost));

    const byCost = [...stats].sort((a, b) => b.cost - a.cost);
    let cum = 0;
    const pareto = byCost.map((x, i) => {
      cum += x.cost;
      return { idx: i + 1, share: totalCost ? cum / totalCost : 0, label: productLabel(ds, x.p), cost: x.cost };
    });
    const reach80 = pareto.findIndex((x) => x.share >= 0.8) + 1;

    return {
      range,
      prev,
      stats,
      prevRank: rankMap(prevStats),
      share: topShare(stats),
      prevShare: prevStats.length ? topShare(prevStats) : null,
      avgUnit: totalCases ? totalCost / totalCases : 0,
      prevAvgUnit: prevCases ? prevCost / prevCases : null,
      rankedCount: ranked.length,
      productCount: stats.length,
      medCases,
      medCost,
      points,
      xDomain,
      yDomain,
      pareto,
      reach80,
      insights: selectionInsights(ds, stats, prevStats),
    };
  }, [ds, f]);

  const rangeText = `${fmtWeek(ds.weeks[data.range[0]]).split("~")[0]} ~ ${fmtWeek(ds.weeks[data.range[1]]).split("~")[1]}`;
  const topPts = data.points.filter((x) => x.top);
  const otherPts = data.points.filter((x) => !x.top);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        집계 기간 <span className="font-medium text-foreground">{rangeText}</span> ({data.range[1] - data.range[0] + 1}주) · 비교: 직전 같은 길이 기간
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi
          label={`상위 ${TOP_N}개 품목 비용 비중`}
          value={fmtPct(data.share)}
          source="상위 10개 비용 ÷ 전체 무상 AS 비용"
        >
          {data.prevShare !== null ? (
            <span className="text-xs text-muted-foreground">직전 기간 {fmtPct(data.prevShare)}</span>
          ) : null}
        </Kpi>
        <Kpi label="전체 건당 평균 비용" value={fmtWon(data.avgUnit)} source="전체 비용 ÷ 전체 건수">
          <Delta rate={data.prevAvgUnit ? changeRate(data.avgUnit, data.prevAvgUnit) : null} label="직전 기간 대비" />
        </Kpi>
        <Kpi label="순위 산정 대상 품목" value={`${fmtCount(data.rankedCount)}개`} source={`기간 내 ${MIN_CASES}건 이상 품목만 순위 산정`}>
          <span className="text-xs text-muted-foreground">AS 발생 품목 전체 {fmtCount(data.productCount)}개</span>
        </Kpi>
      </div>

      <Card>
        <CardTitle
          title={`개선 대상 상위 ${TOP_N}개 품목`}
          note={`종합점수 = 건수 백분위 × ${WEIGHT_CASES * 100}% + 비용 백분위 × ${WEIGHT_COST * 100}% · 행을 누르면 원인 분석으로 이동`}
          right={
            <InfoTip text="백분위는 순위 대상 품목 안에서 해당 품목보다 값이 작은 품목의 비율입니다. 판매수량이 없어 건수 기준이므로 많이 팔린 품목이 상위에 오르기 쉽습니다." />
          }
        />
        <TopTable ds={ds} stats={data.stats} prevRank={data.prevRank} prevLabel="직전 기간 대비" onSelectProduct={onSelectProduct} />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle
            title="발생 건수 × 비용 분포"
            note="기준선 = 순위 대상 품목의 중앙값 · 오른쪽 위 = 고발생·고비용 · 로그 눈금"
          />
          <div className="h-72">
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={colors.grid} />
                <XAxis
                  type="number"
                  dataKey="cases"
                  name="건수"
                  scale="log"
                  domain={data.xDomain}
                  allowDataOverflow
                  tick={{ fontSize: 11, fill: colors.muted }}
                  stroke={colors.axis}
                  tickFormatter={(v) => fmtCount(v)}
                  label={{ value: "건수", position: "insideBottomRight", offset: -2, fontSize: 11, fill: colors.muted }}
                />
                <YAxis
                  type="number"
                  dataKey="cost"
                  name="비용"
                  scale="log"
                  domain={data.yDomain}
                  allowDataOverflow
                  tick={{ fontSize: 11, fill: colors.muted }}
                  stroke={colors.axis}
                  width={52}
                  tickFormatter={(v) => `${fmtCount(v / 1e4)}만`}
                />
                <ReferenceLine x={data.medCases} stroke={colors.axis} strokeDasharray="4 4" />
                <ReferenceLine y={data.medCost} stroke={colors.axis} strokeDasharray="4 4" />
                <Tooltip
                  cursor={false}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const x = payload[0].payload as (typeof data.points)[number];
                    return (
                      <ChartTooltipBox
                        title={x.label}
                        rows={[
                          ["순위", `${x.rank}위`],
                          ["건수", `${fmtCount(x.cases)}건`],
                          ["비용", fmtMoney(x.cost)],
                          ["건당", fmtWon(x.unitCost)],
                        ]}
                      />
                    );
                  }}
                />
                <Scatter name="기타 품목" data={otherPts} fill={colors.neutral} isAnimationActive={false} />
                <Scatter
                  name={`상위 ${TOP_N}`}
                  data={topPts}
                  fill={colors.series1}
                  stroke={colors.surface}
                  strokeWidth={2}
                  isAnimationActive={false}
                  onClick={(d: { p?: number; payload?: { p: number } }) => {
                    const p = d.payload?.p ?? d.p;
                    if (p !== undefined) onSelectProduct(p);
                  }}
                  cursor="pointer"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full" style={{ background: colors.series1 }} />
              상위 {TOP_N} 품목
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-full" style={{ background: colors.neutral }} />
              기타 순위 대상 품목
            </span>
          </div>
        </Card>

        <Card>
          <CardTitle
            title="품목별 비용 누적 비중 (파레토)"
            note={data.reach80 > 0 ? `비용 상위 ${data.reach80}개 품목(전체 ${data.productCount}개 중 ${fmtPct(data.reach80 / Math.max(1, data.productCount), 0)})이 비용의 80%` : undefined}
          />
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={data.pareto} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis
                  dataKey="idx"
                  type="number"
                  domain={[1, "dataMax"]}
                  tick={{ fontSize: 11, fill: colors.muted }}
                  stroke={colors.axis}
                  label={{ value: "비용 순위", position: "insideBottomRight", offset: -2, fontSize: 11, fill: colors.muted }}
                />
                <YAxis
                  domain={[0, 1]}
                  tickFormatter={(v) => fmtPct(v, 0)}
                  tick={{ fontSize: 11, fill: colors.muted }}
                  stroke={colors.axis}
                  width={44}
                />
                <ReferenceLine y={0.8} stroke={colors.axis} strokeDasharray="4 4" label={{ value: "80%", position: "insideTopLeft", fontSize: 11, fill: colors.muted }} />
                {data.reach80 > 0 && <ReferenceLine x={data.reach80} stroke={colors.axis} strokeDasharray="4 4" />}
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const x = payload[0].payload as (typeof data.pareto)[number];
                    return (
                      <ChartTooltipBox
                        title={`${x.idx}위 ${x.label}`}
                        rows={[
                          ["품목 비용", fmtMoney(x.cost)],
                          ["누적 비중", fmtPct(x.share)],
                        ]}
                      />
                    );
                  }}
                />
                <Line type="linear" dataKey="share" stroke={colors.series1} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <InsightPanel insights={data.insights} onSelectProduct={onSelectProduct} />
    </div>
  );
}
