"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BenchmarkDeltaLabel,
  useBenchmarks,
} from "@/lib/client/use-benchmarks";
import { ITEM_CODES, ITEM_CODE_LABELS } from "@/lib/constants/item-codes";
import { normalizeQuoteItemAmount } from "@/lib/domain/quote-item";
import { formatKRW, minTotal, perGuest, withOptionsTotal } from "@/lib/domain/totals";

type QuoteItemRow = {
  id: string;
  rawName: string;
  itemCode: string | null;
  qty: number;
  unitPrice: number;
  amount: number;
  required: boolean;
  selected: boolean;
};

type QuoteData = {
  id: string;
  status: "DRAFT" | "CONFIRMED";
  quoteDate: string;
  guestCount: number;
  validUntil: string | null;
  notes: string | null;
  quoteItems: QuoteItemRow[];
};

type DocumentRow = {
  id: string;
  fileName: string;
  size: number;
  createdAt: string;
  quoteId: string | null;
};

type NewItemForm = {
  rawName: string;
  itemCode: string;
  qty: string;
  unitPrice: string;
  required: boolean;
  selected: boolean;
};

const EMPTY_NEW_ITEM: NewItemForm = {
  rawName: "",
  itemCode: "",
  qty: "1",
  unitPrice: "",
  required: true,
  selected: false,
};

const inputClass = "rounded-md border border-zinc-300 px-2 py-1 text-sm";
const buttonClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass =
  "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50";

const CONFIRMED_NOTICE = "확정된 견적의 항목은 수정할 수 없습니다.";

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

function isQuoteItemRow(value: unknown): value is QuoteItemRow {
  if (typeof value !== "object" || value === null) return false;
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "rawName" in value &&
    typeof value.rawName === "string" &&
    "itemCode" in value &&
    (value.itemCode === null || typeof value.itemCode === "string") &&
    "qty" in value &&
    typeof value.qty === "number" &&
    "unitPrice" in value &&
    typeof value.unitPrice === "number" &&
    "amount" in value &&
    typeof value.amount === "number" &&
    "required" in value &&
    typeof value.required === "boolean" &&
    "selected" in value &&
    typeof value.selected === "boolean"
  );
}

function isQuoteData(value: unknown): value is QuoteData {
  if (typeof value !== "object" || value === null) return false;
  if (
    !(
      "id" in value &&
      typeof value.id === "string" &&
      "status" in value &&
      (value.status === "DRAFT" || value.status === "CONFIRMED") &&
      "quoteDate" in value &&
      typeof value.quoteDate === "string" &&
      "guestCount" in value &&
      typeof value.guestCount === "number" &&
      "validUntil" in value &&
      (value.validUntil === null || typeof value.validUntil === "string") &&
      "notes" in value &&
      (value.notes === null || typeof value.notes === "string") &&
      "quoteItems" in value &&
      Array.isArray(value.quoteItems)
    )
  ) {
    return false;
  }
  return value.quoteItems.every(isQuoteItemRow);
}

function isDocumentRow(value: unknown): value is DocumentRow {
  if (typeof value !== "object" || value === null) return false;
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "fileName" in value &&
    typeof value.fileName === "string" &&
    "size" in value &&
    typeof value.size === "number" &&
    "createdAt" in value &&
    typeof value.createdAt === "string" &&
    "quoteId" in value &&
    (value.quoteId === null || typeof value.quoteId === "string")
  );
}

