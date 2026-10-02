"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/ui/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type ApiResult = { readonly ok: boolean; readonly status: number; readonly body: unknown };

async function request(path: string, init?: RequestInit): Promise<ApiResult> {
  const response = await fetch(path, { credentials: "include", ...init });
  const body: unknown = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

/** API error 메시지(한국어)를 그대로 노출하고, 없으면 폴백 문구를 쓴다. */
function apiError(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const message = body.error;
    if (typeof message === "string") return message;
  }
  return fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    // signup은 성공 시 Set-Cookie로 자동 로그인되므로 두 모드 모두 /로 보낸다.
    const result = await request(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mode === "login" ? { email, password } : { name: name.trim(), email, password },
      ),
    });
    setPending(false);
    if (result.ok) {
      router.push("/");
      return;
    }
    setError(apiError(result.body, "요청에 실패했습니다. 다시 시도하세요."));
  }

  function switchMode(next: "login" | "signup"): void {
    setMode(next);
    setError(null);
  }

  return (
    <AppShell>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
        <PageHeader title={mode === "login" ? "로그인" : "회원가입"} />
        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === "signup" && (
              <Field label="이름">
                <input
                  required
                  className={inputClass}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
            )}
            <Field label="이메일">
              <input
                required
                type="email"
                autoComplete="email"
                className={inputClass}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="비밀번호">
              <input
                required
                type="password"
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className={inputClass}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            {error !== null && (
              <p role="alert" className="text-sm text-negative">
                {error}
              </p>
            )}
            <Button type="submit" disabled={pending} className="w-full">
              {mode === "login" ? "로그인" : "회원가입"}
            </Button>
          </form>
        </Card>
        <p className="text-center text-sm text-ink-muted">
          {mode === "login" ? (
            <>
              계정이 없으신가요?{" "}
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className="font-semibold text-ink underline underline-offset-4 hover:text-accent"
              >
                회원가입
              </button>
            </>
          ) : (
            <>
              이미 계정이 있으신가요?{" "}
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="font-semibold text-ink underline underline-offset-4 hover:text-accent"
              >
                로그인
              </button>
            </>
          )}
        </p>
      </main>
    </AppShell>
  );
}
