import { NextResponse } from "next/server";
import { PROJECT_VENDOR_STATUS } from "../../../../../../../generated/prisma/client";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

const PROJECT_VENDOR_STATUSES = Object.values(PROJECT_VENDOR_STATUS);

type MemoFieldResult =
  | { readonly ok: true; readonly value: string | null | undefined }
  | { readonly ok: false; readonly error: string };

/**
 * PUT 3상태: undefined=변경 없음(부분 갱신), 공백뿐 문자열=null(메모 삭제),
 * 문자열=치환, 500자 초과=에러. null을 명시적으로 받는 이유는 메모 지우기 때문이다.
 */
function memoField(value: unknown): MemoFieldResult {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, error: "memo은(는) 문자열 또는 null이어야 합니다." };
  }
  if (value.trim().length > 500) {
    return { ok: false, error: "memo은(는) 500자 이하여야 합니다." };
  }
  const trimmed = value.trim();
  return { ok: true, value: trimmed.length === 0 ? null : trimmed };
}

function isProjectVendorStatus(value: string): value is PROJECT_VENDOR_STATUS {
  return PROJECT_VENDOR_STATUSES.some((candidate) => candidate === value);
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string; pvId: string }> },
): Promise<NextResponse> {
  const { id, pvId } = await ctx.params;
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const owned = await requireProjectOwner(id, auth.value.id);
  if (!owned.ok) return owned.response;

  // pv가 이 프로젝트 소속인지 동시에 확인한다. 남의 pv 조회도 404로 숨긴다.
  const pv = await prisma.project_vendors.findFirst({ where: { id: pvId, projectId: id } });
  if (pv === null) {
    return NextResponse.json({ error: "등록된 업체를 찾을 수 없습니다." }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }
  if (typeof raw !== "object" || raw === null) {
    return NextResponse.json({ error: "isFavorite, status 또는 memo를 입력하세요." }, { status: 400 });
  }

  const isFavorite = "isFavorite" in raw ? raw.isFavorite : undefined;
  if (isFavorite !== undefined && typeof isFavorite !== "boolean") {
    return NextResponse.json({ error: "isFavorite은(는) boolean이어야 합니다." }, { status: 400 });
  }
  const status = "status" in raw ? raw.status : undefined;
  if (status !== undefined && (typeof status !== "string" || !isProjectVendorStatus(status))) {
    return NextResponse.json({ error: "올바르지 않은 status입니다." }, { status: 400 });
  }
  const memo = memoField("memo" in raw ? raw.memo : undefined);
  if (!memo.ok) return NextResponse.json({ error: memo.error }, { status: 400 });
  if (isFavorite === undefined && status === undefined && memo.value === undefined) {
    return NextResponse.json({ error: "isFavorite, status 또는 memo를 입력하세요." }, { status: 400 });
  }

  const updated = await prisma.project_vendors.update({
    where: { id: pv.id },
    data: {
      isFavorite: isFavorite ?? pv.isFavorite,
      status: status ?? pv.status,
      // memo의 null은 "메모 삭제" 의도라 ??로 기존값을 채우지 않는다.
      memo: memo.value === undefined ? pv.memo : memo.value,
    },
    include: { vendor: true },
  });
  return NextResponse.json(updated);
}
