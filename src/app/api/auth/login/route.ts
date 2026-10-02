import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { attachSessionCookie } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

const INVALID_CREDENTIALS = "이메일 또는 비밀번호가 올바르지 않습니다.";

// 응답 시간 차 계정 열거 방지용. 사용자가 없어도 실제 해시와 같은 비용의 compare를 돌린다.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("wedding-plan-timing-equalizer", 10);

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
  // 이메일 존재 여부와 비밀번호 불일치를 같은 401 문구로 반환해 계정 열거를 막는다.
  // 사용자가 없을 때도 더미 해시 compare를 실행해 응답 시간으로 계정 존재를 추측하지 못게 한다.
  const passwordHash = user === null ? DUMMY_PASSWORD_HASH : user.passwordHash;
  const passwordMatches = await bcrypt.compare(password, passwordHash);
  if (user === null || !passwordMatches) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  return attachSessionCookie(
    NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } }),
    user.id,
  );
}
