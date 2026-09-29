import { NextResponse } from "next/server";
import { searchVendors } from "@/lib/adapters/kakao";
import { requireUser } from "@/lib/auth/guard";

const MANUAL_FALLBACK_MESSAGE = "API 키가 없거나 실패했습니다. 수치 등록을 이용해 주세요";

/** 인증 → q 경계 파싱 → 카카오 검색. 카카오 실패는 401·400과 달리 200 fallback이다. */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length === 0) {
    return NextResponse.json({ error: "q 쿼리 파라미터를 입력하세요." }, { status: 400 });
  }

  const result = await searchVendors(q);
  if (!result.ok) {
    // 키 부재·API 실패는 에러가 아니라 수동 등록으로 유도하는 정상 응답이다.
    return NextResponse.json({ results: [], fallback: "manual", message: MANUAL_FALLBACK_MESSAGE });
  }
  return NextResponse.json({ results: result.results, fallback: "kakao" });
}
