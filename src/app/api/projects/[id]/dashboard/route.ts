import { NextResponse } from "next/server";
import { VENDOR_CATEGORY } from "../../../../../../generated/prisma/client";
import { requireProjectOwner, requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";

type RouteContext = { readonly params: Promise<{ readonly id: string }> };

type UpcomingPayment = {
  readonly id: string;
  readonly label: string;
  readonly amount: number;
  readonly dueDate: string;
};

type DashboardResponse = {
  readonly budgetTotal: number;
  readonly budgetByCategory: { readonly name: string; readonly plannedAmount: number }[];
  readonly contractedTotal: number;
  readonly paidTotal: number;
  readonly upcomingPayments: UpcomingPayment[];
  readonly tasksProgress: { readonly done: number; readonly total: number };
  readonly quoteCount: number;
  readonly vendorCount: number;
  readonly dDay: number | null;
  readonly contractedByVendorCategory: Record<VENDOR_CATEGORY, number>;
};

const MS_PER_DAY = 86_400_000;
const UPCOMING_LIMIT = 5;

/**
 * dDay 공식: 두 날짜를 UTC 자정 타임스탬프로 정규화한 뒤의 일수 차이.
 * 양수=미래, 0=오늘, 음수=과거. parseWeddingDate가 UTC 자정으로 저장하므로
 * 나눗셈은 항상 정수가 되고(Math.round는 부동소수 오차 방어일 뿐이다),
 * KST 오프셋과 서버 재부팅 시각과 무관하게 달력 일 기준으로 안정적이다.
 */
function dDayFrom(weddingDate: Date | null): number | null {
  if (weddingDate === null) return null;
  const now = new Date();
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const weddingMs = Date.UTC(
    weddingDate.getUTCFullYear(),
    weddingDate.getUTCMonth(),
    weddingDate.getUTCDate(),
  );
  return Math.round((weddingMs - todayMs) / MS_PER_DAY);
}

/**
 * 대시보드 집계. 가드 2회 + 중첩 select 1회 = 총 3쿼리로 끝낸다.
 * 행 순회 집계는 메모리에서만 하므로 N+1이 없다. 프로젝트가 비어 있어도
 * 모든 카운터는 0(배열·객체는 빈 값)으로 반환하고 dDay만 weddingDate가
 * 없을 때 null이다.
 */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const owned = await requireProjectOwner(id, auth.value.id);
  if (!owned.ok) return owned.response;

  const data = await prisma.wedding_projects.findFirst({
    where: { id: owned.value.id },
    select: {
      budgetCategories: {
        orderBy: { sortOrder: "asc" },
        select: { name: true, plannedAmount: true },
      },
      projectVendors: { select: { _count: { select: { quotes: true } } } },
      contracts: {
        select: {
          amountSnapshot: true,
          quote: {
            select: { projectVendor: { select: { vendor: { select: { category: true } } } } },
          },
          payments: { select: { id: true, label: true, amount: true, dueDate: true, paidAt: true } },
        },
      },
      tasks: { select: { done: true } },
    },
  });
  // 가드와 집계 쿼리 사이에 프로젝트가 삭제된 경합. 존재 은닉 원칙대로 404.
  if (data === null) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  const allPayments = data.contracts.flatMap((contract) => contract.payments);

  const contractedByVendorCategory: Record<VENDOR_CATEGORY, number> = {
    WEDDING_HALL: 0,
    STUDIO: 0,
    DRESS: 0,
    MAKEUP: 0,
    ETC: 0,
  };
  for (const contract of data.contracts) {
    contractedByVendorCategory[contract.quote.projectVendor.vendor.category] += contract.amountSnapshot;
  }

  const response: DashboardResponse = {
    budgetTotal: data.budgetCategories.reduce((sum, category) => sum + category.plannedAmount, 0),
    budgetByCategory: data.budgetCategories.map(({ name, plannedAmount }) => ({ name, plannedAmount })),
    contractedTotal: data.contracts.reduce((sum, contract) => sum + contract.amountSnapshot, 0),
    paidTotal: allPayments.reduce((sum, payment) => (payment.paidAt === null ? sum : sum + payment.amount), 0),
    upcomingPayments: allPayments
      .filter((payment) => payment.paidAt === null)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
      .slice(0, UPCOMING_LIMIT)
      .map((payment) => ({
        id: payment.id,
        label: payment.label,
        amount: payment.amount,
        dueDate: payment.dueDate.toISOString(),
      })),
    tasksProgress: {
      done: data.tasks.filter((task) => task.done).length,
      total: data.tasks.length,
    },
    quoteCount: data.projectVendors.reduce((sum, pv) => sum + pv._count.quotes, 0),
    vendorCount: data.projectVendors.length,
    dDay: dDayFrom(owned.value.weddingDate),
    contractedByVendorCategory,
  };

  return NextResponse.json(response);
}
