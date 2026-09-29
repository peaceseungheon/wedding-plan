import { NextResponse } from "next/server";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { parseWeddingDate } from "@/lib/domain/wedding-date";
import { prisma } from "@/lib/prisma";

/**
 * quotes 스키마의 필수 컬럼(quoteDate, guestCount)은 기본값이 없으므로
 * 본문에서 받는다. validUntil·notes는 스키마상 nullable이라 선택 입력.
 */
type ValidQuoteCreate = {
  readonly pvId: string;
  readonly quoteDate: Date;
  readonly guestCount: number;
  readonly validUntil: Date | null;
  readonly notes: string | null;
};

type QuoteCreateResult =
  | { readonly ok: true; readonly value: ValidQuoteCreate }
  | { readonly ok: false; readonly error: string };

function parseDate(value: unknown): { readonly ok: true; readonly date: Date } | {
  readonly ok: false;
} {
  if (typeof value !== "string") return { ok: false };
  const date = parseWeddingDate(value);
  return date === null ? { ok: false } : { ok: true, date };
}

function validateQuoteCreate(raw: unknown): QuoteCreateResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "pvId, quoteDate, guestCount를 입력하세요." };
  }
  if (!("pvId" in raw) || !("quoteDate" in raw) || !("guestCount" in raw)) {
    return { ok: false, error: "pvId, quoteDate, guestCount를 입력하세요." };
  }
  const { pvId, quoteDate, guestCount } = raw;
  if (typeof pvId !== "string" || pvId.length === 0) {
    return { ok: false, error: "pvId를 입력하세요." };
  }
  const parsedQuoteDate = parseDate(quoteDate);
  if (!parsedQuoteDate.ok) {
    return { ok: false, error: "quoteDate는 YYYY-MM-DD 형식이어야 합니다." };
  }
  if (typeof guestCount !== "number" || !Number.isInteger(guestCount) || guestCount < 0) {
    return { ok: false, error: "guestCount는 0 이상의 정수여야 합니다." };
  }

  const validUntilRaw = "validUntil" in raw ? raw.validUntil : null;
  let validUntil: Date | null = null;
  if (validUntilRaw !== null && validUntilRaw !== undefined) {
    const parsedValidUntil = parseDate(validUntilRaw);
    if (!parsedValidUntil.ok) {
      return { ok: false, error: "validUntil는 YYYY-MM-DD 형식이어야 합니다." };
    }
    validUntil = parsedValidUntil.date;
  }
  const notes = "notes" in raw && typeof raw.notes === "string" ? raw.notes : null;

  return {
    ok: true,
    value: { pvId, quoteDate: parsedQuoteDate.date, guestCount, validUntil, notes },
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const user = await requireUser(req);
  if (!user.ok) return user.response;
  const project = await requireProjectOwner(id, user.value.id);
  if (!project.ok) return project.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }
  const validated = validateQuoteCreate(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  // pv가 이 프로젝트 소속인지를 where에서 동시에 확인한다. 다른 프로젝트의
  // pvId라도 404로 돌려 존재 여부를 숨긴다(project 가드와 같은 은닉 원칙).
  const projectVendor = await prisma.project_vendors.findFirst({
    where: { id: validated.value.pvId, projectId: project.value.id },
  });
  if (projectVendor === null) {
    return NextResponse.json({ error: "견적 대상 업체를 찾을 수 없습니다." }, { status: 404 });
  }

  // status는 스키마 기본값 DRAFT로 생성한다. 견적 상태 전이는 PUT·PATCH에서만 일어난다.
  const quote = await prisma.quotes.create({
    data: {
      projectVendorId: projectVendor.id,
      quoteDate: validated.value.quoteDate,
      guestCount: validated.value.guestCount,
      validUntil: validated.value.validUntil,
      notes: validated.value.notes,
    },
    include: { quoteItems: true },
  });
  return NextResponse.json(quote, { status: 201 });
}
