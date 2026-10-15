// AI 인사이트 제안 (PRD 4장) — 결론이 아닌 제안 톤, 근거 수치 필수, View당 3개 이하
import {
  MTF_BUCKETS,
  TOP_N,
  eachRow,
  groupBy,
  median,
  mtfBucket,
  productLabel,
  productWeekly,
  type Scope,
} from "./analytics";
import { fmtCount, fmtMoney, fmtPct, fmtWon, fmtYm } from "./format";
import type { Dataset, ProductStat } from "./types";

export type InsightKind = "이상 탐지" | "추세 경고" | "신규 진입" | "기회 발견";

export interface Insight {
  kind: InsightKind;
  text: string;
  basis: string;
  product?: number;
}

const MAX = 3;

/** View 1: 주간 이상·추세·신규 진입 */
export function weeklyInsights(
  ds: Dataset,
  base: Scope,
  anchor: number,
  currentTop: ProductStat[],
  prevTop: ProductStat[],
): Insight[] {
  const out: Insight[] = [];
  const from = Math.max(0, anchor - 4);
  const series = productWeekly(ds, { ...base, wFrom: from, wTo: anchor });
  const k = anchor - from;

  // 이상 탐지: 이번 주 비용 ≥ 직전 4주 평균 × 1.5 (이번 주 3건 이상)
  let spike: Insight | null = null;
  let spikeRatio = 0;
  for (const [p, e] of series) {
    if (k < 1 || e.cases[k] < 3) continue;
    const prev = e.cost.slice(0, k);
    const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
    if (avg <= 0) continue;
    const ratio = e.cost[k] / avg;
    if (ratio >= 1.5 && ratio > spikeRatio) {
      spikeRatio = ratio;
      spike = {
        kind: "이상 탐지",
        product: p,
        text: `${productLabel(ds, p)}의 이번 주 AS 비용이 직전 ${k}주 평균보다 ${fmtPct(ratio - 1, 0)} 많습니다. 증상 변화가 있는지 확인해볼 필요가 있습니다.`,
        basis: `이번 주 ${fmtMoney(e.cost[k])} (${fmtCount(e.cases[k])}건) / 직전 ${k}주 평균 ${fmtMoney(avg)}`,
      };
    }
  }
  if (spike) out.push(spike);

  // 추세 경고: 주간 건수 3주 연속 증가
  if (k >= 3) {
    let trend: Insight | null = null;
    let trendGain = 0;
    for (const [p, e] of series) {
      const c = e.cases.slice(k - 3, k + 1).map((v) => Math.round(v));
      if (c[0] < c[1] && c[1] < c[2] && c[2] < c[3] && c[3] - c[0] > trendGain) {
        trendGain = c[3] - c[0];
        trend = {
          kind: "추세 경고",
          product: p,
          text: `${productLabel(ds, p)}의 주간 AS 건수가 3주 연속 늘었습니다. 원인 확인이 필요할 수 있습니다.`,
          basis: `주간 건수 ${c.join(" → ")}건`,
        };
      }
    }
    if (trend) out.push(trend);
  }

  // 신규 진입: 지난주 기준 상위 10에 없던 품목
  const prevSet = new Set(prevTop.map((x) => x.p));
  const entrant = currentTop.find((x) => !prevSet.has(x.p));
  if (entrant && prevTop.length) {
    out.push({
      kind: "신규 진입",
      product: entrant.p,
      text: `${productLabel(ds, entrant.p)}이(가) 이번 주 개선 대상 상위 ${TOP_N}위에 새로 들어왔습니다 (${entrant.rank}위).`,
      basis: `최근 13주 ${fmtCount(entrant.cases)}건 / ${fmtMoney(entrant.cost)}`,
    });
  }
  return out.slice(0, MAX);
}

/** View 2: 저발생·고비용 기회, 연속 상위 */
export function selectionInsights(ds: Dataset, stats: ProductStat[], prevStats: ProductStat[]): Insight[] {
  const out: Insight[] = [];
  const ranked = stats.filter((x) => x.rank > 0);
  if (!ranked.length) return out;
  const totalCases = ranked.reduce((a, x) => a + x.cases, 0);
  const totalCost = ranked.reduce((a, x) => a + x.cost, 0);
  const avgUnit = totalCases ? totalCost / totalCases : 0;
  const medCases = median(ranked.map((x) => x.cases));

  const opportunities = ranked
    .filter((x) => x.cases <= medCases && x.unitCost >= avgUnit * 5)
    .sort((a, b) => b.cost - a.cost);
  for (const x of opportunities.slice(0, 2)) {
    out.push({
      kind: "기회 발견",
      product: x.p,
      text: `${productLabel(ds, x.p)}은(는) 건수는 적지만 건당 비용이 큽니다. 개선하면 비용 절감 효과가 클 수 있습니다.`,
      basis: `건당 ${fmtWon(x.unitCost)} (전체 평균 ${fmtWon(avgUnit)}의 ${(x.unitCost / avgUnit).toFixed(1)}배), ${fmtCount(x.cases)}건`,
    });
  }

  const prevTop = new Set(prevStats.filter((x) => x.rank > 0 && x.rank <= TOP_N).map((x) => x.p));
  const repeat = ranked.filter((x) => x.rank <= TOP_N && prevTop.has(x.p));
  if (repeat.length) {
    const names = repeat.slice(0, 3).map((x) => ds.products[x.p][0]);
    out.push({
      kind: "추세 경고",
      product: repeat[0].p,
      text: `${repeat.length}개 품목이 2기간 연속 상위 ${TOP_N}위입니다. 기존 조치 효과를 점검해볼 필요가 있습니다.`,
      basis: `${names.join(", ")}${repeat.length > 3 ? " 외" : ""}`,
    });
  }
  return out.slice(0, MAX);
}

/** View 3: 제조년월 집중, 초기 AS 비중 */
export function detailInsights(ds: Dataset, s: Scope): Insight[] {
  const out: Insight[] = [];
  if (s.product == null) return out;
  const label = productLabel(ds, s.product);

  const byMfg = groupBy(ds, s, (i) => (ds.facts.mfg[i] > 0 ? ds.facts.mfg[i] : null));
  if (byMfg.size >= 3) {
    const vals = [...byMfg.values()].map((a) => a.cases);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const [ym, top] = [...byMfg.entries()].sort((a, b) => b[1].cases - a[1].cases)[0];
    if (top.cases >= 5 && top.cases >= avg * 2) {
      out.push({
        kind: "이상 탐지",
        text: `${label}의 ${fmtYm(ym as number)} 제조분에 AS가 몰려 있습니다. 해당 생산 로트를 검토해볼 필요가 있습니다.`,
        basis: `${fmtYm(ym as number)} ${fmtCount(top.cases)}건 / 제조월 평균 ${avg.toFixed(1)}건`,
      });
    }
  }

  let early = 0;
  let known = 0;
  eachRow(ds, s, (i) => {
    const b = mtfBucket(ds.facts.mtf[i]);
    if (b === null) return;
    known += ds.facts.cases[i];
    if (b === 0) early += ds.facts.cases[i];
  });
  if (known >= 5 && early / known >= 0.5) {
    out.push({
      kind: "추세 경고",
      text: `${label}은(는) 설치 후 ${MTF_BUCKETS[0].label} AS 비중이 높습니다. 초기 불량이나 시공 문제일 수 있습니다.`,
      basis: `${fmtPct(early / known, 0)} (${fmtCount(early)} / ${fmtCount(known)}건, 설치년월 확인 건 기준)`,
    });
  }
  return out.slice(0, MAX);
}
