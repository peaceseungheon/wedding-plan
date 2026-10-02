"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { formatKRW, formatManwon } from "@/lib/domain/totals";
import { PAYMENT_LABEL_TEXT, paymentLabelText } from "@/lib/constants/payment-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { Stat } from "@/components/ui/stat";
import {
  DataTable,
  headRowClass,
  numClass,
  rowClass,
  stickyCellClass,
  tdClass,
  thClass,
} from "@/components/ui/table";

/** GET /api/projects/{id}/contracts 목록 행(필요한 필드만). */
type ContractRow = {
  id: string;
  vendorNameSnapshot: string;
  amountSnapshot: number;
  signedDate: string;
  notes: string | null;
};

/** GET /api/contracts/{contractId}/payments 행. 서버는 dueDate 오름차순으로 준다. */
type PaymentRow = {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
};

type NewPaymentForm = {
  label: string;
  amount: string;
  dueDate: string;
};

const EMPTY_NEW_PAYMENT: NewPaymentForm = { label: "DEPOSIT", amount: "", dueDate: "" };

/** 에러 본문 {error: string}에서 메시지를 꺼낸다. JSON이 아니면 null. */
async function errorOf(res: Response): Promise<string | null> {
  try {
    const data: unknown = await res.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string"
    ) {
      return data.error;
    }
  } catch {
    return null; // JSON이 아닌 응답(예: 라우트 부재의 404 HTML)
  }
  return null;
}

function isContractRow(value: unknown): value is ContractRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "vendorNameSnapshot" in value &&
    typeof value.vendorNameSnapshot === "string" &&
    "amountSnapshot" in value &&
    typeof value.amountSnapshot === "number" &&
    "signedDate" in value &&
    typeof value.signedDate === "string" &&
    "notes" in value &&
    (value.notes === null || typeof value.notes === "string")
  );
}

function isPaymentRow(value: unknown): value is PaymentRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "label" in value &&
    typeof value.label === "string" &&
    "amount" in value &&
    typeof value.amount === "number" &&
    "dueDate" in value &&
    typeof value.dueDate === "string" &&
    "paidAt" in value &&
    (value.paidAt === null || typeof value.paidAt === "string")
  );
}

