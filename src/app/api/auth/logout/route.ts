import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/guard";

/** 세션 쿠키를 maxAge=0으로 덮어써 즉시 만료시킨다. 멱등 — 쿠키가 없어도 성공. */
export async function POST(): Promise<NextResponse> {
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
