import type { Dataset, Filters, ProductStat, Totals } from "./types";

/** 종합점수 가중치·최소 표본 (PRD 3장) */
export const WEIGHT_CASES = 0.5;
export const WEIGHT_COST = 0.5;
export const MIN_CASES = 5;
export const TOP_N = 10;
export const DEFAULT_RANGE_WEEKS = 13;

export interface Scope {
  wFrom: number;
  wTo: number;
  group?: string;
  includeXX: boolean;
  product?: number | null;
  symptom?: number | null;
  cause?: number | null;
  zone?: number | null;
}

export function scopeOf(f: Filters, wFrom: number, wTo: number, detail = false): Scope {
  return {
    wFrom,
    wTo,
    group: f.group,
    includeXX: f.includeXX,
    ...(detail ? { product: f.product, symptom: f.symptom, cause: f.cause, zone: f.zone } : {}),
  };
}

/** 데이터 기준일 이전에 끝나는 마지막 완결 주차 */
export function lastCompleteWeek(ds: Dataset): number {
  const end = new Date(`${ds.meta.data_end}T00:00:00`).getTime();
  for (let i = ds.weeks.length - 1; i >= 0; i--) {
    const weekEnd = new Date(`${ds.weeks[i]}T00:00:00`).getTime() + 6 * 86400000;
    if (weekEnd <= end) return i;
  }
  return ds.weeks.length - 1;
}

/** 필터의 집계 범위 → [wFrom, wTo] */
export function rangeOf(f: Filters): [number, number] {
  const wTo = f.anchorWeek;
  if (f.customStart !== null) return [Math.min(f.customStart, wTo), wTo];
  if (f.rangeWeeks <= 0) return [0, wTo];
  return [Math.max(0, wTo - f.rangeWeeks + 1), wTo];
}

/** 같은 길이의 직전 기간 */
export function previousRange([wFrom, wTo]: [number, number]): [number, number] | null {
  const len = wTo - wFrom + 1;
  const to = wFrom - 1;
  if (to < 0) return null;
  return [Math.max(0, to - len + 1), to];
}

const groupCache = new WeakMap<Dataset, string[]>();
function groupsOf(ds: Dataset): string[] {
  let g = groupCache.get(ds);
  if (!g) {
    g = ds.products.map((p) => p[2]);
    groupCache.set(ds, g);
  }
  return g;
}

export function eachRow(ds: Dataset, s: Scope, fn: (i: number) => void) {
  const f = ds.facts;
  const groups = groupsOf(ds);
  for (let i = 0; i < f.w.length; i++) {
    const w = f.w[i];
    if (w < s.wFrom || w > s.wTo) continue;
    if (!s.includeXX && f.xx[i] === 1) continue;
    if (s.group && groups[f.p[i]] !== s.group) continue;
    if (s.product != null && f.p[i] !== s.product) continue;
    if (s.symptom != null && f.s[i] !== s.symptom) continue;
    if (s.cause != null && f.c[i] !== s.cause) continue;
    if (s.zone != null && f.z[i] !== s.zone) continue;
    fn(i);
  }
}

const costAt = (ds: Dataset, i: number) => ds.facts.fee[i] + ds.facts.part[i];

export function totals(ds: Dataset, s: Scope): Totals {
  const t = { cases: 0, cost: 0, xxCases: 0 };
  eachRow(ds, s, (i) => {
    t.cases += ds.facts.cases[i];
    t.cost += costAt(ds, i);
    if (ds.facts.xx[i] === 1) t.xxCases += ds.facts.cases[i];
  });
  return t;
}

export interface WeekPoint {
  w: number;
  week: string;
  cases: number;
  cost: number;
}

export function weeklySeries(ds: Dataset, s: Scope): WeekPoint[] {
  const out: WeekPoint[] = [];
  for (let w = s.wFrom; w <= s.wTo; w++) out.push({ w, week: ds.weeks[w], cases: 0, cost: 0 });
  eachRow(ds, s, (i) => {
    const pt = out[ds.facts.w[i] - s.wFrom];
    pt.cases += ds.facts.cases[i];
    pt.cost += costAt(ds, i);
  });
  return out;
}

export interface Agg {
  cases: number;
  cost: number;
}

