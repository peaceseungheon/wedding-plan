import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { attachSessionCookie } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

const INVALID_CREDENTIALS = "이메일 또는 비밀번호가 올바르지 않습니다.";

export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  if (typeof raw !== "object" || raw === null || !("email" in raw) || !("password" in raw)) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }
  const { email, password } = raw;
  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  const user = await prisma.users.findUnique({ where: { email } });
  const passwordMatches =
    user !== null && (await bcrypt.compare(password, user.passwordHash));
  // 이메일 존재 여부와 비밀번호 불일치를 같은 401 문구로 반환해 계정 열거를 막는다.
  if (user === null || !passwordMatches) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  return attachSessionCookie(
    NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } }),
    user.id,
  );
}
