# 제품별 AS(불량) 현황 대시보드

주간 품질회의에서 **발생 건수 × AS 비용** 기준으로 개선 대상 상위 10개 품목을 정하고, 원인을 파고드는 정적 대시보드입니다.
설계서: `../dashboard-prd.md`

> 사내 한정 자료입니다. AS 비용·부품 단가 등 회사 내부 정보가 포함됩니다.

## 화면

| 화면 | 목적 | 바로가기 |
|------|------|----------|
| 주간 AS 현황 | 이번 주 이상 여부 확인, 상위 10개 변동 | `#weekly` |
| 개선 대상 선정 | 발생 × 비용 종합점수로 10개 확정 | `#select` |
| 품목 원인 분석 | 증상·원인·부품·제조년월·설치 경과 | `#detail` |

## 구조

```
scripts/preprocess.py        원본 엑셀 → data/dashboard.json (평문 집계, 개인정보 컬럼은 읽지 않음)
scripts/encrypt-data.mjs     평문 집계 → public/data/dashboard.enc.json (로그인 계정별 암호화)
scripts/product_groups.json  제품코드 접두어 → 제품군 매핑 (수정 가능)
scripts/make_sample_data.py  테스트용 가짜 데이터 생성
src/lib/analytics.ts         집계·종합점수 (가중치·최소 표본 상수)
src/lib/insights.ts          인사이트 탐지 조건
src/lib/secure.ts            로그인·복호화·세션
src/components/              화면 3개
.github/workflows/deploy.yml GitHub Pages 배포
```

## 로그인 (계정별 아이디·비밀번호)

GitHub Pages는 정적 호스팅이라 서버 로그인이 없습니다. 대신 **집계 데이터를 로그인 정보로 암호화**해 게시합니다.
로그인 화면 없이 파일 주소로 직접 받아도 암호문이라 내용을 볼 수 없습니다.

- 방식: 데이터 키(AES-256-GCM)로 집계를 암호화하고, 계정별 비밀번호(PBKDF2-SHA256 60만 회)로 데이터 키를 감쌉니다. 아이디는 해시로만 저장합니다.
- 계정 관리: `.env` 의 `DASHBOARD_USERS="아이디1:비밀번호1;아이디2:비밀번호2"` (커밋 금지, 비밀번호 10자 이상, `;` 사용 불가)
- 계정 추가·삭제·비밀번호 변경: `.env` 수정 → `npm run encrypt` → `public/data/dashboard.enc.json` 커밋. 데이터 키가 새로 만들어지므로 기존 로그인 세션은 만료됩니다.
- 로그인 상태는 브라우저 탭을 닫으면 해제됩니다(sessionStorage).
- 한계: 로그인 시도 횟수 제한이 없습니다(서버가 없음). 추측하기 어려운 긴 비밀번호를 쓰고, 퇴사·이동 시 바로 재암호화하십시오.

## 주간 데이터 갱신 (1단계: 수동)

1. OneDrive에서 최신 AS처리 엑셀을 내려받아 `data/raw/` 에 둡니다 (`data/` 는 .gitignore 처리 — 커밋되지 않음).
2. 집계 → 암호화:
   ```bash
   python scripts/preprocess.py "data/raw/<파일명>.xlsx"   # → data/dashboard.json (평문, 커밋 안 됨)
   npm run encrypt                                         # → public/data/dashboard.enc.json
   ```
   전처리 출력의 무상 건수·총비용을 기존 피벗 값과 대조합니다.
3. `public/data/dashboard.enc.json` 만 커밋·푸시하면 GitHub Actions가 빌드·배포합니다.

필요 패키지: `pandas`, `openpyxl` (Python), Node 20.12 이상

## 로컬 실행

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # out/ 정적 결과물
```

## 배포 (royalnco GitHub Pages)

1. royalnco 조직에 저장소 생성(Private) 후 이 폴더를 루트로 푸시
2. Settings → Pages → Source: **GitHub Actions**
3. Settings → Pages → Visibility: **Private** (조직 구성원만 열람 — GitHub Enterprise Cloud 필요, 정보관리팀 확인)
4. basePath 는 Actions의 `configure-pages` 가 자동 지정

## 기준 (설계서 3·4장)

- 무상(유무상(부품)=N) AS만 집계, AS 건 = 전문점코드+년+월+번호
- 종합점수 = 건수 백분위 × 50% + 비용 백분위 × 50%, 기간 내 5건 미만 품목 제외
- 판매수량 미반영 → 불량률이 아닌 건수 기준
