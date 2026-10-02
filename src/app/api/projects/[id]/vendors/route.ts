import { NextResponse } from "next/server";
import { VENDOR_CATEGORY, type vendors } from "../../../../../../generated/prisma/client";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

const VENDOR_CATEGORIES = Object.values(VENDOR_CATEGORY);

type VendorInput = {
  readonly kakaoPlaceId?: string;
  readonly placeName?: string;
  readonly address?: string;
  readonly category?: string;
  readonly phone?: string;
};

type StringFieldResult =
  | { readonly ok: true; readonly value: string | undefined }
  | { readonly ok: false; readonly error: string };

type VendorResolution =
  | { readonly ok: true; readonly vendor: vendors }
  | { readonly ok: false; readonly status: 400 | 409; readonly error: string };

type MemoFieldResult =
  | { readonly ok: true; readonly value: string | null | undefined }
  | { readonly ok: false; readonly error: string };

/** 없음=ok+undefined, 빈 문자열·문자열 외 타입=ok=false. 경계에서 한 번만 검증한다. */
function stringField(value: unknown, label: string): StringFieldResult {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, error: `${label}은(는) 비어 있지 않은 문자열이어야 합니다.` };
  }
  return { ok: true, value };
}

/**
 * undefined=미제공, 공백뿐 문자열=null(빈 메모 저장 안 함), 500자 초과=에러.
 * null은 "메모 없음"으로 저장한다(스키마 memo String?).
 */
function memoField(value: unknown): MemoFieldResult {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, error: "memo은(는) 문자열이어야 합니다." };
  }
  if (value.trim().length > 500) {
    return { ok: false, error: "memo은(는) 500자 이하여야 합니다." };
  }
  const trimmed = value.trim();
  return { ok: true, value: trimmed.length === 0 ? null : trimmed };
}

function isVendorCategory(value: string): value is VENDOR_CATEGORY {
  return VENDOR_CATEGORIES.some((candidate) => candidate === value);
}

/**
 * kakaoPlaceId가 있으면 기존 업체를 재사용하고(@unique), 없으면 새로 만든다.
 * 수동 등록 업체는 kakaoPlaceId가 null로 남는다.
 * 신규 kakaoPlaceId의 동시 최초등록 경합은 create의 P2002를 catch해 승자 행을
 * 재조회해 재사용하고, 재조회마저 실패하면 409로 수렴시켜 500 누출을 막는다.
 */
async function resolveVendor(input: VendorInput): Promise<VendorResolution> {
  if (input.kakaoPlaceId !== undefined) {
    const existing = await prisma.vendors.findUnique({ where: { kakaoPlaceId: input.kakaoPlaceId } });
    if (existing !== null) return { ok: true, vendor: existing };
    const { placeName, category } = input;
    if (placeName === undefined || category === undefined) {
      return {
        ok: false,
        status: 400,
        error: "등록되지 않은 카카오 장소입니다. placeName과 category를 함께 입력하세요.",
      };
    }
    if (!isVendorCategory(category)) {
      return { ok: false, status: 400, error: "올바른 category가 아닙니다." };
    }
    try {
      const created = await prisma.vendors.create({
        data: {
          kakaoPlaceId: input.kakaoPlaceId,
          name: placeName.trim(),
          category,
          address: input.address ?? null,
          phone: input.phone ?? null,
        },
      });
      return { ok: true, vendor: created };
    } catch (error) {
      // 위반 가능한 유니크는 kakaoPlaceId뿐이므로 P2002면 경합에서 진 것이다.
      if (!isUniqueViolation(error)) throw error;
      const raced = await prisma.vendors.findUnique({ where: { kakaoPlaceId: input.kakaoPlaceId } });
      if (raced !== null) return { ok: true, vendor: raced };
      return { ok: false, status: 409, error: "이미 등록된 업체입니다." };
    }
  }

  const { placeName, address, category } = input;
  if (placeName === undefined || address === undefined || category === undefined) {
    return { ok: false, status: 400, error: "placeName, address, category를 입력하세요." };
  }
  if (!isVendorCategory(category)) {
    return { ok: false, status: 400, error: "올바른 category가 아닙니다." };
  }
  const created = await prisma.vendors.create({
    data: {
      name: placeName.trim(),
      category,
      address,
      phone: input.phone ?? null,
    },
  });
  return { ok: true, vendor: created };
}

function badRequest(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 });
}

/** project_vendors의 유니크 제약은 (projectId, vendorId) 하나뿐이라 P2002면 곧바로 중복 링크다. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const owned = await requireProjectOwner(id, auth.value.id);
  if (!owned.ok) return owned.response;

  const rows = await prisma.project_vendors.findMany({
    where: { projectId: id },
    include: { vendor: true, _count: { select: { quotes: true } } },
    orderBy: [{ isFavorite: "desc" }, { createdAt: "desc" }],
  });
  // _count.quotes는 견적이 없어도 0이므로 그대로 quoteCount로 노출한다.
  const vendors = rows.map(({ _count, ...row }) => ({ ...row, quoteCount: _count.quotes }));
  return NextResponse.json({ vendors });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const owned = await requireProjectOwner(id, auth.value.id);
  if (!owned.ok) return owned.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return badRequest("잘못된 JSON 본문입니다.");
  }
  if (typeof raw !== "object" || raw === null) {
    return badRequest("kakaoPlaceId 또는 업체 정보(placeName, address, category)를 입력하세요.");
  }

  const kakaoPlaceId = stringField("kakaoPlaceId" in raw ? raw.kakaoPlaceId : undefined, "kakaoPlaceId");
  if (!kakaoPlaceId.ok) return badRequest(kakaoPlaceId.error);
  const placeName = stringField("placeName" in raw ? raw.placeName : undefined, "placeName");
  if (!placeName.ok) return badRequest(placeName.error);
  const address = stringField("address" in raw ? raw.address : undefined, "address");
  if (!address.ok) return badRequest(address.error);
  const category = stringField("category" in raw ? raw.category : undefined, "category");
  if (!category.ok) return badRequest(category.error);
  const phone = stringField("phone" in raw ? raw.phone : undefined, "phone");
  if (!phone.ok) return badRequest(phone.error);
  const memo = memoField("memo" in raw ? raw.memo : undefined);
  if (!memo.ok) return badRequest(memo.error);

  const resolved = await resolveVendor({
    kakaoPlaceId: kakaoPlaceId.value,
    placeName: placeName.value,
    address: address.value,
    category: category.value,
    phone: phone.value,
  });
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  try {
    // status/isFavorite은 스키마 기본값(CANDIDATE/false)에 맡긴다.
    const pv = await prisma.project_vendors.create({
      data: { projectId: id, vendorId: resolved.vendor.id, memo: memo.value ?? null },
      include: { vendor: true },
    });
    return NextResponse.json(pv, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: "이미 등록된 업체입니다." }, { status: 409 });
    }
    throw error;
  }
}
