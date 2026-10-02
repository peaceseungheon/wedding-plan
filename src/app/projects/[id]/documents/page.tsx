"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

/** GET /api/projects/{id}/documents 응답 행. 서버는 최근 업로드순으로 준다. */
type DocumentRow = {
  id: string;
  fileName: string;
  size: number;
  createdAt: string;
  quoteId: string | null;
};

function parseDocuments(raw: unknown): DocumentRow[] {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("documents" in raw) ||
    !Array.isArray(raw.documents)
  ) {
    return [];
  }
  const rows: DocumentRow[] = [];
  for (const item of raw.documents) {
    if (
      typeof item === "object" &&
      item !== null &&
      "id" in item &&
      typeof item.id === "string" &&
      "fileName" in item &&
      typeof item.fileName === "string" &&
      "size" in item &&
      typeof item.size === "number" &&
      "createdAt" in item &&
      typeof item.createdAt === "string" &&
      "quoteId" in item &&
      (item.quoteId === null || typeof item.quoteId === "string")
    ) {
      rows.push({
        id: item.id,
        fileName: item.fileName,
        size: item.size,
        createdAt: item.createdAt,
        quoteId: item.quoteId,
      });
    }
  }
  return rows;
}

/** 바이트 크기를 사람 단위(B/KB/MB)로 바꾼다. 업로드 상한이 10MB라 MB 위에는 없다. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [documents, setDocuments] = useState<DocumentRow[] | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // setState를 .then 콜백 안에 두는 형태여야 set-state-in-effect 린트를 통과한다.
  const load = useCallback((): void => {
    fetch(`/api/projects/${projectId}/documents`, { credentials: "include" })
      .then(
        (res): Promise<DocumentRow[] | "auth" | "fail"> =>
          res.status === 401
            ? Promise.resolve("auth")
            : res.ok
              ? res.json().then((raw: unknown) => parseDocuments(raw))
              : Promise.resolve("fail"),
      )
      .then((result) => {
        if (result === "auth") {
          router.replace("/login");
          return;
        }
        if (result === "fail") {
          setError("문서 목록을 불러오지 못했습니다.");
          return;
        }
        setDocuments(result);
        setError(null);
      })
      .catch(() => {
        setError("문서 목록을 불러오지 못했습니다.");
      });
  }, [projectId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (selectedFile === null) {
      setError("업로드할 파일을 선택하세요.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const res = await fetch(`/api/projects/${projectId}/documents`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 413) {
        setError("10MB 이하만 가능합니다");
        return;
      }
      if (res.status === 415) {
        setError("지원하지 않는 형식입니다");
        return;
      }
      if (!res.ok) {
        try {
          const raw: unknown = await res.json();
          if (
            typeof raw === "object" &&
            raw !== null &&
            "error" in raw &&
            typeof raw.error === "string"
          ) {
            setError(raw.error);
            return;
          }
        } catch {
          // 본문이 JSON이 아니면 기본 문구로 폴백한다.
        }
        setError("업로드에 실패했습니다.");
        return;
      }
      setSelectedFile(null);
      if (fileInputRef.current !== null) {
        fileInputRef.current.value = "";
      }
      await load();
    } catch {
      setError("업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 pt-8 pb-16">
      <PageHeader title="문서" meta={documents === null ? undefined : <span>문서 {documents.length}건</span>} />

      <Card title="업로드한 문서">
        {documents === null ? (
          <p className="text-sm text-ink-muted">불러오는 중...</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-ink-muted">업로드된 문서가 없습니다.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {documents.map((doc) => (
              <li key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm first:pt-0 last:pb-0">
                <span className="min-w-0 flex-1 basis-40 truncate" title={doc.fileName}>
                  {doc.fileName}
                </span>
                <span className="tabular-nums text-ink-muted">{formatSize(doc.size)}</span>
                <span className="tabular-nums text-ink-subtle">{doc.createdAt.slice(0, 10)}</span>
                <a href={`/api/documents/${doc.id}/file`} className={buttonClass("secondary", "sm")}>
                  다운로드
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="문서 업로드">
        <form onSubmit={(event) => void upload(event)} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              aria-label="업로드할 파일 선택"
              accept=".pdf,.jpg,.jpeg,.png,.hwp,.docx,.xlsx,.zip"
              className="min-w-0 max-w-full text-sm text-ink-muted"
            />
            <Button type="submit" disabled={uploading || selectedFile === null}>
              업로드
            </Button>
          </div>
          <p className="text-xs text-ink-subtle">PDF·JPG·PNG·HWP·DOCX·XLSX·ZIP, 10MB 이하</p>
          {uploading && <p className="text-sm text-ink-muted">업로드 중...</p>}
          {error !== null && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
        </form>
      </Card>
    </main>
  );
}
