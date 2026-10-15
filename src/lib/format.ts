const won = new Intl.NumberFormat("ko-KR");

export function fmtCount(v: number): string {
  return won.format(Math.round(v));
}

/** 원 단위 금액을 만원/억원으로 축약 */
export function fmtMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)}억 원`;
  if (abs >= 1e4) return `${won.format(Math.round(v / 1e4))}만 원`;
  return `${won.format(Math.round(v))}원`;
}

export function fmtWon(v: number): string {
  return `${won.format(Math.round(v))}원`;
}

export function fmtPct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "–";
  return `${(v * 100).toFixed(digits)}%`;
}

/** 증감률. 기준이 0이면 null */
export function changeRate(cur: number, base: number): number | null {
  if (!base) return null;
  return (cur - base) / base;
}

export function fmtWeek(start: string): string {
  const d = new Date(`${start}T00:00:00`);
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const md = (x: Date) => `${x.getMonth() + 1}/${x.getDate()}`;
  return `${d.getFullYear()} ${md(d)}~${md(end)}`;
}

export function fmtWeekShort(start: string): string {
  const d = new Date(`${start}T00:00:00`);
  return `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtYm(ym: number): string {
  return `${Math.floor(ym / 100)}-${String(ym % 100).padStart(2, "0")}`;
}
