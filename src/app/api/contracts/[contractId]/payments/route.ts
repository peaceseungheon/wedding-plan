import { NextResponse } from "next/server";
import { PAYMENT_LABEL, type contracts } from "../../../../../../generated/prisma/client";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { parseWeddingDate } from "@/lib/domain/wedding-date";
import { prisma } from "@/lib/prisma";

type RouteContext = { readonly params: Promise<{ readonly contractId: string }> };

const PAYMENT_LABELS = Object.values(PAYMENT_LABEL);

function isPaymentLabel(value: string): value is PAYMENT_LABEL {
  return PAYMENT_LABELS.some((candidate) => candidate === value);
}

type ValidPaymentCreate = {
  readonly label: PAYMENT_LABEL;
  readonly amount: number;
  readonly dueDate: Date;
};

type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/** 결제 등록은 label·amount·dueDate 세 필드가 모두 필수다. 합계 검증은 하지
 * 않는다 — 계약금 합이 계약액과 달라도 허용(대시보드는 사실만 표시한다). */
function validatePaymentCreate(raw: unknown): ValidationResult<ValidPaymentCreate> {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "label, amount, dueDate를 입력하세요." };
  }
  if (!("label" in raw) || typeof raw.label !== "string" || !isPaymentLabel(raw.label)) {
    return { ok: false, error: "label은 DEPOSIT/MIDDLE/FINAL/ETC 중 하나여야 합니다." };
  }
  if (!("amount" in raw) || typeof raw.amount !== "number" || !Number.isInteger(raw.amount) || raw.amount <= 0) {
    return { ok: false, error: "amount는 0보다 큰 정수여야 합니다." };
  }
  if (!("dueDate" in raw) || typeof raw.dueDate !== "string") {
    return { ok: false, error: "dueDate는 YYYY-MM-DD 형식이어야 합니다." };
  }
  const dueDate = parseWeddingDate(raw.dueDate);
  if (dueDate === null) {
    return { ok: false, error: "dueDate는 YYYY-MM-DD 형식이어야 합니다." };
  }
  return { ok: true, value: { label: raw.label, amount: raw.amount, dueDate } };
}

/** 소유 체인(payment → contract → project)을 contract.projectId 한 번으로 푼다.
 * 없는 계약이든 남의 계약이든 같은 404로 은닉한다. */
async function resolveOwnedContract(
  contractId: string,
  userId: string,
): Promise<{ ok: true; value: contracts } | { ok: false; response: NextResponse }> {
  const contract = await prisma.contracts.findUnique({ where: { id: contractId } });
  if (contract === null) {
    return { ok: false, response: NextResponse.json({ error: "계약을 찾을 수 없습니다." }, { status: 404 }) };
  }
  const project = await requireProjectOwner(contract.projectId, userId);
  if (!project.ok) return project;
  return { ok: true, value: contract };
}

/** 계약의 결제 스케줄 목록. dueDate 오름차순이 유일한 정의다. */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const user = await requireUser(req);
  if (!user.ok) return user.response;
  const { contractId } = await ctx.params;

  const contract = await resolveOwnedContract(contractId, user.value.id);
  if (!contract.ok) return contract.response;

  const payments = await prisma.payments.findMany({
    where: { contractId: contract.value.id },
    orderBy: { dueDate: "asc" },
    select: {
      id: true,
      label: true,
      amount: true,
      dueDate: true,
      paidAt: true,
    },
  });
  return NextResponse.json(payments);
}

export async function POST(
  req: Request,
  ctx: RouteContext,
): Promise<NextResponse> {
  const user = await requireUser(req);
  if (!user.ok) return user.response;
  const { contractId } = await ctx.params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }
  const validated = validatePaymentCreate(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const contract = await resolveOwnedContract(contractId, user.value.id);
  if (!contract.ok) return contract.response;

  const payment = await prisma.payments.create({
    data: {
      contractId: contract.value.id,
      label: validated.value.label,
      amount: validated.value.amount,
      dueDate: validated.value.dueDate,
    },
    select: {
      id: true,
      label: true,
      amount: true,
      dueDate: true,
      paidAt: true,
    },
  });
  return NextResponse.json(payment, { status: 201 });
}
