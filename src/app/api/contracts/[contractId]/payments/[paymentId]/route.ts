import { NextResponse } from "next/server";
import { PAYMENT_LABEL } from "../../../../../../../generated/prisma/client";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { parseWeddingDate } from "@/lib/domain/wedding-date";
import { prisma } from "@/lib/prisma";

type RouteContext = { readonly params: Promise<{ readonly contractId: string; readonly paymentId: string }> };

const PAYMENT_LABELS = Object.values(PAYMENT_LABEL);

function isPaymentLabel(value: string): value is PAYMENT_LABEL {
  return PAYMENT_LABELS.some((candidate) => candidate === value);
}

type ValidPaymentUpdate = {
  readonly label?: PAYMENT_LABEL;
  readonly amount?: number;
  readonly dueDate?: Date;
  readonly paidAt?: Date | null;
};

type ValidationResult<T> =
  | { readonly ok: true; value: T }
  | { readonly ok: false; readonly error: string };

/**
 * 부분 수정 검증: 키가 없으면 그 필드는 건드리지 않는다. paidAt는 3상태 —
 * true=완납(now), false=미완납 복귀(null), 키 없음=변경 없음. 합계 검증·
 * 자동 완납 계산은 하지 않는다(계약금 합 ≠ 계약액 허용).
 */
function validatePaymentUpdate(raw: unknown): ValidationResult<ValidPaymentUpdate> {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "수정할 항목을 입력하세요." };
  }

  const value: {
    label?: PAYMENT_LABEL;
    amount?: number;
    dueDate?: Date;
    paidAt?: Date | null;
  } = {};

  if ("label" in raw) {
    if (typeof raw.label !== "string" || !isPaymentLabel(raw.label)) {
      return { ok: false, error: "label은 DEPOSIT/MIDDLE/FINAL/ETC 중 하나여야 합니다." };
    }
    value.label = raw.label;
  }

  if ("amount" in raw) {
    if (typeof raw.amount !== "number" || !Number.isInteger(raw.amount) || raw.amount <= 0) {
      return { ok: false, error: "amount는 0보다 큰 정수여야 합니다." };
    }
    value.amount = raw.amount;
  }

  if ("dueDate" in raw) {
    if (typeof raw.dueDate !== "string") {
      return { ok: false, error: "dueDate는 YYYY-MM-DD 형식이어야 합니다." };
    }
    const dueDate = parseWeddingDate(raw.dueDate);
    if (dueDate === null) {
      return { ok: false, error: "dueDate는 YYYY-MM-DD 형식이어야 합니다." };
    }
    value.dueDate = dueDate;
  }

  if ("paidAt" in raw) {
    if (typeof raw.paidAt !== "boolean") {
      return { ok: false, error: "paidAt는 boolean이어야 합니다." };
    }
    value.paidAt = raw.paidAt ? new Date() : null;
  }

  if (value.label === undefined && value.amount === undefined && value.dueDate === undefined && value.paidAt === undefined) {
    return { ok: false, error: "수정할 항목을 입력하세요." };
  }
  return { ok: true, value };
}

/** 소유 체인(payment → contract → project) + URL 경로 정합성. paymentId가
 * 다른 계약에 속하면(경로의 contractId와 불일치) 소유 여부와 무관하게 404로
 * 은닉한다 — 존재를 유출하지 않는다. */
export async function PUT(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const user = await requireUser(req);
  if (!user.ok) return user.response;
  const { contractId, paymentId } = await ctx.params;

  const payment = await prisma.payments.findUnique({
    where: { id: paymentId },
    select: { id: true, contractId: true, contract: { select: { projectId: true } } },
  });
  if (payment === null || payment.contractId !== contractId) {
    return NextResponse.json({ error: "결제를 찾을 수 없습니다." }, { status: 404 });
  }
  const owned = await requireProjectOwner(payment.contract.projectId, user.value.id);
  if (!owned.ok) return owned.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 JSON 본문입니다." }, { status: 400 });
  }

  const validated = validatePaymentUpdate(raw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const updated = await prisma.payments.update({
    where: { id: payment.id },
    data: {
      label: validated.value.label,
      amount: validated.value.amount,
      dueDate: validated.value.dueDate,
      paidAt: validated.value.paidAt,
    },
    select: {
      id: true,
      label: true,
      amount: true,
      dueDate: true,
      paidAt: true,
    },
  });

  return NextResponse.json(updated);
}
