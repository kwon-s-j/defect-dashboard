"""전처리·화면 테스트용 가짜 AS처리 엑셀 생성 (실제 고객·금액 아님).

사용법:
    python scripts/make_sample_data.py <출력.xlsx> [--rows 8000]
"""

from __future__ import annotations

import argparse
import random
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

HEADERS = [
    "전문점코드", "전문점명", "접수일", "완료일", "년", "월", "번호", "제품코드", "제품코드명",
    "부품코드", "부품코드명", "라인", "AS대행료", "수량", "단가", "전문점출고가", "부품금액",
    "유무상(부품)", "고장내역", "증상", "원인", "조치", "유선전화", "휴대전화", "연락처", "비고",
    "주소1", "주소2", "주소3", "주소4", "지역", "고객명", "상호", "처리일수", "설치년월",
    "제조년월", "접수자", "기술사원명", "이관여부", "Serial", "작업시간", "작업대수",
    "기타비용상세항목", "기타비용금액", "첨부파일(Y/N)", "시간외근무(Y/N)", "유상출장비",
    "유상기술료", "금액수정사유", "고객서명(Y/N)", "시공여부(Y/N)", "수동여부(Y/N)",
]

# (제품코드, 제품명, 발생 가중치, [(부품코드, 부품명, 부품금액)], [증상])
PRODUCTS = [
    ("RWL-S1", "샘플 세면기", 3, [("L1-BODY", "세면기 본체", 400000)], ["크랙/실금", "파손"]),
    ("RK-S1", "샘플 싱크수전", 20, [("K1-HOSE", "호스뭉치", 19000), ("XX", "", 0)], ["호스처짐", "누수", "고정안됨"]),
    ("RB-S1", "샘플 비데", 14, [("B1-NOZ", "노즐유니트", 18000), ("B1-RC", "리모컨", 60000), ("XX", "", 0)], ["노즐안나옴", "작동안됨", "오동작"]),
    ("RB-S2", "샘플 도기일체형비데", 10, [("B2-FLUSH", "자동물내림장치", 38000), ("XX", "", 0)], ["누수", "배수불량", "작동안됨"]),
    ("RWC-S1", "샘플 양변기", 18, [("C1-VALVE", "볼탭", 8000), ("XX", "", 0)], ["누수", "지수안됨", "소음"]),
    ("RWU-S1", "샘플 소변기", 5, [("U1-SENSOR", "센서", 45000), ("XX", "", 0)], ["작동안됨", "누수"]),
    ("RF-S1", "샘플 수전", 9, [("F1-CART", "카트리지", 12000), ("XX", "", 0)], ["누수", "수압약"]),
    ("RBT-S1", "샘플 샤워", 6, [("T1-HEAD", "샤워헤드", 15000), ("XX", "", 0)], ["누수", "파손"]),
]
CAUSES = ["부품불량", "성능/기능저하", "시공불량", "사용미숙", "이상없음"]
ZONES = ["ZONE1", "ZONE2", "ZONE3"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("--rows", type=int, default=8000)
    args = ap.parse_args()

    rng = random.Random(42)
    start, end = date(2025, 1, 1), date(2026, 4, 30)
    span = (end - start).days
    weights = [p[2] for p in PRODUCTS]
    rows, case_no = [], 0
    while len(rows) < args.rows:
        code, name, _, parts, symptoms = rng.choices(PRODUCTS, weights)[0]
        # 후반부에 RB-S2 발생이 늘어나는 추세를 넣는다
        d = start + timedelta(days=int(span * (rng.random() ** (0.7 if code == "RB-S2" else 1.0))))
        serial = (d - date(1899, 12, 30)).days
        case_no += 1
        free = "N" if rng.random() < 0.6 else "Y"
        n_lines = 2 if rng.random() < 0.06 else 1
        symptom = rng.choice(symptoms)
        mfg = rng.choice([0, 0, 202306, 202312, 202406, 202412])
        inst_year = rng.choice([2019, 2021, 2023, 2024, 2025])
        inst = inst_year * 100 + rng.randint(1, 12)
        if inst_year == 2025 and inst % 100 > d.month and d.year == 2025:
            inst = 202501
        for line in range(1, n_lines + 1):
            pcode, pname, pcost = rng.choice(parts)
            row = dict.fromkeys(HEADERS, "")
            row.update({
                "전문점코드": 100000 + rng.randint(1, 30), "전문점명": "샘플전문점",
                "접수일": serial, "완료일": serial + rng.randint(0, 2),
                "년": d.year % 100, "월": d.month, "번호": case_no, "라인": line,
                "제품코드": code, "제품코드명": name, "부품코드": pcode, "부품코드명": pname,
                "AS대행료": rng.choice([13000, 18000, 25000]) if line == 1 else 0,
                "수량": 1, "부품금액": pcost, "유무상(부품)": free,
                "고장내역": f"{symptom} 증상 접수 테스트 문구 010-0000-0000 101동 1001호",
                "증상": symptom, "원인": rng.choice(CAUSES), "조치": "부품교환" if pcode != "XX" else "점검",
                "지역": rng.choice(ZONES), "처리일수": rng.randint(0, 3),
                "설치년월": inst, "제조년월": mfg,
            })
            rows.append(row)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows, columns=HEADERS).to_excel(args.out, sheet_name="AS처리", index=False)
    print(f"생성: {args.out} ({len(rows):,}행)")


if __name__ == "__main__":
    main()
