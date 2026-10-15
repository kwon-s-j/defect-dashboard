"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  DEFAULT_RANGE_WEEKS,
  TOP_N,
  byGroup,
  productStats,
  scopeOf,
  totals,
  weeklySeries,
} from "@/lib/analytics";
import { changeRate, fmtCount, fmtMoney, fmtPct, fmtWeek, fmtWeekShort } from "@/lib/format";
import { weeklyInsights } from "@/lib/insights";
import type { Dataset, Filters } from "@/lib/types";
import { InsightPanel, TopTable, rankMap } from "./shared";
import { Card, CardTitle, ChartTooltipBox, Delta, Kpi, useChartColors } from "./ui";

export function WeeklyView({ ds, f, onSelectProduct }: { ds: Dataset; f: Filters; onSelectProduct: (p: number) => void }) {
  const colors = useChartColors();
  const a = f.anchorWeek;

  const data = useMemo(() => {
    const week = (w0: number, w1: number) => totals(ds, scopeOf(f, Math.max(0, w0), w1));
    const cur = week(a, a);
    const last = a > 0 ? week(a - 1, a - 1) : null;
    const nPrev = Math.min(4, a);
    const prev4 = nPrev > 0 ? week(a - nPrev, a - 1) : null;
    const avg4 = prev4 && { cases: prev4.cases / nPrev, cost: prev4.cost / nPrev, xxCases: prev4.xxCases / nPrev };

    const trendFrom = Math.max(0, a - DEFAULT_RANGE_WEEKS + 1);
    const trend = weeklySeries(ds, scopeOf(f, trendFrom, a)).map((x) => ({ ...x, label: fmtWeekShort(x.week) }));

    const gCur = byGroup(ds, scopeOf(f, a, a));
    const gLast = a > 0 ? byGroup(ds, scopeOf(f, a - 1, a - 1)) : new Map();
    const groupRows = [...new Set([...gCur.keys(), ...gLast.keys()])]
      .map((g) => ({ group: String(g), cur: gCur.get(g)?.cost ?? 0, last: gLast.get(g)?.cost ?? 0 }))
      .sort((x, y) => y.cur - x.cur);

    const stats = productStats(ds, scopeOf(f, trendFrom, a));
    const prevStats = a > 0 ? productStats(ds, scopeOf(f, Math.max(0, a - DEFAULT_RANGE_WEEKS), a - 1)) : [];
    const top = stats.filter((x) => x.rank > 0 && x.rank <= TOP_N);
    const prevTop = prevStats.filter((x) => x.rank > 0 && x.rank <= TOP_N);
    const prevTopSet = new Set(prevTop.map((x) => x.p));
    const newEntries = prevTop.length ? top.filter((x) => !prevTopSet.has(x.p)).length : 0;
    const insights = weeklyInsights(ds, scopeOf(f, 0, a), a, top, prevTop);

    return { cur, last, avg4, nPrev, trend, groupRows, stats, prevRank: rankMap(prevStats), newEntries, insights };
  }, [ds, f, a]);

  const { cur, last, avg4, nPrev } = data;
  const xxShare = cur.cases ? cur.xxCases / cur.cases : 0;
  const lastXxShare = last && last.cases ? last.xxCases / last.cases : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        기준 주차 <span className="font-medium text-foreground">{fmtWeek(ds.weeks[a])}</span> · 무상 AS 기준
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="총 AS 비용 (무상)" value={fmtMoney(cur.cost)} source="출처: AS처리 · AS대행료 + 부품금액">
          <Delta rate={last ? changeRate(cur.cost, last.cost) : null} label="지난주 대비" />
          <Delta rate={avg4 ? changeRate(cur.cost, avg4.cost) : null} label={`직전 ${nPrev}주 평균 대비`} />
        </Kpi>
        <Kpi label="전체 AS 건수 (무상)" value={`${fmtCount(cur.cases)}건`} source="출처: AS처리 · 건 = 전문점코드+년+월+번호">
          <Delta rate={last ? changeRate(cur.cases, last.cases) : null} label="지난주 대비" />
          <Delta rate={avg4 ? changeRate(cur.cases, avg4.cases) : null} label={`직전 ${nPrev}주 평균 대비`} />
        </Kpi>
        <Kpi
          label={`개선 대상 상위 ${TOP_N}개 품목`}
          value={`신규 진입 ${data.newEntries}개`}
          source="최근 13주 종합점수 기준 (아래 표)"
        >
          <span className="text-xs text-muted-foreground">지난주 기준 순위와 비교</span>
        </Kpi>
        <Kpi label="부품 미사용(출장만) 비중" value={fmtPct(xxShare)} source="출처: AS처리 · 부품코드 XX 건 ÷ 전체 건">
          {lastXxShare !== null ? (
            <span className="text-xs text-muted-foreground">지난주 {fmtPct(lastXxShare)}</span>
          ) : null}
          {!f.includeXX && <span className="text-xs text-muted-foreground">현재 XX 제외 필터 적용 중</span>}
        </Kpi>
      </div>

      <Card>
        <CardTitle
          title={`개선 대상 상위 ${TOP_N}개 품목`}
          note="최근 13주 · 건수 백분위 50% + 비용 백분위 50% · 행을 누르면 원인 분석으로 이동"
        />
        <TopTable ds={ds} stats={data.stats} prevRank={data.prevRank} prevLabel="지난주 대비" onSelectProduct={onSelectProduct} compact />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle title="주별 AS 건수" note="최근 13주 · 진한 점 = 기준 주차" />
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={data.trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.muted }} stroke={colors.axis} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: colors.muted }} stroke={colors.axis} width={40} allowDecimals={false} />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTooltipBox title={fmtWeek(payload[0].payload.week)} rows={[["건수", `${fmtCount(payload[0].payload.cases)}건`]]} />
                    ) : null
                  }
                />
                <Line type="linear" dataKey="cases" stroke={colors.series1} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                {data.trend.length > 0 && (
                  <ReferenceDot x={data.trend[data.trend.length - 1].label} y={data.trend[data.trend.length - 1].cases} r={5} fill={colors.series1} stroke={colors.surface} strokeWidth={2} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardTitle title="주별 AS 비용" note="최근 13주 · 단위 만 원" />
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={data.trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: colors.muted }} stroke={colors.axis} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: colors.muted }} stroke={colors.axis} width={48} tickFormatter={(v) => fmtCount(v / 1e4)} />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTooltipBox title={fmtWeek(payload[0].payload.week)} rows={[["비용", fmtMoney(payload[0].payload.cost)]]} />
                    ) : null
                  }
                />
                <Line type="linear" dataKey="cost" stroke={colors.series1} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                {data.trend.length > 0 && (
                  <ReferenceDot x={data.trend[data.trend.length - 1].label} y={data.trend[data.trend.length - 1].cost} r={5} fill={colors.series1} stroke={colors.surface} strokeWidth={2} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle title="제품군별 AS 비용" note="이번 주 vs 지난주 · 단위 만 원" />
          <div style={{ height: Math.max(160, data.groupRows.length * 44 + 40) }}>
            <ResponsiveContainer>
              <BarChart data={data.groupRows} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke={colors.grid} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: colors.muted }} stroke={colors.axis} tickFormatter={(v) => fmtCount(v / 1e4)} />
                <YAxis type="category" dataKey="group" tick={{ fontSize: 12, fill: colors.text }} stroke={colors.axis} width={64} />
                <Tooltip
                  cursor={{ fill: colors.grid, opacity: 0.4 }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTooltipBox
                        title={payload[0].payload.group}
                        rows={[
                          ["이번 주", fmtMoney(payload[0].payload.cur)],
                          ["지난주", fmtMoney(payload[0].payload.last)],
                        ]}
                      />
                    ) : null
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12, color: colors.muted }} />
                <Bar dataKey="cur" name="이번 주" fill={colors.series1} radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false} />
                <Bar dataKey="last" name="지난주" fill={colors.neutral} radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <InsightPanel insights={data.insights} onSelectProduct={onSelectProduct} />
      </div>
    </div>
  );
}
