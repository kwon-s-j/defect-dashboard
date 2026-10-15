"""AS처리 원본 엑셀 → 대시보드용 집계 JSON 변환.

- 개인정보 컬럼(고객명·연락처·주소 등)은 애초에 읽지 않는다 (usecols 화이트리스트).
- 고장내역 원문 샘플은 전화번호·동호수 패턴을 마스킹한다.
- 무상(유무상(부품)=N) 건만 집계한다.

사용법:
    python scripts/preprocess.py <원본.xlsx> [--out data/dashboard.json]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

SHEET = "AS처리"
EXCEL_EPOCH = pd.Timestamp("1899-12-30")

# 읽을 컬럼 화이트리스트. 개인정보 컬럼은 여기에 넣지 않는다.
USECOLS = [
    "전문점코드", "접수일", "년", "월", "번호", "라인",
    "제품코드", "제품코드명", "부품코드", "부품코드명",
    "AS대행료", "부품금액", "유무상(부품)",
    "고장내역", "증상", "원인", "조치",
    "지역", "처리일수", "설치년월", "제조년월",
]
PII_COLUMNS = {"유선전화", "휴대전화", "연락처", "주소1", "주소2", "주소3", "주소4",
               "고객명", "상호", "Serial", "비고"}

PHONE_RE = re.compile(r"0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}")
UNIT_RE = re.compile(r"\d+\s*동\s*\d+\s*호|\d+\s*-\s*\d+\s*호|@?\d{2,4}\s*-\s*\d{2,5}")
SAMPLES_PER_PRODUCT = 5
SAMPLE_MAX_LEN = 120


def mask_text(text: str) -> str:
    text = PHONE_RE.sub("[전화]", text)
    text = UNIT_RE.sub("[주소]", text)
    return text[:SAMPLE_MAX_LEN]


def to_date(series: pd.Series) -> pd.Series:
    if pd.api.types.is_datetime64_any_dtype(series):
        return series.dt.normalize()
    num = pd.to_numeric(series, errors="coerce")
    return EXCEL_EPOCH + pd.to_timedelta(num, unit="D")


def to_ym(series: pd.Series) -> pd.Series:
    """YYYYMM 정수 → 그대로, 0·결측·범위 밖 → 0."""
    num = pd.to_numeric(series, errors="coerce").fillna(0).astype(int)
    valid = (num >= 198001) & (num <= 209912) & ((num % 100).between(1, 12))
    return num.where(valid, 0)


def load_groups(path: Path):
    cfg = json.loads(path.read_text(encoding="utf-8"))
    rules = [(r["prefix"].upper(), r["group"]) for r in cfg["rules"]]

    def group_of(code: str) -> str:
        code = code.upper()
        for prefix, group in rules:
            if code.startswith(prefix):
                return group
        return cfg["default"]

    return group_of


def encode(values: pd.Series):
    """범주형 → (사전 리스트, 인덱스 배열). 사전은 빈도 내림차순."""
    order = values.value_counts().index.tolist()
    index = {v: i for i, v in enumerate(order)}
    return order, values.map(index).astype(int)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=Path)
    ap.add_argument("--out", type=Path, default=Path("data/dashboard.json"))
    args = ap.parse_args()

    here = Path(__file__).resolve().parent
    group_of = load_groups(here / "product_groups.json")

    header = pd.read_excel(args.source, sheet_name=SHEET, nrows=0).columns.tolist()
    missing = [c for c in USECOLS if c not in header]
    if missing:
        print(f"[오류] 필요한 컬럼이 없습니다: {missing}", file=sys.stderr)
        return 1
    assert not PII_COLUMNS.intersection(USECOLS), "개인정보 컬럼이 화이트리스트에 포함됨"

    print(f"읽는 중: {args.source.name} / 시트 {SHEET}")
    df = pd.read_excel(args.source, sheet_name=SHEET, usecols=USECOLS, dtype=str)
    raw_rows = len(df)
    df = df.dropna(subset=["제품코드", "접수일"])

    for col in ["AS대행료", "부품금액", "처리일수"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).round().astype(int)
    df["received"] = to_date(df["접수일"])
    df = df.dropna(subset=["received"])
    df["유무상(부품)"] = df["유무상(부품)"].fillna("").str.strip().str.upper()

    free = df[df["유무상(부품)"] == "N"].copy()
    for col in ["제품코드", "제품코드명", "부품코드", "부품코드명", "증상", "원인", "조치", "지역"]:
        free[col] = free[col].fillna("").astype(str).str.strip()
    free["부품코드"] = free["부품코드"].replace("", "XX")
    free.loc[free["증상"] == "", "증상"] = "미분류"
    free.loc[free["원인"] == "", "원인"] = "미분류"
    free.loc[free["지역"] == "", "지역"] = "미분류"

    # AS 건 식별 키: 전문점코드+년+월+번호 (한 건이 여러 부품 라인으로 나뉨)
    free["as_id"] = free[["전문점코드", "년", "월", "번호"]].astype(str).agg("|".join, axis=1)
    lines_per_case = free.groupby("as_id")["as_id"].transform("size")
    free["case_w"] = 1.0 / lines_per_case
    free["xx"] = (free["부품코드"].str.upper() == "XX").astype(int)

    # 주차: 접수일이 속한 주의 월요일
    free["week"] = (free["received"] - pd.to_timedelta(free["received"].dt.weekday, unit="D")).dt.strftime("%Y-%m-%d")
    free["mfg"] = to_ym(free["제조년월"])
    free["inst"] = to_ym(free["설치년월"])
    recv_ym = free["received"].dt.year * 12 + free["received"].dt.month - 1
    inst_months = (free["inst"] // 100) * 12 + (free["inst"] % 100) - 1
    mtf = recv_ym - inst_months
    free["mtf"] = mtf.where((free["inst"] > 0) & (mtf >= 0) & (mtf <= 600), -1).astype(int)

    # 사전 인코딩
    names = (free.groupby("제품코드")["제품코드명"]
             .agg(lambda s: s.value_counts().index[0]).to_dict())
    product_codes, free["p"] = encode(free["제품코드"])
    products = [[c, names.get(c, ""), group_of(c)] for c in product_codes]
    part_names = (free.groupby("부품코드")["부품코드명"]
                  .agg(lambda s: s.value_counts().index[0]).to_dict())
    part_codes, free["pt"] = encode(free["부품코드"])
    parts = [[c, part_names.get(c, "")] for c in part_codes]
    symptoms, free["s"] = encode(free["증상"])
    causes, free["c"] = encode(free["원인"])
    zones, free["z"] = encode(free["지역"])

    weeks_all = pd.date_range(free["week"].min(), free["week"].max(), freq="7D").strftime("%Y-%m-%d").tolist()
    week_index = {w: i for i, w in enumerate(weeks_all)}
    free["w"] = free["week"].map(week_index)

    keys = ["w", "p", "pt", "s", "c", "z", "xx", "mfg", "mtf"]
    agg = (free.groupby(keys, sort=True)
           .agg(n=("as_id", "size"), cases=("case_w", "sum"),
                fee=("AS대행료", "sum"), part=("부품금액", "sum"))
           .reset_index())
    facts = {k: agg[k].astype(int).tolist() for k in keys + ["n", "fee", "part"]}
    facts["cases"] = agg["cases"].round(4).tolist()

    # 고장내역 샘플 (최근 접수순, 품목당 최대 5건, 마스킹)
    samples: dict[str, list] = {}
    text_rows = free[free["고장내역"].notna() & (free["라인"].astype(str).str.strip() == "1")]
    text_rows = text_rows.sort_values("received", ascending=False)
    for p_idx, grp in text_rows.groupby("p"):
        samples[str(p_idx)] = [
            [r.received.strftime("%Y-%m-%d"), symptoms[r.s], causes[r.c], mask_text(str(r.고장내역))]
            for r in grp.head(SAMPLES_PER_PRODUCT).itertuples()
        ]

    last_date = free["received"].max()
    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_file": args.source.name,
        "data_start": free["received"].min().strftime("%Y-%m-%d"),
        "data_end": last_date.strftime("%Y-%m-%d"),
        "raw_rows": int(raw_rows),
        "free_rows": int(len(free)),
        "free_cases": int(free["as_id"].nunique()),
        "free_total_cost": int(free["AS대행료"].sum() + free["부품금액"].sum()),
        "xx_rows": int(free["xx"].sum()),
        "mfg_missing_rate": round(float((free["mfg"] == 0).mean()), 4),
        "install_missing_rate": round(float((free["inst"] == 0).mean()), 4),
    }

    out = {
        "meta": meta,
        "weeks": weeks_all,
        "products": products,
        "parts": parts,
        "symptoms": symptoms,
        "causes": causes,
        "zones": zones,
        "facts": facts,
        "samples": samples,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    size_kb = args.out.stat().st_size / 1024
    print(f"완료: {args.out} ({size_kb:,.0f} KB, 집계 {len(agg):,}행)")
    print(f"  원본 {raw_rows:,}행 → 무상 {meta['free_rows']:,}행 / {meta['free_cases']:,}건")
    print(f"  무상 총비용 {meta['free_total_cost']:,}원, XX 행 {meta['xx_rows']:,}")
    print(f"  기간 {meta['data_start']} ~ {meta['data_end']}")
    print("  기존 피벗 시트의 무상 건수·총비용과 대조하십시오.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
