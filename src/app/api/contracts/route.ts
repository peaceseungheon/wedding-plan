import { NextResponse } from "next/server";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { parseWeddingDate } from "@/lib/domain/wedding-date";
import { withOptionsTotal } from "@/lib/domain/totals";
import { prisma } from "@/lib/prisma";

/**
 * 견적 → 계약 전환. 스냅샷 원칙이 전부다: 전환 시점의 옵션포함총액과 업체명을
 * contracts에 복사해 저장하며, 이후 견적 항목·업체명이 바뀌어도 절대
 * 재계산·동기화하지 않는다(계약 스냅샷이 재무 기준점).
 * 결제 스케줄 자동 생성은 하지 않는다 — Contract 화면의 프리필만 제공한다.
 */
type ValidContractCreate = {
  readonly quoteId: string;
  readonly signedDate: Date;
  readonly notes: string | null;
};

type ContractCreateResult =
  | { readonly ok: true; readonly value: ValidContractCreate }
  | { readonly ok: false; readonly error: string };

function validateContractCreate(raw: unknown): ContractCreateResult {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "quoteId와 signedDate를 입력하세요." };
  }
  if (!("quoteId" in raw) || typeof raw.quoteId !== "string" || raw.quoteId.length === 0) {
    return { ok: false, error: "quoteId를 입력하세요." };
  }
  if (!("signedDate" in raw) || typeof raw.signedDate !== "string") {
    return { ok: false, error: "signedDate는 YYYY-MM-DD 형식이어야 합니다." };
  }
  const signedDate = parseWeddingDate(raw.signedDate);
  if (signedDate === null) {
    return { ok: false, error: "signedDate는 YYYY-MM-DD 형식이어야 합니다." };
  }
  const notes = "notes" in raw && typeof raw.notes === "string" ? raw.notes : null;

  return { ok: true, value: { quoteId: raw.quoteId, signedDate, notes } };
}

export async function POST(
  req: Request,
): Promise<NextResponse> {
  const user = await requireUser(req);
  if (!user.ok) return user.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }
  const validated = validateContractCreate(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  // 소유 체인(quote → project_vendors → wedding_projects)을 한 쿼리로 푼다.
  // 없는 견적이든 남의 견적이든 같은 404로 은닉한다(가드 판정은 그 다음 단계).
  const quote = await prisma.quotes.findUnique({
    where: { id: validated.value.quoteId },
    include: {
      quoteItems: true,
      projectVendor: { include: { vendor: true } },
    },
  });
  if (quote === null) {
    return NextResponse.json({ error: "견적을 찾을 수 없습니다." }, { status: 404 });
  }

  const project = await requireProjectOwner(quote.projectVendor.projectId, user.value.id);
  if (!project.ok) return project.response;

  // 전환 시점 총액을 고정한다. 이후 견적 항목이 어떻게 바뀌어도 이 값은 불변이다.
  const amountSnapshot = withOptionsTotal(quote.quoteItems);

  try {
    // 세 부작용을 한 트랜잭션으로: 계약 생성 + 견적 CONFIRMED + 업체 CONTRACTED.
    // 견적이 이미 CONFIRMED여도 재지정은 멱등 쓰기라 그대로 둘 모두 실행한다.
    const [contract] = await prisma.$transaction([
      prisma.contracts.create({
        data: {
          quoteId: quote.id,
          projectId: quote.projectVendor.projectId,
          amountSnapshot,
          vendorNameSnapshot: quote.projectVendor.vendor.name,
          signedDate: validated.value.signedDate,
          notes: validated.value.notes,
        },
      }),
      prisma.quotes.update({
        where: { id: quote.id },
        data: { status: "CONFIRMED" },
      }),
      prisma.project_vendors.update({
        where: { id: quote.projectVendorId },
        data: { status: "CONTRACTED" },
      }),
    ]);
    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    // 견적당 계약 1건(quoteId @unique). 선검사 없이 P2002만 잡아 409로
    // 승격한다 — 재전환 경쟁 상태에서도 정확하다(signup 선례).
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "이미 계약으로 전환된 견적입니다." }, { status: 409 });
    }
    throw error;
  }
}
