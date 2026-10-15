"use client";

import { Loader2, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { LoginError, login } from "@/lib/secure";
import type { Dataset } from "@/lib/types";

export function LoginScreen({ onLogin }: { onLogin: (ds: Dataset, user: string) => void }) {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id.trim() || !password) {
      setError("아이디와 비밀번호를 입력하십시오.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { ds, user } = await login(id, password);
      onLogin(ds, user);
    } catch (err) {
      setError(err instanceof LoginError ? err.message : `로그인 중 오류가 발생했습니다. ${(err as Error).message}`);
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted">
            <LockKeyhole className="size-5" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">제품별 AS(불량) 현황</h1>
          <p className="text-sm text-muted-foreground">주간 품질회의용 사내 대시보드입니다. 발급받은 계정으로 로그인하십시오.</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-sm" noValidate>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            아이디
            <input
              className={input}
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoComplete="username"
              autoFocus
              disabled={busy}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            비밀번호
            <input
              className={input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-delta-bad">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex h-10 items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {busy ? "확인 중…" : "로그인"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
          계정 발급·비밀번호 변경은 대시보드 관리자에게 요청하십시오.
          <br />
          로그인 상태는 이 브라우저 탭을 닫으면 해제됩니다.
        </p>
      </div>
    </main>
  );
}