/** number input의 문자열을 정수로. 파싱 실패는 0으로 수렴시키고 저장 시점에 검증한다. */
function parseIntInput(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export default function QuoteDetailClient({
  projectId,
  quoteId,
}: {
  projectId: string;
  quoteId: string;
}) {
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [quoteDate, setQuoteDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [contracting, setContracting] = useState(false);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [newItem, setNewItem] = useState<NewItemForm>(EMPTY_NEW_ITEM);
  const [adding, setAdding] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  // 기본정보 폼을 사용자가 만졌으면 리패치가 폼 값을 덮어쓰지 않는다.
  const infoTouchedRef = useRef(false);
  const benchmarks = useBenchmarks(projectId);
  const router = useRouter();

  const apiRequest = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const res = await fetch(url, init);
      if (res.status === 401) router.replace("/login");
      return res;
    },
    [router],
  );

  const applyQuote = useCallback((data: QuoteData, resetFields: boolean) => {
    setQuote(data);
    if (resetFields || !infoTouchedRef.current) {
      setQuoteDate(data.quoteDate.slice(0, 10));
      setGuestCount(String(data.guestCount));
      setValidUntil(data.validUntil === null ? "" : data.validUntil.slice(0, 10));
      setNotes(data.notes ?? "");
      infoTouchedRef.current = false;
    }
  }, []);

  // 상태를 바꾸지 않는 순수 페처 — 이펙트/set-state-in-effect 규칙과 핸들러가 함께 쓴다.
  const fetchQuote = useCallback(
    async (): Promise<{ ok: true; data: QuoteData } | { ok: false; message: string }> => {
      const res = await apiRequest(`/api/quotes/${quoteId}`);
      if (!res.ok) return { ok: false, message: `견적을 불러올 수 없습니다. (${res.status})` };
      const data: unknown = await res.json();
      if (!isQuoteData(data)) return { ok: false, message: "견적 응답 형식이 올바르지 않습니다." };
      return { ok: true, data };
    },
    [apiRequest, quoteId],
  );

  const syncQuote = useCallback(async (): Promise<void> => {
    const result = await fetchQuote();
    if (result.ok) applyQuote(result.data, false);
  }, [fetchQuote, applyQuote]);

  useEffect(() => {
    let active = true;
    fetchQuote()
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setLoadError(result.message);
          return;
        }
        applyQuote(result.data, false);
      })
      .catch(() => {
        if (active) setLoadError("네트워크 오류가 발생했습니다.");
      });
    return () => {
      active = false;
    };
  }, [fetchQuote, applyQuote]);

  // 원본 파일: 프로젝트 문서 전체를 받아 quoteId가 이 견적인 것만 클라이언트에서 걸러낸다.
  useEffect(() => {
    let active = true;
    void (async () => {
      const res = await apiRequest(`/api/projects/${projectId}/documents`);
      if (!res.ok || !active) return;
      const data: unknown = await res.json();
      if (
        typeof data === "object" &&
        data !== null &&
        "documents" in data &&
        Array.isArray(data.documents) &&
        active
      ) {
        setDocuments(
          data.documents.filter(isDocumentRow).filter((doc) => doc.quoteId === quoteId),
        );
      }
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [apiRequest, projectId, quoteId]);

  /** 항목 로컬 편집. qty·unitPrice·itemCode가 바뀌면 amount도 도메인 규칙으로 재계산해 둔다. */
  const changeItem = (itemId: string, patch: Partial<QuoteItemRow>) => {
    setQuote((prev) => {
      if (prev === null) return prev;
      return {
        ...prev,
        quoteItems: prev.quoteItems.map((item) => {
          if (item.id !== itemId) return item;
          const next = { ...item, ...patch };
          return { ...next, amount: normalizeQuoteItemAmount(next.qty, next.unitPrice, next.itemCode) };
        }),
      };
    });
  };

  const addItem = async () => {
    const qty = Number.parseInt(newItem.qty, 10);
    const unitPrice = Number.parseInt(newItem.unitPrice, 10);
    if (newItem.rawName.trim().length === 0) {
      setActionError("항목명을 입력하세요.");
      return;
    }
    if (!Number.isInteger(qty) || qty < 1) {
      setActionError("수량은 1 이상의 정수여야 합니다.");
      return;
    }
    if (!Number.isInteger(unitPrice)) {
      setActionError("단가는 정수여야 합니다.");
      return;
    }
    setActionError(null);
    setNotice(null);
    setAdding(true);
    try {
      const res = await apiRequest(`/api/quotes/${quoteId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawName: newItem.rawName,
          itemCode: newItem.itemCode === "" ? null : newItem.itemCode,
          qty,
          unitPrice,
          required: newItem.required,
          selected: newItem.selected,
        }),
      });
      if (res.status === 409) {
        setActionError((await errorOf(res)) ?? CONFIRMED_NOTICE);
        await syncQuote();
        return;
      }
      if (!res.ok) {
        setActionError((await errorOf(res)) ?? `항목 추가에 실패했습니다. (${res.status})`);
        return;
      }
      const data: unknown = await res.json();
      if (!isQuoteItemRow(data)) {
        setActionError("항목 응답 형식이 올바르지 않습니다.");
        return;
      }
      // 서버 금액이 확정된 행을 로컬 목록에 즉시 반영 → 총액 요약이 바로 재계산된다.
      setQuote((prev) => (prev === null ? prev : { ...prev, quoteItems: [...prev.quoteItems, data] }));
      setNewItem(EMPTY_NEW_ITEM);
      setNotice("항목을 추가했습니다.");
      await syncQuote();
    } catch {
      setActionError("네트워크 오류가 발생했습니다.");
    } finally {
      setAdding(false);
    }
  };

  const saveItem = async (item: QuoteItemRow) => {
    if (item.rawName.trim().length === 0) {
      setActionError("항목명을 입력하세요.");
      return;
    }
    if (item.qty < 1) {
      setActionError("수량은 1 이상의 정수여야 합니다.");
      return;
    }
    setActionError(null);
    setNotice(null);
    setSavingItemId(item.id);
    try {
      const res = await apiRequest(`/api/quotes/${quoteId}/items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawName: item.rawName,
          itemCode: item.itemCode,
          qty: item.qty,
          unitPrice: item.unitPrice,
          required: item.required,
          selected: item.selected,
        }),
      });
      if (res.status === 409) {
        setActionError((await errorOf(res)) ?? CONFIRMED_NOTICE);
        await syncQuote();
        return;
      }
      if (!res.ok) {
        setActionError((await errorOf(res)) ?? `항목 수정에 실패했습니다. (${res.status})`);
        return;
      }
      const data: unknown = await res.json();
      if (!isQuoteItemRow(data)) {
        setActionError("항목 응답 형식이 올바르지 않습니다.");
        return;
      }
      setQuote((prev) =>
        prev === null
          ? prev
          : { ...prev, quoteItems: prev.quoteItems.map((it) => (it.id === data.id ? data : it)) },
      );
      setNotice("항목을 저장했습니다.");
      await syncQuote();
    } catch {
      setActionError("네트워크 오류가 발생했습니다.");
    } finally {
      setSavingItemId(null);
    }
  };

  const deleteItem = async (itemId: string) => {
    setActionError(null);
    setNotice(null);
    setDeletingItemId(itemId);
    try {
      const res = await apiRequest(`/api/quotes/${quoteId}/items/${itemId}`, { method: "DELETE" });
      if (res.status === 409) {
        setActionError((await errorOf(res)) ?? CONFIRMED_NOTICE);
        await syncQuote();
        return;
      }
      if (!res.ok) {
        setActionError((await errorOf(res)) ?? `항목 삭제에 실패했습니다. (${res.status})`);
        return;
      }
      setQuote((prev) =>
        prev === null ? prev : { ...prev, quoteItems: prev.quoteItems.filter((it) => it.id !== itemId) },
      );
      setNotice("항목을 삭제했습니다.");
      await syncQuote();
    } catch {
      setActionError("네트워크 오류가 발생했습니다.");
    } finally {
      setDeletingItemId(null);
    }
  };

  const saveBasicInfo = async () => {
    if (quoteDate === "") {
      setActionError("견적일을 입력하세요.");
      return;
    }
    const guests = Number.parseInt(guestCount, 10);
    if (!Number.isInteger(guests) || guests < 0) {
      setActionError("하객 인원은 0 이상의 정수여야 합니다.");
      return;
    }
    setActionError(null);
    setNotice(null);
    setSavingInfo(true);
    try {
      const res = await apiRequest(`/api/quotes/${quoteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteDate,
          guestCount: guests,
          validUntil: validUntil === "" ? null : validUntil,
          notes: notes === "" ? null : notes,
        }),
      });
      if (!res.ok) {
        setActionError((await errorOf(res)) ?? `기본정보 저장에 실패했습니다. (${res.status})`);
        return;
      }
      const data: unknown = await res.json();
      if (!isQuoteData(data)) {
        setActionError("견적 응답 형식이 올바르지 않습니다.");
        return;
      }
      applyQuote(data, true);
      setNotice("기본정보를 저장했습니다.");
    } catch {
      setActionError("네트워크 오류가 발생했습니다.");
    } finally {
      setSavingInfo(false);
    }
  };

  const confirmQuote = async () => {
    setActionError(null);
    setNotice(null);
    setConfirming(true);
    try {
      const res = await apiRequest(`/api/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" }),
      });
      if (!res.ok) {
        setActionError((await errorOf(res)) ?? `견적 확정에 실패했습니다. (${res.status})`);
        return;
      }
      const data: unknown = await res.json();
      if (!isQuoteData(data)) {
        setActionError("견적 응답 형식이 올바르지 않습니다.");
        return;
      }
      applyQuote(data, true);
      setNotice("견적을 확정했습니다.");
    } catch {
      setActionError("네트워크 오류가 발생했습니다.");
    } finally {
      setConfirming(false);
    }
  };

  // 계약 API(task 23)는 병렬 착수다. 404(미실장·라우트 부재)와 409(이미 계약됨)는 안내 문구로 흡수한다.
  const toContract = async () => {
    setActionError(null);
    setNotice(null);
    setContracting(true);
    try {
      const signedDate = new Date().toISOString().slice(0, 10);
      const res = await apiRequest("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId, signedDate }),
      });
      if (res.ok) {
        setNotice("계약으로 전환했습니다.");
        return;
      }
      if (res.status === 409) {
        setActionError((await errorOf(res)) ?? "이미 계약된 견적입니다.");
        return;
      }
      if (res.status === 404) {
        setActionError((await errorOf(res)) ?? "계약 기능이 아직 준비되지 않았습니다.");
        return;
      }
      setActionError((await errorOf(res)) ?? `계약 전환에 실패했습니다. (${res.status})`);
    } catch {
      setActionError("네트워크 오류가 발생했습니다.");
    } finally {
      setContracting(false);
    }
  };

  const draft = quote?.status === "DRAFT";
  // 총액은 저장 값이 아니라 조회 시점 계산이므로 매 렌더마다 로컬 목록에서 재계산한다.
  const minTotalText = quote === null ? "…" : formatKRW(minTotal(quote.quoteItems));
  const withOptionsTotalText =
    quote === null ? "…" : formatKRW(withOptionsTotal(quote.quoteItems));
  const perGuestText =
    quote === null
      ? "…"
      : (() => {
          const value = perGuest(quote.quoteItems, quote.guestCount);
          return value === null ? "인원 미정" : formatKRW(value);
        })();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 font-sans">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">견적 상세</h1>
          {quote !== null && (
            <span
              className={
                draft
                  ? "rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600"
                  : "rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
              }
            >
              {draft ? "임시" : "확정"}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className={buttonClass}
            href={`/projects/${projectId}/quotes/compare?ids=${quoteId}`}
          >
            비교에 추가
          </Link>
          <button className={buttonClass} onClick={() => void toContract()} disabled={contracting}>
            계약 전환
          </button>
          {draft && (
            <button
              className={primaryButtonClass}
              onClick={() => void confirmQuote()}
              disabled={confirming}
            >
              확정
            </button>
          )}
        </div>
      </header>

      {quote !== null && !draft && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {CONFIRMED_NOTICE}
        </p>
      )}
      {quote === null &&
        (loadError === null ? (
          <p className="text-sm text-zinc-500">견적을 불러오는 중…</p>
        ) : (
          <p className="text-sm text-red-600">{loadError}</p>
        ))}
      {notice !== null && <p className="text-sm text-emerald-700">{notice}</p>}
      {actionError !== null && <p className="text-sm text-red-600">{actionError}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">기본정보</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            견적일
            <input
              className={inputClass}
              type="date"
              value={quoteDate}
              onChange={(e) => {
                infoTouchedRef.current = true;
                setQuoteDate(e.target.value);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            하객 인원
            <input
              className={inputClass}
              type="number"
              min={0}
              step={1}
              value={guestCount}
              onChange={(e) => {
                infoTouchedRef.current = true;
                setGuestCount(e.target.value);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            유효기간 (비워 두면 없음)
            <input
              className={inputClass}
              type="date"
              value={validUntil}
              onChange={(e) => {
                infoTouchedRef.current = true;
                setValidUntil(e.target.value);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-zinc-700">
            메모
            <textarea
              className={inputClass}
              rows={2}
              value={notes}
              onChange={(e) => {
                infoTouchedRef.current = true;
                setNotes(e.target.value);
              }}
            />
          </label>
        </div>
        <div>
          <button
            className={primaryButtonClass}
            onClick={() => void saveBasicInfo()}
            disabled={savingInfo || quote === null}
          >
            기본정보 저장
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">항목</h2>
        <p className="text-xs text-zinc-500">
          소계 아래 &apos;지역 평균 대비&apos;는 같은 지역 참가격 평균과의 차이입니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="py-2 pr-2 font-medium">항목명</th>
                <th className="py-2 pr-2 font-medium">분류</th>
                <th className="py-2 pr-2 font-medium">수량</th>
                <th className="py-2 pr-2 font-medium">단가</th>
                <th className="py-2 pr-2 font-medium">소계</th>
                <th className="py-2 pr-2 text-center font-medium">필수</th>
                <th className="py-2 pr-2 text-center font-medium">선택</th>
                <th className="py-2 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {(quote?.quoteItems ?? []).map((item) => (
                <tr key={item.id} className="border-b border-zinc-100">
                  <td className="py-2 pr-2">
                    <input
                      className={inputClass}
                      value={item.rawName}
                      disabled={!draft}
                      onChange={(e) => changeItem(item.id, { rawName: e.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      className={inputClass}
                      value={item.itemCode ?? ""}
                      disabled={!draft}
                      onChange={(e) =>
                        changeItem(item.id, { itemCode: e.target.value === "" ? null : e.target.value })
                      }
                    >
                      <option value="">미분류</option>
                      {ITEM_CODES.map((code) => (
                        <option key={code} value={code}>
                          {ITEM_CODE_LABELS[code]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      className={`${inputClass} w-16`}
                      type="number"
                      min={1}
                      step={1}
                      value={item.qty}
                      disabled={!draft}
                      onChange={(e) => changeItem(item.id, { qty: parseIntInput(e.target.value) })}
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      className={`${inputClass} w-24`}
                      type="number"
                      step={1}
                      value={item.unitPrice}
                      disabled={!draft}
                      onChange={(e) =>
                        changeItem(item.id, { unitPrice: parseIntInput(e.target.value) })
                      }
                    />
                  </td>
                  <td className="whitespace-nowrap py-2 pr-2 tabular-nums">
                    {formatKRW(item.amount)}
                    <BenchmarkDeltaLabel
                      source={benchmarks}
                      itemCode={item.itemCode}
                      amount={item.amount}
                    />
                  </td>
                  <td className="py-2 pr-2 text-center">
                    <input
                      type="checkbox"
                      checked={item.required}
                      disabled={!draft}
                      onChange={(e) => changeItem(item.id, { required: e.target.checked })}
                    />
                  </td>
                  <td className="py-2 pr-2 text-center">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      disabled={!draft}
                      onChange={(e) => changeItem(item.id, { selected: e.target.checked })}
                    />
                  </td>
                  <td className="whitespace-nowrap py-2">
                    <button
                      className={buttonClass}
                      onClick={() => void saveItem(item)}
                      disabled={!draft || savingItemId === item.id}
                    >
                      저장
                    </button>{" "}
                    <button
                      className={buttonClass}
                      onClick={() => void deleteItem(item.id)}
                      disabled={!draft || deletingItemId === item.id}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {quote !== null && quote.quoteItems.length === 0 && (
          <p className="text-sm text-zinc-500">항목이 없습니다.</p>
        )}

        {draft && (
          <div className="flex flex-col gap-2 rounded-md border border-zinc-200 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-sm text-zinc-700">
                항목명
                <input
                  className={inputClass}
                  value={newItem.rawName}
                  onChange={(e) => setNewItem({ ...newItem, rawName: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-zinc-700">
                분류
                <select
                  className={inputClass}
                  value={newItem.itemCode}
                  onChange={(e) => setNewItem({ ...newItem, itemCode: e.target.value })}
                >
                  <option value="">미분류</option>
                  {ITEM_CODES.map((code) => (
                    <option key={code} value={code}>
                      {ITEM_CODE_LABELS[code]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-zinc-700">
                수량
                <input
                  className={`${inputClass} w-16`}
                  type="number"
                  min={1}
                  step={1}
                  value={newItem.qty}
                  onChange={(e) => setNewItem({ ...newItem, qty: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-zinc-700">
                단가
                <input
                  className={`${inputClass} w-24`}
                  type="number"
                  step={1}
                  value={newItem.unitPrice}
                  onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-zinc-700">
                필수
                <input
                  type="checkbox"
                  className="mb-2"
                  checked={newItem.required}
                  onChange={(e) => setNewItem({ ...newItem, required: e.target.checked })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-zinc-700">
                선택
                <input
                  type="checkbox"
                  className="mb-2"
                  checked={newItem.selected}
                  onChange={(e) => setNewItem({ ...newItem, selected: e.target.checked })}
                />
              </label>
              <button
                className={primaryButtonClass}
                onClick={() => void addItem()}
                disabled={adding}
              >
                항목 추가
              </button>
            </div>
            {newItem.itemCode === "DISCOUNT" && (
              <p className="text-xs text-zinc-500">금액은 자동으로 음수 처리됩니다</p>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">총액 요약</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-zinc-200 p-3">
            <dt className="text-xs text-zinc-500">최소총액 (필수 항목)</dt>
            <dd className="text-lg font-semibold tabular-nums text-zinc-900">{minTotalText}</dd>
          </div>
          <div className="rounded-md border border-zinc-200 p-3">
            <dt className="text-xs text-zinc-500">옵션포함총액</dt>
            <dd className="text-lg font-semibold tabular-nums text-zinc-900">
              {withOptionsTotalText}
            </dd>
          </div>
          <div className="rounded-md border border-zinc-200 p-3">
            <dt className="text-xs text-zinc-500">1인당비용</dt>
            <dd className="text-lg font-semibold tabular-nums text-zinc-900">{perGuestText}</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-zinc-900">원본 파일</h2>
        {quote === null ? (
          <p className="text-sm text-zinc-500">…</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-zinc-500">연결된 원본 파일이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-baseline gap-2">
                <a
                  className="font-medium text-zinc-900 underline hover:text-zinc-600"
                  href={`/api/documents/${doc.id}/file`}
                >
                  {doc.fileName}
                </a>
                <span className="text-xs text-zinc-500">{doc.createdAt.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
