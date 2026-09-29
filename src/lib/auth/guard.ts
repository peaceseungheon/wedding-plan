import { NextResponse } from "next/server";
import type { wedding_projects } from "../../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  getSessionSecret,
  signSession,
  verifySession,
  type SessionPayload,
} from "./session";

/** 비밀번호 해시가 새지 않게 가드 밖으로 노출하는 사용자 필드를 여기서 고정한다. */
export type SessionUser = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
};

/**
 * 가드 결과. ok=false면 response가 이미 완성된 401/404 JSON이므로
 * 호출부는 성공 시 value, 실패 시 response를 그대로 반환만 하면 된다.
 */
export type GuardResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly response: NextResponse };

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
}

function readSessionToken(req: Request): string | null {
  const header = req.headers.get("cookie");
  if (header === null) return null;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() === SESSION_COOKIE_NAME) {
      return pair.slice(separator + 1).trim();
    }
  }
  return null;
}

/** 쿠키 세션에서 로그인 사용자를 얻는다. 미인증·만료·변조·삭제된 사용자는 모두 401. */
export async function requireUser(req: Request): Promise<GuardResult<SessionUser>> {
  const token = readSessionToken(req);
  if (token === null) return { ok: false, response: unauthorized() };

  const payload = verifySession(token, getSessionSecret());
  if (payload === null) return { ok: false, response: unauthorized() };

  const user = await prisma.users.findUnique({ where: { id: payload.userId } });
  if (user === null) return { ok: false, response: unauthorized() };

  return { ok: true, value: { id: user.id, email: user.email, name: user.name } };
}

/**
 * 프로젝트 소유자만 통과한다. 소유가 아니어도 403이 아니라 404를 돌려
 * 존재 자체를 숨긴다 — 다른 사용자의 projectId를 추측으로 훑지 못하게 한다.
 */
export async function requireProjectOwner(
  projectId: string,
  userId: string,
): Promise<GuardResult<wedding_projects>> {
  const project = await prisma.wedding_projects.findFirst({
    where: { id: projectId, userId },
  });
  if (project === null) {
    return {
      ok: false,
      response: NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 }),
    };
  }
  return { ok: true, value: project };
}

/** 가입/로그인 성공 응답에 30일 서명 세션 쿠키를 심는다. */
export function attachSessionCookie(res: NextResponse, userId: string): NextResponse {
  const payload: SessionPayload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: signSession(payload, getSessionSecret()),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    // 로컬 http 개발에서 쿠키가 유실되지 않게 프로덕션(https)에서만 secure.
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

/** 로그아웃: 같은 속성으로 maxAge=0 쿠키를 심어 브라우저에서 즉시 만료시킨다. */
export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
