import { createHmac, timingSafeEqual } from "node:crypto";

/** 세션 쿠키 이름. 계획 문서가 고정한 명세 값이다. */
export const SESSION_COOKIE_NAME = "wp_session";

/** 30일(초). 쿠키 maxAge와 토큰 exp 양쪽에 쓴다. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type SessionPayload = {
  readonly userId: string;
  /** 만료 시각(unix seconds). 만료된 토큰은 verifySession에서 null이 된다. */
  readonly exp: number;
};

function hmacSignature(payloadPart: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payloadPart).digest();
}

/** payload를 HMAC-SHA256으로 서명해 "base64url(payload).base64url(signature)" 토큰으로 직렬화한다. */
export function signSession(payload: SessionPayload, secret: string): string {
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = hmacSignature(payloadPart, secret).toString("base64url");
  return `${payloadPart}.${signature}`;
}

/**
 * 토큰을 검증해 payload를 돌려준다. 서명 불일치·만료·형식 오류는 예외가 아니라
 * null이라는 값으로 반환한다. 서명을 먼저 검증한 뒤에야 payload를 파싱한다.
 */
export function verifySession(token: string, secret: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const payloadPart = parts[0];
  const provided = Buffer.from(parts[1], "base64url");
  const expected = hmacSignature(payloadPart, secret);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!isSessionPayload(parsed)) return null;
  if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;
  return parsed;
}

function isSessionPayload(value: unknown): value is SessionPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "userId" in value &&
    typeof value.userId === "string" &&
    value.userId.length > 0 &&
    "exp" in value &&
    typeof value.exp === "number" &&
    Number.isFinite(value.exp)
  );
}

/** SESSION_SECRET을 읽는다. 폴백 상수를 두면 서명이 예측 가능해지므로 없으면 즉시 실패한다. */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret === undefined || secret.length === 0) {
    throw new Error(
      "SESSION_SECRET 환경변수가 설정되어 있지 않습니다. .env에 시크릿을 추가하세요 (.env.example 참고).",
    );
  }
  return secret;
}
