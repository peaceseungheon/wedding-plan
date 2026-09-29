import { NextResponse } from "next/server";
import { storage } from "@/lib/adapters/storage";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

// multipart/form-data 파싱과 디스크 쓰기는 Node 런타임 전용 기능이다.
export const runtime = "nodejs";

/** 10MB. 디스크에 쓰기 전에 byteLength로 검사한다. */
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

/** 확장자 화이트리스트 → MIME. 이 목록 밖의 확장자는 415다. */
const FILE_TYPES: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  hwp: "application/haansofthwp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

function toDocumentPayload(document: {
  readonly id: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly uploadedAt: Date;
  readonly quoteId: string | null;
}) {
  return {
    id: document.id,
    fileName: document.fileName,
    size: document.sizeBytes,
    createdAt: document.uploadedAt,
    quoteId: document.quoteId,
  };
}

/** 원본 파일명의 소문자 확장자. 점이 없거나 끝이 점이면 빈 문자열(허용 목록 밖). */
function fileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1 || lastDot === fileName.length - 1) return "";
  return fileName.slice(lastDot + 1).toLowerCase();
}

function fileMimeType(fileName: string): string | null {
  const extension = fileExtension(fileName);
  if (!(extension in FILE_TYPES)) return null;
  return FILE_TYPES[extension];
}

type RouteContext = { readonly params: Promise<{ readonly id: string }> };

/** 프로젝트 문서 목록. 최근 업로드순. */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const user = await requireUser(req);
  if (!user.ok) return user.response;
  const { id } = await ctx.params;

  const owned = await requireProjectOwner(id, user.value.id);
  if (!owned.ok) return owned.response;

  const documents = await prisma.documents.findMany({
    where: { projectId: owned.value.id },
    orderBy: { uploadedAt: "desc" },
  });

  return NextResponse.json({ documents: documents.map(toDocumentPayload) });
}

/**
 * multipart 업로드. file 필드 필수, quoteId(원본 견적서 연결)는 선택.
 * 저장 순서는 검증 → 파일 기록 → 행 생성이며, 행 생성이 실패하면 파일 잔여물을 치운다.
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const user = await requireUser(req);
  if (!user.ok) return user.response;
  const { id } = await ctx.params;

  const owned = await requireProjectOwner(id, user.value.id);
  if (!owned.ok) return owned.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data 본문이 필요합니다." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "file 필드에 업로드할 파일을 담아 보내세요." },
      { status: 400 },
    );
  }

  const quoteIdField = form.get("quoteId");
  let quoteId: string | null = null;
  if (quoteIdField !== null) {
    if (typeof quoteIdField !== "string" || quoteIdField.trim().length === 0) {
      return NextResponse.json({ error: "quoteId는 문자열이어야 합니다." }, { status: 400 });
    }
    // 원본 견적서는 같은 프로젝트 소속 견적만 연결할 수 있다. 남의 견적도 404로 숨긴다.
    const quote = await prisma.quotes.findFirst({
      where: { id: quoteIdField.trim(), projectVendor: { projectId: id } },
    });
    if (quote === null) {
      return NextResponse.json({ error: "연결할 견적을 찾을 수 없습니다." }, { status: 404 });
    }
    quoteId = quote.id;
  }

  const mimeType = fileMimeType(file.name);
  if (mimeType === null) {
    return NextResponse.json(
      {
        error: `지원하지 않는 파일 형식입니다. 허용 형식: ${Object.keys(FILE_TYPES).join(", ")}`,
      },
      { status: 415 },
    );
  }
  if (file.name.length > 190) {
    return NextResponse.json({ error: "파일 이름은 190자 이하여야 합니다." }, { status: 400 });
  }

  // 디스크에 쓰기 전에 크기를 검사한다.
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "파일 크기는 10MB 이하여야 합니다." }, { status: 413 });
  }

  const safeName = file.name.replace(/[/\\]/g, "_");
  // 프로젝트 디렉터리 아래에 격리한다: storage/uploads/{projectId}/{uuid}-{fileName}.
  const storedName = `${id}/${crypto.randomUUID()}-${safeName.slice(0, 120)}`;
  await storage.put(storedName, bytes);

  try {
    const created = await prisma.documents.create({
      data: {
        projectId: id,
        quoteId,
        fileName: file.name,
        storagePath: storedName,
        mimeType,
        sizeBytes: bytes.byteLength,
      },
    });
    return NextResponse.json({ document: toDocumentPayload(created) }, { status: 201 });
  } catch (error) {
    await storage.remove(storedName);
    throw error;
  }
}
