import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME, signSession, verifySession } from "@/lib/auth/session";

const SECRET = "unit-test-secret";
const ONE_HOUR_FROM_NOW = Math.floor(Date.now() / 1000) + 3_600;
const payload = { userId: "user_1", exp: ONE_HOUR_FROM_NOW } as const;

/** 시그니처 첫 문자를 확실히 다른 base64url 문자로 바꿔 서명을 변조한다. */
function tamperSignature(token: string): string {
  const [payload, signature] = token.split(".");
  const first = signature.charAt(0);
  const replacement = first === "A" ? "B" : "A";
  return `${payload}.${replacement}${signature.slice(1)}`;
}

describe("signSession → verifySession", () => {
  it("returns the original payload when the token is valid", () => {
    const token = signSession(payload, SECRET);

    expect(verifySession(token, SECRET)).toEqual(payload);
  });

  it("returns null when the token is expired", () => {
    const expired = { userId: "user_1", exp: Math.floor(Date.now() / 1000) - 1 } as const;
    const token = signSession(expired, SECRET);

    expect(verifySession(token, SECRET)).toBeNull();
  });

  it("returns null when the signature is tampered", () => {
    const token = signSession(payload, SECRET);
    const tampered = tamperSignature(token);

    expect(tampered).not.toBe(token);
    expect(verifySession(tampered, SECRET)).toBeNull();
  });

  it("returns null when the token was signed with a different secret", () => {
    const token = signSession(payload, "another-secret");

    expect(verifySession(token, SECRET)).toBeNull();
  });

  it("returns null when the payload body is tampered", () => {
    const token = signSession(payload, SECRET);
    const [signature] = token.split(".").slice(-1);
    const forgedPayload = Buffer.from(
      JSON.stringify({ userId: "victim", exp: ONE_HOUR_FROM_NOW }),
    ).toString("base64url");

    expect(verifySession(`${forgedPayload}.${signature}`, SECRET)).toBeNull();
  });

  it("returns null when the token has no signature section", () => {
    expect(verifySession("garbage-token", SECRET)).toBeNull();
  });

  it("pins the cookie name the plan and guard both dispatch on", () => {
    expect(SESSION_COOKIE_NAME).toBe("wp_session");
  });
});