/** 임의 키별 건수·비용 집계 */
export function groupBy(ds: Dataset, s: Scope, key: (i: number) => string | number | null): Map<string | number, Agg> {
  const m = new Map<string | number, Agg>();
  eachRow(ds, s, (i) => {
    const k = key(i);
    if (k === null) return;
    let a = m.get(k);
    if (!a) {
      a = { cases: 0, cost: 0 };
      m.set(k, a);
    }
    a.cases += ds.facts.cases[i];
    a.cost += costAt(ds, i);
  });
  return m;
}

export function byGroup(ds: Dataset, s: Scope) {
  const groups = groupsOf(ds);
  return groupBy(ds, s, (i) => groups[ds.facts.p[i]]);
}

/** 정렬된 값 배열에서 v 미만 개수 / (n-1) */
function percentRank(sorted: number[], v: number): number {
  if (sorted.length <= 1) return 1;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo / (sorted.length - 1);
}

/** 품목별 건수·비용·종합점수·순위 (PRD View 2) */
export function productStats(ds: Dataset, s: Scope): ProductStat[] {
  const agg = groupBy(ds, s, (i) => ds.facts.p[i]);
  const symptomCount = new Map<number, Map<number, number>>();
  eachRow(ds, s, (i) => {
    const p = ds.facts.p[i];
    let m = symptomCount.get(p);
    if (!m) symptomCount.set(p, (m = new Map()));
    m.set(ds.facts.s[i], (m.get(ds.facts.s[i]) ?? 0) + ds.facts.cases[i]);
  });

  const stats: ProductStat[] = [...agg.entries()].map(([p, a]) => {
    let topSymptom: number | null = null;
    let best = -1;
    for (const [sym, n] of symptomCount.get(p as number) ?? []) {
      if (n > best) {
        best = n;
        topSymptom = sym;
      }
    }
    return {
      p: p as number,
      cases: a.cases,
      cost: a.cost,
      unitCost: a.cases ? a.cost / a.cases : 0,
      score: 0,
      rank: 0,
      topSymptom,
    };
  });

  const eligible = stats.filter((x) => x.cases >= MIN_CASES);
  const caseSorted = eligible.map((x) => x.cases).sort((a, b) => a - b);
  const costSorted = eligible.map((x) => x.cost).sort((a, b) => a - b);
  for (const x of eligible) {
    x.score = WEIGHT_CASES * percentRank(caseSorted, x.cases) + WEIGHT_COST * percentRank(costSorted, x.cost);
  }
  eligible
    .sort((a, b) => b.score - a.score || b.cost - a.cost)
    .forEach((x, i) => (x.rank = i + 1));
  return stats.sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9) || b.cost - a.cost);
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 품목별 주간 건수·비용 시계열 (인사이트 탐지용) */
export function productWeekly(ds: Dataset, s: Scope) {
  const len = s.wTo - s.wFrom + 1;
  const m = new Map<number, { cases: number[]; cost: number[] }>();
  eachRow(ds, s, (i) => {
    const p = ds.facts.p[i];
    let e = m.get(p);
    if (!e) m.set(p, (e = { cases: Array(len).fill(0), cost: Array(len).fill(0) }));
    const k = ds.facts.w[i] - s.wFrom;
    e.cases[k] += ds.facts.cases[i];
    e.cost[k] += costAt(ds, i);
  });
  return m;
}

/** 설치 후 경과 기간 구간 */
export const MTF_BUCKETS: { label: string; max: number }[] = [
  { label: "6개월 이내", max: 6 },
  { label: "7~12개월", max: 12 },
  { label: "13~24개월", max: 24 },
  { label: "25~36개월", max: 36 },
  { label: "37~60개월", max: 60 },
  { label: "60개월 초과", max: Infinity },
];

export function mtfBucket(m: number): number | null {
  if (m < 0) return null;
  return MTF_BUCKETS.findIndex((b) => m <= b.max);
}

export function productLabel(ds: Dataset, p: number): string {
  const [code, name] = ds.products[p];
  return name ? `${code} ${name}` : code;
}

export function partLabel(ds: Dataset, pt: number): string {
  const [code, name] = ds.parts[pt];
  if (code.toUpperCase() === "XX") return "부품 미사용(출장만)";
  return name ? `${name} (${code})` : code;
}

export function allGroups(ds: Dataset): string[] {
  return [...new Set(groupsOf(ds))].sort((a, b) => (a === "기타" ? 1 : b === "기타" ? -1 : a.localeCompare(b, "ko")));
}