/** number input의 문자열을 정수로. 파싱 실패는 0으로 수렴시키고 서버 400 메시지에 맡긴다. */
function parseIntInput(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** UTC 자정 기준으로 날짜를 더한다(YYYY-MM-DD → YYYY-MM-DD). */
function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * 3행 자동 채우기 금액: 계약금 10%·중도금 30%·잔금은 나머지(≈60%).
 * 잔금이 버림 나머지를 흡수해 세 행의 합이 항상 계약액과 같아진다.
 */
function standardSplit(amountSnapshot: number): { label: string; amount: number }[] {
  const deposit = Math.floor(amountSnapshot * 0.1);
  const middle = Math.floor(amountSnapshot * 0.3);
  return [
    { label: "DEPOSIT", amount: deposit },
    { label: "MIDDLE", amount: middle },
    { label: "FINAL", amount: amountSnapshot - deposit - middle },
  ];
}

type FetchResult<T> = { ok: true; data: T } | { ok: false; message: string };

export default function ContractClient({
  projectId,
  contractId,
}: {
  projectId: string;
  contractId: string;
}) {
  const [contract, setContract] = useState<ContractRow | null>(null);
  const [contractError, setContractError] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newPayment, setNewPayment] = useState<NewPaymentForm>(EMPTY_NEW_PAYMENT);
  const [adding, setAdding] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const router = useRouter();

  const apiRequest = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const res = await fetch(url, { credentials: "include", ...init });
      if (res.status === 401) router.replace("/login");
      return res;
    },
    [router],
  );

  // 단일 계약 GET은 없다 — 프로젝트 계약 목록을 받아 클라이언트에서 contractId로 찾는다.
  const fetchContract = useCallback(
    async (): Promise<FetchResult<ContractRow | null>> => {
      const res = await apiRequest(`/api/projects/${projectId}/contracts`);
      if (!res.ok) return { ok: false, message: "계약을 불러올 수 없습니다." };
      const data: unknown = await res.json();
      if (!Array.isArray(data)) return { ok: false, message: "계약 응답 형식이 올바르지 않습니다." };
      const found = data.find(
        (row): row is ContractRow => isContractRow(row) && row.id === contractId,
      );
      return { ok: true, data: found === undefined ? null : found };
    },
    [apiRequest, projectId, contractId],
  );

  const fetchPayments = useCallback(async (): Promise<FetchResult<PaymentRow[]>> => {
    const res = await apiRequest(`/api/contracts/${contractId}/payments`);
    if (!res.ok) return { ok: false, message: "결제 목록을 불러올 수 없습니다." };
    const data: unknown = await res.json();
    if (!Array.isArray(data) || !data.every(isPaymentRow)) {
      return { ok: false, message: "결제 응답 형식이 올바르지 않습니다." };
    }
    return { ok: true, data };
  }, [apiRequest, contractId]);

  useEffect(() => {
    let active = true;
    fetchContract()
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setContractError(result.message);
          return;
        }
        if (result.data === null) {
          setContractError("계약을 찾을 수 없습니다");
          return;
        }
        setContract(result.data);
      })
      .catch(() => {
        if (active) setContractError("네트워크 오류가 발생했습니다.");
      });
    return () => {
      active = false;
    };
  }, [fetchContract]);

  useEffect(() => {
    let active = true;
    fetchPayments()
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setPaymentsError(result.message);
          return;
        }
        setPayments(result.data);
      })
      .catch(() => {
        if (active) setPaymentsError("네트워크 오류가 발생했습니다.");
      });
    return () => {
      active = false;
    };
  }, [fetchPayments]);

  const syncPayments = useCallback(async (): Promise<void> => {
    const result = await fetchPayments();
    if (result.ok) setPayments(result.data);
  }, [fetchPayments]);

  /** 완납 토글. PUT 응답 행을 로컬 목록에 반영하면 지출 요약이 즉시 재계산된다. */
  const togglePaid = async (payment: PaymentRow): Promise<void> => {
    setActionError(null);
    setNotice(null);
    setTogglingId(payment.id);
    try {
      const res = await apiRequest(`/api/contracts/${contractId}/payments/${payment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAt: payment.paidAt === null }),
      });
      if (!res.ok) {
        setActionError((await errorOf(res)) ?? `완납 처리에 실패했습니다. (${res.status})`);
        return;
      }
      const data: unknown = await res.json();
      if (!isPaymentRow(data)) {
        setActionError("결제 응답 형식이 올바르지 않습니다.");
        return;
      }
      setPayments((prev) =>
        prev === null ? prev : prev.map((row) => (row.id === data.id ? data : row)),
      );
      setNotice(data.paidAt === null ? "미완납으로 되돌렸습니다." : "완납 처리했습니다.");
    } catch {
      setActionError("네트워크 오류가 발생했습니다.");
    } finally {
      setTogglingId(null);
    }
  };

  /** 결제 추가. 검증은 서버(400)에 맡기고 메시지를 그대로 표시한다. */
  const addPayment = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setActionError(null);
    setNotice(null);
    setAdding(true);
    try {
      const res = await apiRequest(`/api/contracts/${contractId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newPayment.label,
          amount: parseIntInput(newPayment.amount),
          dueDate: newPayment.dueDate,
        }),
      });
      if (!res.ok) {
        setActionError((await errorOf(res)) ?? `결제 추가에 실패했습니다. (${res.status})`);
        return;
      }
      setNewPayment(EMPTY_NEW_PAYMENT);
      setNotice("결제를 추가했습니다.");
      await syncPayments();
    } catch {
      setActionError("네트워크 오류가 발생했습니다.");
    } finally {
      setAdding(false);
    }
  };

  /** 3행 자동 채우기: 계약금(서명일)·중도금(+30일)·잔금(+60일)을 즉시 등록한다. */
  const prefillStandard = async (): Promise<void> => {
    if (contract === null) return;
    setActionError(null);
    setNotice(null);
    const split = standardSplit(contract.amountSnapshot);
    if (split.some((row) => row.amount <= 0)) {
      setActionError("계약금액이 너무 작아 자동 채우기를 적용할 수 없습니다.");
      return;
    }
    setPrefilling(true);
    const signedDate = contract.signedDate.slice(0, 10);
    const schedule = [
      { label: split[0].label, amount: split[0].amount, dueDate: signedDate },
      { label: split[1].label, amount: split[1].amount, dueDate: addDays(signedDate, 30) },
      { label: split[2].label, amount: split[2].amount, dueDate: addDays(signedDate, 60) },
    ];
    try {
      let failed: string | null = null;
      for (const row of schedule) {
        const res = await apiRequest(`/api/contracts/${contractId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row),
        });
        if (!res.ok) {
          failed = (await errorOf(res)) ?? `결제 추가에 실패했습니다. (${res.status})`;
          break;
        }
      }
      await syncPayments();
      if (failed === null) setNotice("계약금/중도금/잔금을 추가했습니다.");
      else setActionError(failed);
    } catch {
      setActionError("네트워크 오류가 발생했습니다.");
    } finally {
      setPrefilling(false);
    }
  };

  // 지출 요약은 저장 값이 아니라 조회 시점 계산이므로 매 렌더마다 로컬 상태에서 재계산한다.
  const contractAmountText = contract === null ? "…" : formatManwon(contract.amountSnapshot);
  const paidTotal = (payments ?? []).reduce(
    (sum, row) => (row.paidAt === null ? sum : sum + row.amount),
    0,
  );
  const paidTotalText = contract === null || payments === null ? "…" : formatManwon(paidTotal);
  const remainingText =
    contract === null || payments === null
      ? "…"
      : formatManwon(contract.amountSnapshot - paidTotal);

  return (
    <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 pt-8 pb-16">
      <PageHeader
        title="계약 상세"
        meta={
          contract === null ? undefined : (
            <>
              <span>{contract.vendorNameSnapshot}</span>
              <span className="tabular-nums">서명일 {contract.signedDate.slice(0, 10)}</span>
            </>
          )
        }
      />

      {contractError !== null && (
        <p role="alert" className="text-sm text-negative">
          {contractError}
        </p>
      )}
      {notice !== null && (
        <p role="status" className="text-sm text-positive">
          ✓ {notice}
        </p>
      )}
      {actionError !== null && (
        <p role="alert" className="text-sm text-negative">
          {actionError}
        </p>
      )}

      {contractError === null && (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4" aria-label="지출 요약">
            <Stat label="계약금액" value={contractAmountText} />
            <Stat label="완납 합계" value={paidTotalText}>
              {contract !== null && payments !== null && contract.amountSnapshot > 0 && (
                <>
                  <span className="text-ink-muted">
                    계약금액의 {Math.round((paidTotal / contract.amountSnapshot) * 100)}%
                  </span>
                  <Progress label="계약금액 대비 완납 합계" value={paidTotal / contract.amountSnapshot} tone="accent" />
                </>
              )}
            </Stat>
            <Stat label="잔여" value={remainingText} />
          </section>

          <Card title="계약 정보">
            <dl className="flex flex-col divide-y divide-line text-sm">
              <div className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <dt className="text-ink-muted">업체명</dt>
                <dd className="font-medium">{contract?.vendorNameSnapshot ?? "…"}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <dt className="text-ink-muted">계약금액</dt>
                <dd className="font-semibold tabular-nums">
                  {contract === null ? "…" : formatKRW(contract.amountSnapshot)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <dt className="text-ink-muted">서명일</dt>
                <dd className="font-medium tabular-nums">{contract?.signedDate.slice(0, 10) ?? "…"}</dd>
              </div>
              {contract?.notes != null && contract.notes !== "" && (
                <div className="flex items-baseline justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <dt className="shrink-0 text-ink-muted">메모</dt>
                  <dd className="min-w-0 break-words text-right">{contract.notes}</dd>
                </div>
              )}
            </dl>
          </Card>

          <Card title="결제 스케줄">
            <DataTable>
              <thead>
                <tr className={headRowClass}>
                  <th className={`${thClass} ${stickyCellClass}`}>라벨</th>
                  <th className={`${thClass} text-right`}>금액</th>
                  <th className={`${thClass} text-right`}>기한</th>
                  <th className={thClass}>완납</th>
                  <th className={thClass}>
                    <span className="sr-only">처리</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(payments ?? []).map((payment) => (
                  <tr key={payment.id} className={rowClass}>
                    <td className={`${tdClass} ${stickyCellClass} whitespace-nowrap`}>{paymentLabelText(payment.label)}</td>
                    <td className={`${tdClass} ${numClass}`}>{formatKRW(payment.amount)}</td>
                    <td className={`${tdClass} ${numClass}`}>{payment.dueDate.slice(0, 10)}</td>
                    <td className={`${tdClass} whitespace-nowrap`}>
                      {payment.paidAt === null ? (
                        <Badge tone="neutral">미완납</Badge>
                      ) : (
                        <>
                          <Badge tone="positive">✓ 완납</Badge>
                          <span className="ml-2 text-xs tabular-nums text-ink-subtle">
                            {payment.paidAt.slice(0, 10)}
                          </span>
                        </>
                      )}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void togglePaid(payment)}
                        disabled={togglingId === payment.id}
                      >
                        {payment.paidAt === null ? "완납" : "완납 취소"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            {payments === null &&
              (paymentsError === null ? (
                <p className="mt-3 text-sm text-ink-muted">결제를 불러오는 중…</p>
              ) : (
                <p role="alert" className="mt-3 text-sm text-negative">
                  {paymentsError}
                </p>
              ))}
            {payments !== null && payments.length === 0 && (
              <p className="mt-3 text-sm text-ink-muted">결제가 없습니다.</p>
            )}
          </Card>

          <Card title="결제 추가">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-start gap-1.5">
                <Button
                  variant="secondary"
                  onClick={() => void prefillStandard()}
                  disabled={prefilling || contract === null}
                >
                  계약금/중도금/잔금 자동 채우기
                </Button>
                <p className="text-xs text-ink-subtle">
                  계약금 10%·중도금 30%·잔금 60%(나머지 절사 반영)를 서명일·+30일·+60일 기한으로
                  바로 등록합니다.
                </p>
              </div>
              <form
                className="flex flex-col gap-4 border-t border-line pt-4"
                onSubmit={(event) => void addPayment(event)}
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="라벨">
                    <select
                      className={inputClass}
                      value={newPayment.label}
                      onChange={(e) => setNewPayment({ ...newPayment, label: e.target.value })}
                    >
                      {Object.entries(PAYMENT_LABEL_TEXT).map(([value, text]) => (
                        <option key={value} value={value}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="금액">
                    <input
                      className={`${inputClass} tabular-nums`}
                      type="number"
                      min={1}
                      step={1}
                      value={newPayment.amount}
                      onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                    />
                  </Field>
                  <Field label="기한">
                    <input
                      className={`${inputClass} tabular-nums`}
                      type="date"
                      value={newPayment.dueDate}
                      onChange={(e) => setNewPayment({ ...newPayment, dueDate: e.target.value })}
                    />
                  </Field>
                </div>
                <Button type="submit" disabled={adding} className="self-start">
                  결제 추가
                </Button>
              </form>
            </div>
          </Card>
        </>
      )}
    </main>
  );
}
