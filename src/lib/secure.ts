// 암호화된 집계 파일(scripts/encrypt-data.mjs 생성)을 로그인 정보로 복호화한다.
import type { Dataset } from "./types";

export const ENC_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/dashboard.enc.json`;
const SESSION_KEY = "as-dashboard-session";

interface EncPayload {
  v: number;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number };
  compression: "gzip";
  users: Record<string, { salt: string; iv: string; key: string }>;
  iv: string;
  data: string;
}

export class LoginError extends Error {}

const enc = new TextEncoder();
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));

let payloadCache: Promise<EncPayload> | null = null;
function loadPayload(): Promise<EncPayload> {
  payloadCache ??= fetch(ENC_URL, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error(`데이터 파일을 불러오지 못했습니다 (${r.status})`);
    return r.json();
  });
  return payloadCache;
}

async function sha256Hex(text: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function decryptData(p: EncPayload, rawKey: ArrayBuffer): Promise<Dataset> {
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  const gz = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(p.iv) }, key, fromB64(p.data));
  const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text()) as Dataset;
}

export async function login(id: string, password: string): Promise<{ ds: Dataset; user: string }> {
  const p = await loadPayload();
  const user = id.trim().toLowerCase();
  const entry = p.users[await sha256Hex(user)];
  const invalid = new LoginError("아이디 또는 비밀번호가 올바르지 않습니다.");
  if (!entry) throw invalid;

  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  const kek = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(entry.salt), iterations: p.kdf.iterations, hash: p.kdf.hash },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  let rawKey: ArrayBuffer;
  try {
    rawKey = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(entry.iv) }, kek, fromB64(entry.key));
  } catch {
    throw invalid;
  }
  const ds = await decryptData(p, rawKey);
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user, key: toB64(rawKey) }));
  } catch {
    // 저장소 사용 불가(사생활 보호 모드 등) — 새로고침 시 다시 로그인
  }
  return { ds, user };
}

/** 같은 탭에서 이미 로그인했으면 다시 묻지 않는다 (탭을 닫으면 만료) */
export async function restoreSession(): Promise<{ ds: Dataset; user: string } | null> {
  let saved: { user: string; key: string } | null = null;
  try {
    const s = sessionStorage.getItem(SESSION_KEY);
    saved = s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
  if (!saved) return null;
  try {
    const ds = await decryptData(await loadPayload(), fromB64(saved.key).buffer as ArrayBuffer);
    return { ds, user: saved.user };
  } catch {
    logout(); // 데이터가 다시 암호화되어 키가 바뀐 경우
    return null;
  }
}

export function logout() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // 무시
  }
}
