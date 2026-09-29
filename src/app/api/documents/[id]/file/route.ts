import { NextResponse } from "next/server";
import { storage } from "@/lib/adapters/storage";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

type RouteContext = { readonly params: Promise<{ readonly id: string }> };

/** 문서 파일 다운로드. 소유 프로젝트의 문서만 허용하고 나머지는 404로 숨긴다. */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const user = await requireUser(req);
  if (!user.ok) return user.response;
  const { id } = await ctx.params;

  const document = await prisma.documents.findUnique({ where: { id } });
  if (document === null) {
    return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  const owned = await requireProjectOwner(document.projectId, user.value.id);
  if (!owned.ok) return owned.response;

  const bytes = await storage.get(document.storagePath);
  if (bytes === null) {
    return NextResponse.json({ error: "저장된 파일을 찾을 수 없습니다." }, { status: 404 });
  }

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
    },
  });
}
