import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { attachSessionCookie } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

type ValidSignup = {
  readonly email: string;
  readonly password: string;
  readonly name: string;
};

function validateSignup(raw: unknown): { readonly ok: true; readonly value: ValidSignup } | {
  readonly ok: false;
  readonly error: string;
} {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "email, password, name을 입력하세요." };
  }
  if (!("email" in raw) || !("password" in raw) || !("name" in raw)) {
    return { ok: false, error: "email, password, name을 입력하세요." };
  }
  const { email, password, name } = raw;
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "올바른 이메일 형식이 아닙니다." };
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: "비밀번호는 8자 이상이어야 합니다." };
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    return { ok: false, error: "이름을 입력하세요." };
  }
  return { ok: true, value: { email, password, name: name.trim() } };
}

function isUniqueEmailViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  const validated = validateSignup(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(validated.value.password, BCRYPT_ROUNDS);
  try {
    const user = await prisma.users.create({
      data: {
        email: validated.value.email,
        passwordHash,
        name: validated.value.name,
      },
    });
    return attachSessionCookie(
      NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } }),
      user.id,
    );
  } catch (error) {
    // 유니크 제약(users_email_key)이 중복 판정의 권위다. find-then-create 선검사 없이
    // 이 한 군데서 409로 변환하면 경쟁 상태에서도 같은 응답을 보장한다.
    if (isUniqueEmailViolation(error)) {
      return NextResponse.json({ error: "이미 가입된 이메일입니다." }, { status: 409 });
    }
    throw error;
  }
}
