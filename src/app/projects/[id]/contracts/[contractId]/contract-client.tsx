"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { formatKRW } from "@/lib/domain/totals";

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

const PAYMENT_LABEL_TEXT: Readonly<Record<string, string>> = {
  DEPOSIT: "계약금",
  MIDDLE: "중도금",
  FINAL: "잔금",
  ETC: "기타",
};

function labelText(label: string): string {
  return PAYMENT_LABEL_TEXT[label] ?? label;
}

const inputClass = "rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-900";
const buttonClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass =
  "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50";

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
  const contractAmountText = contract === null ? "…" : formatKRW(contract.amountSnapshot);
  const paidTotal = (payments ?? []).reduce(
    (sum, row) => (row.paidAt === null ? sum : sum + row.amount),
    0,
  );
  const paidTotalText = contract === null || payments === null ? "…" : formatKRW(paidTotal);
  const remainingText =
    contract === null || payments === null
      ? "…"
      : formatKRW(contract.amountSnapshot - paidTotal);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 font-sans">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">계약 상세</h1>
      </header>

      {contractError !== null && <p className="text-sm text-red-600">{contractError}</p>}
      {notice !== null && <p className="text-sm text-emerald-700">{notice}</p>}
      {actionError !== null && <p className="text-sm text-red-600">{actionError}</p>}

      {contractError === null && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">계약 정보</h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-zinc-200 p-3">
                <dt className="text-xs text-zinc-500">업체명</dt>
                <dd className="text-base font-medium text-zinc-900">
                  {contract?.vendorNameSnapshot ?? "…"}
                </dd>
              </div>
              <div className="rounded-md border border-zinc-200 p-3">
                <dt className="text-xs text-zinc-500">계약금액</dt>
                <dd className="text-base font-semibold tabular-nums text-zinc-900">
                  {contractAmountText}
                </dd>
              </div>
              <div className="rounded-md border border-zinc-200 p-3">
                <dt className="text-xs text-zinc-500">서명일</dt>
                <dd className="text-base font-medium text-zinc-900">
                  {contract?.signedDate.slice(0, 10) ?? "…"}
                </dd>
              </div>
              {contract?.notes != null && contract.notes !== "" && (
                <div className="rounded-md border border-zinc-200 p-3">
                  <dt className="text-xs text-zinc-500">메모</dt>
                  <dd className="text-base font-medium text-zinc-900">{contract.notes}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">결제 스케줄</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                    <th className="py-2 pr-2 font-medium">라벨</th>
                    <th className="py-2 pr-2 font-medium">금액</th>
                    <th className="py-2 pr-2 font-medium">기한</th>
                    <th className="py-2 font-medium">완납</th>
                  </tr>
                </thead>
                <tbody>
                  {(payments ?? []).map((payment) => (
                    <tr key={payment.id} className="border-b border-zinc-100">
                      <td className="py-2 pr-2">{labelText(payment.label)}</td>
                      <td className="whitespace-nowrap py-2 pr-2 tabular-nums">
                        {formatKRW(payment.amount)}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-2 tabular-nums">
                        {payment.dueDate.slice(0, 10)}
                      </td>
                      <td className="whitespace-nowrap py-2">
                        {payment.paidAt === null ? (
                          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                            미완납
                          </span>
                        ) : (
                          <>
                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                              완납
                            </span>
                            <span className="ml-2 text-xs text-zinc-500">
                              {payment.paidAt.slice(0, 10)}
                            </span>
                          </>
                        )}{" "}
                        <button
                          className={buttonClass}
                          onClick={() => void togglePaid(payment)}
                          disabled={togglingId === payment.id}
                        >
                          {payment.paidAt === null ? "완납" : "완납 취소"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {payments === null &&
              (paymentsError === null ? (
                <p className="text-sm text-zinc-500">결제를 불러오는 중…</p>
              ) : (
                <p className="text-sm text-red-600">{paymentsError}</p>
              ))}
            {payments !== null && payments.length === 0 && (
              <p className="text-sm text-zinc-500">결제가 없습니다.</p>
            )}

            <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3">
              <button
                className={buttonClass}
                onClick={() => void prefillStandard()}
                disabled={prefilling || contract === null}
              >
                계약금/중도금/잔금 자동 채우기
              </button>
              <p className="text-xs text-zinc-500">
                계약금 10%·중도금 30%·잔금 60%(나머지 절사 반영)를 서명일·+30일·+60일 기한으로
                바로 등록합니다.
              </p>
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => void addPayment(event)}
              >
                <label className="flex flex-col gap-1 text-sm text-zinc-700">
                  라벨
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
                </label>
                <label className="flex flex-col gap-1 text-sm text-zinc-700">
                  금액
                  <input
                    className={`${inputClass} w-28`}
                    type="number"
                    min={1}
                    step={1}
                    value={newPayment.amount}
                    onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-zinc-700">
                  기한
                  <input
                    className={inputClass}
                    type="date"
                    value={newPayment.dueDate}
                    onChange={(e) => setNewPayment({ ...newPayment, dueDate: e.target.value })}
                  />
                </label>
                <button className={primaryButtonClass} type="submit" disabled={adding}>
                  결제 추가
                </button>
              </form>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">지출 요약</h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-zinc-200 p-3">
                <dt className="text-xs text-zinc-500">계약액</dt>
                <dd className="text-lg font-semibold tabular-nums text-zinc-900">
                  {contractAmountText}
                </dd>
              </div>
              <div className="rounded-md border border-zinc-200 p-3">
                <dt className="text-xs text-zinc-500">완납 합계</dt>
                <dd className="text-lg font-semibold tabular-nums text-zinc-900">{paidTotalText}</dd>
              </div>
              <div className="rounded-md border border-zinc-200 p-3">
                <dt className="text-xs text-zinc-500">잔여</dt>
                <dd className="text-lg font-semibold tabular-nums text-zinc-900">
                  {remainingText}
                </dd>
              </div>
            </dl>
          </section>
        </>
      )}
    </main>
  );
}
