// scripts/preprocess.py 가 생성하는 public/data/dashboard.json 구조

export interface Meta {
  generated_at: string;
  source_file: string;
  data_start: string;
  data_end: string;
  raw_rows: number;
  free_rows: number;
  free_cases: number;
  free_total_cost: number;
  xx_rows: number;
  mfg_missing_rate: number;
  install_missing_rate: number;
}

export interface Facts {
  w: number[]; // weeks 인덱스
  p: number[]; // products 인덱스
  pt: number[]; // parts 인덱스
  s: number[]; // symptoms 인덱스
  c: number[]; // causes 인덱스
  z: number[]; // zones 인덱스
  xx: number[]; // 1 = 부품 미사용(출장만)
  mfg: number[]; // 제조년월 YYYYMM, 0 = 결측
  mtf: number[]; // 설치 후 경과 개월, -1 = 결측
  n: number[]; // 부품 라인 수
  cases: number[]; // AS 건수(한 건이 여러 라인이면 라인당 1/라인수)
  fee: number[]; // AS대행료 합계(원)
  part: number[]; // 부품금액 합계(원)
}

export interface Dataset {
  meta: Meta;
  weeks: string[]; // 주 시작일(월요일) YYYY-MM-DD
  products: [code: string, name: string, group: string][];
  parts: [code: string, name: string][];
  symptoms: string[];
  causes: string[];
  zones: string[];
  facts: Facts;
  samples: Record<string, [date: string, symptom: string, cause: string, text: string][]>;
}

export interface Filters {
  anchorWeek: number; // 기준 주차(인덱스)
  rangeWeeks: number; // 집계 범위(주). 0 = 전체
  customStart: number | null; // 직접 지정 시작 주차
  group: string; // "" = 전체
  includeXX: boolean;
  product: number | null;
  symptom: number | null;
  cause: number | null;
  zone: number | null;
}

export interface Totals {
  cases: number;
  cost: number;
  xxCases: number;
}

export interface ProductStat {
  p: number;
  cases: number;
  cost: number;
  unitCost: number;
  score: number;
  rank: number; // 1부터. 0 = 순위 제외(표본 부족)
  topSymptom: number | null;
}
