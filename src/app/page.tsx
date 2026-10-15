"use client";

import { AlertTriangle, LogOut } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DetailView } from "@/components/DetailView";
import { LoginScreen } from "@/components/LoginScreen";
import { SelectionView } from "@/components/SelectionView";
import { WeeklyView } from "@/components/WeeklyView";
import { Field, Select, cn } from "@/components/ui";
import { DEFAULT_RANGE_WEEKS, allGroups, lastCompleteWeek, productStats, rangeOf, scopeOf } from "@/lib/analytics";
import { fmtCount, fmtMoney, fmtWeek } from "@/lib/format";
import { logout, restoreSession } from "@/lib/secure";
import type { Dataset, Filters } from "@/lib/types";

const TABS = [
  { id: "weekly", label: "주간 AS 현황", desc: "이번 주 이상 여부 확인" },
  { id: "select", label: "개선 대상 선정", desc: "발생 × 비용으로 10개 확정" },
  { id: "detail", label: "품목 원인 분석", desc: "증상·원인·부품·로트" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const RANGE_OPTIONS = [
  { value: "4", label: "최근 4주" },
  { value: "13", label: "최근 13주" },
  { value: "26", label: "최근 26주" },
  { value: "52", label: "최근 52주" },
  { value: "0", label: "전체 기간" },
  { value: "custom", label: "직접 지정" },
];

const ALL = "";

export default function Page() {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [tab, setTab] = useState<TabId>("weekly");
  const [f, setF] = useState<Filters | null>(null);

  const start = (d: Dataset, u: string) => {
    setDs(d);
    setUser(u);
    setF({
      anchorWeek: lastCompleteWeek(d),
      rangeWeeks: DEFAULT_RANGE_WEEKS,
      customStart: null,
      group: ALL,
      includeXX: true,
      product: null,
      symptom: null,
      cause: null,
      zone: null,
    });
  };

  // 같은 탭에서 이미 로그인했으면 세션 복원
  useEffect(() => {
    restoreSession()
      .then((s) => s && start(s.ds, s.user))
      .catch(() => undefined)
      .finally(() => setRestoring(false));
  }, []);

  const signOut = () => {
    logout();
    setDs(null);
    setUser(null);
    setF(null);
  };

  // #select, #detail 로 특정 화면을 바로 열 수 있게 한다 (회의 자료 링크용)
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.slice(1);
      if (TABS.some((t) => t.id === h)) setTab(h as TabId);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  useEffect(() => {
    if (window.location.hash.slice(1) !== tab) history.replaceState(null, "", `#${tab}`);
  }, [tab]);

  const update = (patch: Partial<Filters>) => setF((prev) => (prev ? { ...prev, ...patch } : prev));

  // 원인 분석 화면에 품목이 없으면 현재 1위 품목으로 시작
  useEffect(() => {
    if (!ds || !f || tab !== "detail" || f.product !== null) return;
    const [w0, w1] = rangeOf(f);
    const top = productStats(ds, scopeOf(f, w0, w1)).find((x) => x.rank === 1);
    if (top) update({ product: top.p });
  }, [ds, f, tab]);

  const selectProduct = (p: number) => {
    update({ product: p, symptom: null, cause: null });
    setTab("detail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const productOptions = useMemo(() => {
    if (!ds) return [];
    const totalsByProduct = new Map<number, number>();
    ds.facts.p.forEach((p, i) => totalsByProduct.set(p, (totalsByProduct.get(p) ?? 0) + ds.facts.cases[i]));
    return ds.products
      .map(([code, name], i) => ({ i, code, name, n: totalsByProduct.get(i) ?? 0 }))
      .filter((x) => !f?.group || ds.products[x.i][2] === f.group)
      .sort((a, b) => b.n - a.n)
      .map((x) => ({ value: String(x.i), label: `${x.code} ${x.name}` }));
  }, [ds, f?.group]);

  if (restoring) {
    return <main className="p-6 text-sm text-muted-foreground">불러오는 중…</main>;
  }
  if (!ds || !f) {
    return <LoginScreen onLogin={start} />;
  }

  const isSample = ds.meta.source_file.toLowerCase().includes("sample");
  const weekOptions = ds.weeks.map((w, i) => ({ value: String(i), label: fmtWeek(w) })).reverse();
  const rangeValue = f.customStart !== null ? "custom" : String(f.rangeWeeks);
  const idxOptions = (list: string[]) => [{ value: ALL, label: "전체" }, ...list.map((x, i) => ({ value: String(i), label: x }))];
  const toIdx = (v: string) => (v === ALL ? null : Number(v));

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6">
      {isSample && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          샘플 데이터로 표시 중입니다. 실제 수치가 아닙니다.
        </div>
      )}

      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight">제품별 AS(불량) 현황</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{user}</span>
            <button
              onClick={signOut}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs text-foreground hover:bg-muted"
            >
              <LogOut className="size-3.5" aria-hidden />
              로그아웃
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          데이터 기준일 {ds.meta.data_end} · 기간 {ds.meta.data_start} ~ {ds.meta.data_end} · 무상 AS {fmtCount(ds.meta.free_cases)}건 /{" "}
          {fmtMoney(ds.meta.free_total_cost)} · 출처: {ds.meta.source_file}
        </p>
        <p className="text-xs text-muted-foreground">
          무상 AS만 집계 · 판매수량이 없어 불량률이 아닌 <b className="font-medium text-foreground">건수 기준</b>입니다 (많이 팔린 품목이 상위에 오르기 쉬움)
        </p>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px flex flex-col items-start border-b-2 px-3 py-2 text-left whitespace-nowrap",
              tab === t.id ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="text-sm font-medium">{t.label}</span>
            <span className="text-[11px] text-muted-foreground">{t.desc}</span>
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="기준 주차">
          <Select value={String(f.anchorWeek)} onChange={(v) => update({ anchorWeek: Number(v) })} options={weekOptions} />
        </Field>
        {tab !== "weekly" && (
          <Field label="집계 범위">
            <Select
              value={rangeValue}
              onChange={(v) =>
                v === "custom"
                  ? update({ customStart: Math.max(0, f.anchorWeek - DEFAULT_RANGE_WEEKS + 1) })
                  : update({ rangeWeeks: Number(v), customStart: null })
              }
              options={RANGE_OPTIONS}
            />
          </Field>
        )}
        {tab !== "weekly" && f.customStart !== null && (
          <Field label="시작 주차">
            <Select
              value={String(f.customStart)}
              onChange={(v) => update({ customStart: Number(v) })}
              options={weekOptions.filter((o) => Number(o.value) <= f.anchorWeek)}
            />
          </Field>
        )}
        <Field label="제품군">
          <Select
            value={f.group}
            onChange={(v) => update({ group: v, product: null })}
            options={[{ value: ALL, label: "전체" }, ...allGroups(ds).map((g) => ({ value: g, label: g }))]}
          />
        </Field>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={f.includeXX} onChange={(e) => update({ includeXX: e.target.checked })} className="size-4 accent-current" />
          부품 미사용(출장만) 건 포함
        </label>
      </div>

      {tab === "detail" && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg bg-muted p-3">
          <Field label="품목">
            <Select
              className="max-w-80"
              value={f.product !== null ? String(f.product) : ""}
              onChange={(v) => update({ product: v === "" ? null : Number(v), symptom: null, cause: null })}
              options={[{ value: "", label: "품목 선택" }, ...productOptions]}
            />
          </Field>
          <Field label="증상">
            <Select value={f.symptom !== null ? String(f.symptom) : ALL} onChange={(v) => update({ symptom: toIdx(v) })} options={idxOptions(ds.symptoms)} />
          </Field>
          <Field label="원인">
            <Select value={f.cause !== null ? String(f.cause) : ALL} onChange={(v) => update({ cause: toIdx(v) })} options={idxOptions(ds.causes)} />
          </Field>
          <Field label="지역">
            <Select value={f.zone !== null ? String(f.zone) : ALL} onChange={(v) => update({ zone: toIdx(v) })} options={idxOptions(ds.zones)} />
          </Field>
        </div>
      )}

      {tab === "weekly" && <WeeklyView ds={ds} f={f} onSelectProduct={selectProduct} />}
      {tab === "select" && <SelectionView ds={ds} f={f} onSelectProduct={selectProduct} />}
      {tab === "detail" && <DetailView ds={ds} f={f} />}

      <footer className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
        사내 한정 자료입니다. AS 비용·부품 단가 등 회사 내부 정보가 포함되어 있으므로 외부 공유에 주의하십시오. · 집계 생성 {ds.meta.generated_at}
      </footer>
    </main>
  );
}
