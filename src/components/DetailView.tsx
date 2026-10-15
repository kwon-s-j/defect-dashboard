"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  MTF_BUCKETS,
  groupBy,
  mtfBucket,
  partLabel,
  previousRange,
  productLabel,
  rangeOf,
  scopeOf,
  totals,
} from "@/lib/analytics";
import { changeRate, fmtCount, fmtMoney, fmtPct, fmtWeek, fmtYm } from "@/lib/format";
import { detailInsights } from "@/lib/insights";
import type { Dataset, Filters } from "@/lib/types";
import { InsightPanel } from "./shared";
import { Card, CardTitle, ChartTooltipBox, Delta, Kpi, mix, useChartColors } from "./ui";

const PART_DEFECT = "부품불량";
const MAX_SYMPTOMS = 8;
const MAX_CAUSES = 6;
const MAX_PARTS = 10;

export function DetailView({ ds, f }: { ds: Dataset; f: Filters }) {
  const colors = useChartColors();

  const data = useMemo(() => {
    if (f.product == null) return null;
    const range = rangeOf(f);
    const prev = previousRange(range);
    const scope = scopeOf(f, range[0], range[1], true);
    const all = { ...scopeOf(f, range[0], range[1]), product: null };
    const fx = ds.facts;

    const cur = totals(ds, scope);
    const before = prev ? totals(ds, { ...scope, wFrom: prev[0], wTo: prev[1] }) : null;

    const sym = groupBy(ds, scope, (i) => fx.s[i]);
    const symAll = groupBy(ds, all, (i) => fx.s[i]);
    const allTotals = totals(ds, all);
    const topSym = [...sym.entries()].sort((a, b) => b[1].cases - a[1].cases)[0];
    const topSymShare = topSym && cur.cases ? topSym[1].cases / cur.cases : 0;
    const topSymShareAll = topSym && allTotals.cases ? (symAll.get(topSym[0])?.cases ?? 0) / allTotals.cases : 0;

    const causeIdx = ds.causes.indexOf(PART_DEFECT);
    const cause = groupBy(ds, scope, (i) => fx.c[i]);
    const causeAll = groupBy(ds, all, (i) => fx.c[i]);
    const partDefect = causeIdx >= 0 && cur.cases ? (cause.get(causeIdx)?.cases ?? 0) / cur.cases : null;
    const partDefectAll = causeIdx >= 0 && allTotals.cases ? (causeAll.get(causeIdx)?.cases ?? 0) / allTotals.cases : null;

    // 증상 × 원인
    const symRows = [...sym.entries()].sort((a, b) => b[1].cases - a[1].cases).slice(0, MAX_SYMPTOMS).map(([k]) => k as number);
    const causeCols = [...cause.entries()].sort((a, b) => b[1].cases - a[1].cases).slice(0, MAX_CAUSES).map(([k]) => k as number);
    const matrix = groupBy(ds, scope, (i) => `${fx.s[i]}|${fx.c[i]}`);
    const maxCell = Math.max(1, ...[...matrix.values()].map((a) => a.cases));

    const parts = [...groupBy(ds, scope, (i) => fx.pt[i]).entries()]
      .map(([pt, a]) => ({ label: partLabel(ds, pt as number), ...a }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, MAX_PARTS);

    const mfgMap = groupBy(ds, scope, (i) => (fx.mfg[i] > 0 ? fx.mfg[i] : null));
    const mfg = [...mfgMap.entries()]
      .sort((a, b) => (a[0] as number) - (b[0] as number))
      .map(([ym, a]) => ({ label: fmtYm(ym as number), ...a }));
    const mfgKnown = mfg.reduce((s, x) => s + x.cases, 0);

    const mtfMap = groupBy(ds, scope, (i) => mtfBucket(fx.mtf[i]));
    const mtf = MTF_BUCKETS.map((b, i) => ({ label: b.label, cases: mtfMap.get(i)?.cases ?? 0, cost: mtfMap.get(i)?.cost ?? 0 }));
    const mtfKnown = mtf.reduce((s, x) => s + x.cases, 0);

    const samples = (ds.samples[String(f.product)] ?? []).filter(
      ([, s, c]) => (f.symptom == null || s === ds.symptoms[f.symptom]) && (f.cause == null || c === ds.causes[f.cause]),
    );

    return {
      range,
      cur,
      before,
      topSym,
      topSymShare,
      topSymShareAll,
      partDefect,
      partDefectAll,
      symRows,
      causeCols,
      matrix,
      maxCell,
      parts,
      mfg,
      mfgMissing: cur.cases ? 1 - mfgKnown / cur.cases : 0,
      mtf,
      mtfMissing: cur.cases ? 1 - mtfKnown / cur.cases : 0,
      samples,
      insights: detailInsights(ds, scope),
    };
  }, [ds, f]);

  if (!data || f.product == null) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">위 필터에서 품목을 선택하거나, 다른 화면의 상위 10개 표에서 품목을 누르십시오.</p>
      </Card>
    );
  }

  const rangeText = `${fmtWeek(ds.weeks[data.range[0]]).split("~")[0]} ~ ${fmtWeek(ds.weeks[data.range[1]]).split("~")[1]}`;
  const axis = { fontSize: 11, fill: colors.muted };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{productLabel(ds, f.product)}</span> ({ds.products[f.product][2]}) · {rangeText}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="AS 건수 · 비용" value={`${fmtCount(data.cur.cases)}건 · ${fmtMoney(data.cur.cost)}`} source="직전 같은 길이 기간과 비교">
          <Delta rate={data.before ? changeRate(data.cur.cases, data.before.cases) : null} label="건수" />
          <Delta rate={data.before ? changeRate(data.cur.cost, data.before.cost) : null} label="비용" />
        </Kpi>
        <Kpi
          label="최다 증상"
          value={data.topSym ? `${ds.symptoms[data.topSym[0] as number]} ${fmtPct(data.topSymShare, 0)}` : "–"}
          source="증상별 건수 ÷ 품목 건수"
        >
          <span className="text-xs text-muted-foreground">전체 품목 평균 {fmtPct(data.topSymShareAll, 0)}</span>
        </Kpi>
        <Kpi label="부품불량 원인 비중" value={data.partDefect !== null ? fmtPct(data.partDefect, 0) : "–"} source="원인 = 부품불량 건수 ÷ 품목 건수">
          {data.partDefectAll !== null && <span className="text-xs text-muted-foreground">전체 품목 평균 {fmtPct(data.partDefectAll, 0)}</span>}
        </Kpi>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle title="증상 × 원인" note="칸 = 건수 · 색이 강할수록 많음 · 마우스를 올리면 비용 표시" />
          {data.symRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">데이터가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0.5 text-xs">
                <thead>
                  <tr>
                    <th className="p-1 text-left font-medium text-muted-foreground">증상 / 원인</th>
                    {data.causeCols.map((c) => (
                      <th key={c} className="p-1 text-center font-medium text-muted-foreground">
                        {ds.causes[c]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.symRows.map((s) => (
                    <tr key={s}>
                      <td className="whitespace-nowrap p-1 pr-2 font-medium">{ds.symptoms[s]}</td>
                      {data.causeCols.map((c) => {
                        const cell = data.matrix.get(`${s}|${c}`);
                        const t = cell ? cell.cases / data.maxCell : 0;
                        const bg = cell ? mix(colors.seqLow, colors.seqHigh, t) : "transparent";
                        return (
                          <td
                            key={c}
                            title={cell ? `${ds.symptoms[s]} × ${ds.causes[c]}: ${fmtCount(cell.cases)}건, ${fmtMoney(cell.cost)}` : undefined}
                            className="h-8 min-w-12 rounded text-center tabular"
                            style={{ background: bg, color: t > 0.55 ? "#ffffff" : colors.text, border: cell ? undefined : `1px dashed ${colors.grid}` }}
                          >
                            {cell ? fmtCount(cell.cases) : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle title="교체 부품별 비용" note={`상위 ${MAX_PARTS}개 · 단위 만 원`} />
          <div style={{ height: Math.max(160, data.parts.length * 30 + 30) }}>
            <ResponsiveContainer>
              <BarChart data={data.parts} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} horizontal={false} />
                <XAxis type="number" tick={axis} stroke={colors.axis} tickFormatter={(v) => fmtCount(v / 1e4)} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: colors.text }} stroke={colors.axis} width={150} />
                <Tooltip
                  cursor={{ fill: colors.grid, opacity: 0.4 }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTooltipBox
                        title={payload[0].payload.label}
                        rows={[
                          ["비용", fmtMoney(payload[0].payload.cost)],
                          ["건수", `${fmtCount(payload[0].payload.cases)}건`],
                        ]}
                      />
                    ) : null
                  }
                />
                <Bar dataKey="cost" fill={colors.series1} radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle title="제조년월별 AS 건수" note={`제조년월 미기재 ${fmtPct(data.mfgMissing, 0)}는 제외`} />
          <div className="h-56">
            {data.mfg.length === 0 ? (
              <p className="text-sm text-muted-foreground">제조년월이 기재된 건이 없습니다.</p>
            ) : (
              <ResponsiveContainer>
                <BarChart data={data.mfg} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="label" tick={axis} stroke={colors.axis} interval="preserveStartEnd" />
                  <YAxis tick={axis} stroke={colors.axis} width={36} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: colors.grid, opacity: 0.4 }}
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <ChartTooltipBox title={`${payload[0].payload.label} 제조`} rows={[["건수", `${fmtCount(payload[0].payload.cases)}건`], ["비용", fmtMoney(payload[0].payload.cost)]]} />
                      ) : null
                    }
                  />
                  <Bar dataKey="cases" fill={colors.series1} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card>
          <CardTitle title="설치 후 AS까지 경과 기간" note={`설치년월 미기재 ${fmtPct(data.mtfMissing, 0)}는 제외 · 앞쪽이 많으면 초기 불량·시공 문제 가능성`} />
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={data.mtf} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={colors.grid} vertical={false} />
                <XAxis dataKey="label" tick={axis} stroke={colors.axis} interval={0} />
                <YAxis tick={axis} stroke={colors.axis} width={36} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: colors.grid, opacity: 0.4 }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTooltipBox title={payload[0].payload.label} rows={[["건수", `${fmtCount(payload[0].payload.cases)}건`], ["비용", fmtMoney(payload[0].payload.cost)]]} />
                    ) : null
                  }
                />
                <Bar dataKey="cases" fill={colors.series1} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle title="고장내역 원문 (최근 접수순)" note="전화번호·동호수는 [전화]·[주소]로 가렸습니다 · 기간 필터와 무관하게 최근 5건" />
          {data.samples.length === 0 ? (
            <p className="text-sm text-muted-foreground">조건에 맞는 원문이 없습니다.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {data.samples.map(([d, s, c, t], i) => (
                <li key={i} className="py-2 text-sm">
                  <div className="mb-0.5 text-xs text-muted-foreground">
                    {d} · {s} · {c}
                  </div>
                  {t}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <InsightPanel insights={data.insights} />
      </div>
    </div>
  );
}
