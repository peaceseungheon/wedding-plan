import { NextResponse } from "next/server";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { parseWeddingDate } from "@/lib/domain/wedding-date";
import { prisma } from "@/lib/prisma";

/**
 * 소유 체인(quote → project_vendors → wedding_projects)을 한 쿼리로 푼다.
 * quoteId만 믿고 바로 반환하지 않는다 — projectId를 가드에 넘겨 소유를 증명한 뒤
 * 응답한다. projectVendor 중첩은 가드 판정용이므로 응답에서는 뗀다.
 */
async function loadQuote(quoteId: string) {
  return prisma.quotes.findUnique({
    where: { id: quoteId },
    include: {
      quoteItems: true,
      projectVendor: { select: { projectId: true } },
    },
  });
}

function quoteNotFound(): NextResponse {
  return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
}

type QuoteUpdateData = {
  readonly quoteDate?: Date;
  readonly guestCount?: number;
  readonly validUntil?: Date | null;
  readonly notes?: string | null;
  readonly status?: "CONFIRMED";
};

type QuoteUpdateResult =
  | { readonly ok: true; readonly value: QuoteUpdateData }
  | { readonly ok: false; readonly error: string };

/**
 * PUT 부분 갱신 3상태: 키 없음=변경 없음, null=초기화(validUntil·notes), 값=치환.
 * 알려진 필드가 하나도 없으면 400. status는 CONFIRMED 지정 하나만 허용해
 * DRAFT → CONFIRMED 단방향 전이만 열어 둔다(강등·오타는 400).
 */
function parseQuoteUpdate(raw: unknown): QuoteUpdateResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "수정할 필드를 하나 이상 입력하세요." };
  }

  const data: {
    quoteDate?: Date;
    guestCount?: number;
    validUntil?: Date | null;
    notes?: string | null;
    status?: "CONFIRMED";
  } = {};

  if ("quoteDate" in raw) {
    if (typeof raw.quoteDate !== "string") {
      return { ok: false, error: "quoteDate는 YYYY-MM-DD 형식이어야 합니다." };
    }
    const quoteDate = parseWeddingDate(raw.quoteDate);
    if (quoteDate === null) {
      return { ok: false, error: "quoteDate는 YYYY-MM-DD 형식이어야 합니다." };
    }
    data.quoteDate = quoteDate;
  }

  if ("guestCount" in raw) {
    if (typeof raw.guestCount !== "number" || !Number.isInteger(raw.guestCount) || raw.guestCount < 0) {
      return { ok: false, error: "guestCount는 0 이상의 정수여야 합니다." };
    }
    data.guestCount = raw.guestCount;
  }

  if ("validUntil" in raw) {
    if (raw.validUntil === null) {
      data.validUntil = null;
    } else if (typeof raw.validUntil === "string") {
      const validUntil = parseWeddingDate(raw.validUntil);
      if (validUntil === null) {
        return { ok: false, error: "validUntil는 YYYY-MM-DD 형식 또는 null이어야 합니다." };
      }
      data.validUntil = validUntil;
    } else {
      return { ok: false, error: "validUntil는 YYYY-MM-DD 형식 또는 null이어야 합니다." };
    }
  }

  if ("notes" in raw) {
    if (raw.notes === null) {
      data.notes = null;
    } else if (typeof raw.notes === "string") {
      data.notes = raw.notes;
    } else {
      return { ok: false, error: "notes는 문자열 또는 null이어야 합니다." };
    }
  }

  if ("status" in raw) {
    if (raw.status !== "CONFIRMED") {
      return { ok: false, error: "status는 CONFIRMED만 허용됩니다." };
    }
    data.status = "CONFIRMED";
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, error: "수정할 필드를 하나 이상 입력하세요." };
  }
  return { ok: true, value: data };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ quoteId: string }> },
): Promise<NextResponse> {
  const { quoteId } = await params;

  const user = await requireUser(req);
  if (!user.ok) return user.response;

  const quote = await loadQuote(quoteId);
  if (quote === null) return quoteNotFound();

  const project = await requireProjectOwner(quote.projectVendor.projectId, user.value.id);
  if (!project.ok) return project.response;

  return NextResponse.json({ ...quote, projectVendor: undefined });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ quoteId: string }> },
): Promise<NextResponse> {
  const { quoteId } = await params;

  const user = await requireUser(req);
  if (!user.ok) return user.response;

  const quote = await loadQuote(quoteId);
  if (quote === null) return quoteNotFound();

  const project = await requireProjectOwner(quote.projectVendor.projectId, user.value.id);
  if (!project.ok) return project.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }
  // 상태 전이는 CONFIRMED 지정 하나뿐이다. DRAFT 지정·오타·누락 모두 400이라
  // CONFIRMED → DRAFT 강등도 자연히 막힌다.
  if (typeof raw !== "object" || raw === null || !("status" in raw) || raw.status !== "CONFIRMED") {
    return NextResponse.json({ error: "status는 CONFIRMED만 허용됩니다." }, { status: 400 });
  }

  // 멱등 선택: 이미 CONFIRMED면 갱신 없이 같은 페이로드로 200을 돌려준다.
  // 재시도·더블클릭을 409 충돌로 승격시키지 않는다.
  if (quote.status === "CONFIRMED") {
    return NextResponse.json({ ...quote, projectVendor: undefined });
  }

  const updated = await prisma.quotes.update({
    where: { id: quoteId },
    data: { status: "CONFIRMED" },
    include: { quoteItems: true },
  });
  return NextResponse.json(updated);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ quoteId: string }> },
): Promise<NextResponse> {
  const { quoteId } = await params;

  const user = await requireUser(req);
  if (!user.ok) return user.response;

  const quote = await loadQuote(quoteId);
  if (quote === null) return quoteNotFound();

  const project = await requireProjectOwner(quote.projectVendor.projectId, user.value.id);
  if (!project.ok) return project.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }
  const parsed = parseQuoteUpdate(raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // 이미 CONFIRMED인 견적에 상태 외 필드만 갱신하는 것도 허용한다(200).
  // status: "CONFIRMED"는 멱등 no-op 쓰기라 강등 경로가 없다.
  const updated = await prisma.quotes.update({
    where: { id: quoteId },
    data: parsed.value,
    include: { quoteItems: true },
  });
  return NextResponse.json(updated);
}
