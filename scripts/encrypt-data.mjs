// 집계 JSON(평문) → 로그인 계정별로 열 수 있는 암호화 파일 생성
//
// - 평문: data/dashboard.json (gitignore, 저장소에 올라가지 않음)
// - 결과: public/data/dashboard.enc.json (게시 대상)
// - 계정: 환경변수 DASHBOARD_USERS="아이디1:비밀번호1;아이디2:비밀번호2" (.env 파일 또는 셸 환경변수)
//
// 방식: 무작위 데이터 키(AES-256-GCM)로 데이터를 암호화하고,
//       계정별 비밀번호에서 PBKDF2(SHA-256)로 만든 키로 데이터 키를 감싼다.
//       아이디는 SHA-256 해시로만 저장한다.
//
// 약한 비밀번호(10자 미만): ALLOW_WEAK_PASSWORDS=1 일 때만 허용하며, 결과 파일에 weak 표시를 남겨
//                         배포 워크플로가 게시를 거부한다 (내 PC 테스트 전용).
//
// 사용법: node scripts/encrypt-data.mjs [평문.json] [결과.json]

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { webcrypto as crypto } from "node:crypto";
import { gzipSync } from "node:zlib";

const ITERATIONS = 600_000;
const MIN_PASSWORD_LENGTH = 10;

const src = process.argv[2] ?? "data/dashboard.json";
const out = process.argv[3] ?? "public/data/dashboard.enc.json";

if (existsSync(".env") && typeof process.loadEnvFile === "function") process.loadEnvFile(".env");

const raw = process.env.DASHBOARD_USERS ?? "";
const users = raw
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((pair) => {
    const i = pair.indexOf(":");
    return i < 0 ? null : { id: pair.slice(0, i).trim(), password: pair.slice(i + 1) };
  });

function fail(msg) {
  console.error(`[오류] ${msg}`);
  process.exit(1);
}

if (!users.length) fail('DASHBOARD_USERS 가 비어 있습니다. .env 에 DASHBOARD_USERS="아이디:비밀번호;..." 형식으로 지정하십시오.');
if (users.some((u) => !u || !u.id)) fail("DASHBOARD_USERS 형식이 잘못되었습니다 (아이디:비밀번호;...).");
const weak = users.filter((u) => u.password.length < MIN_PASSWORD_LENGTH).map((u) => u.id);
const allowWeak = process.env.ALLOW_WEAK_PASSWORDS === "1";
if (weak.length && !allowWeak) fail(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다: ${weak.join(", ")}`);
if (weak.length) console.warn(`[경고] 약한 비밀번호 계정: ${weak.join(", ")} — 테스트 전용 파일로 표시되어 배포가 거부됩니다.`);
if (!existsSync(src)) fail(`평문 집계 파일이 없습니다: ${src} (scripts/preprocess.py 로 먼저 생성)`);

const enc = new TextEncoder();
const b64 = (buf) => Buffer.from(buf).toString("base64");
const normalizeId = (id) => id.trim().toLowerCase();

async function sha256Hex(text) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Buffer.from(h).toString("hex");
}

async function deriveKek(password, salt) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

const plain = gzipSync(readFileSync(src));
const dataKey = crypto.getRandomValues(new Uint8Array(32));
const dataKeyObj = await crypto.subtle.importKey("raw", dataKey, "AES-GCM", false, ["encrypt"]);
const dataIv = crypto.getRandomValues(new Uint8Array(12));
const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: dataIv }, dataKeyObj, plain);

const entries = {};
for (const u of users) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const kek = await deriveKek(u.password, salt);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, dataKey);
  entries[await sha256Hex(normalizeId(u.id))] = { salt: b64(salt), iv: b64(iv), key: b64(wrapped) };
}

const payload = {
  v: 1,
  ...(weak.length ? { weak: true } : {}),
  kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITERATIONS },
  compression: "gzip",
  users: entries,
  iv: b64(dataIv),
  data: b64(cipher),
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(payload));
console.log(`암호화 완료: ${out} (${Math.round(JSON.stringify(payload).length / 1024)} KB, 계정 ${users.length}개)`);
