import { NextResponse } from "next/server";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

/**
 * 프로젝트의 계약 목록. contracts에는 createdAt 컬럼이 없으므로 "최신순"은
 * signedDate 내림차순으로 정의한다. 스냅샷 컬럼만 골라 내보내고 내부 식별자
 * (projectId 등)는 노출하지 않는다.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const user = await requireUser(req);
  if (!user.ok) return user.response;

  const project = await requireProjectOwner(id, user.value.id);
  if (!project.ok) return project.response;

  const contracts = await prisma.contracts.findMany({
    where: { projectId: project.value.id },
    orderBy: { signedDate: "desc" },
    select: {
      id: true,
      quoteId: true,
      vendorNameSnapshot: true,
      amountSnapshot: true,
      signedDate: true,
      notes: true,
    },
  });
  return NextResponse.json(contracts);
}
