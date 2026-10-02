import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import CompareClient from "./compare-client";

/**
 * 견적 비교 화면. ids 검색 파라미터(?ids=a,b) 파싱은 서버에서 수행한다.
 * 선택된 견적이 없으면 안내 문구와 견적 목록 링크(task 29)만 렌더하고,
 * 있으면 비교 조회·렌더를 클라이언트 컴포넌트로 넘긴다.
 */
export default async function QuoteComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const ids = parseIds(query.ids);

  if (ids === null) {
    return (
      <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-4 pt-8 pb-16">
        <PageHeader title="견적 비교" />
        <Card>
          <p className="text-sm text-ink-muted">
            비교할 견적이 선택되지 않았습니다. 견적 목록에서 견적 2개 이상을 선택해주세요.
          </p>
          <Link className={`${buttonClass("secondary", "sm")} mt-4`} href={`/projects/${id}/quotes`}>
            견적 선택하러 가기
          </Link>
        </Card>
      </main>
    );
  }

  return <CompareClient projectId={id} ids={ids} />;
}

/** ids 파라미터(단일 문자열 또는 반복 파라미터)를 견적 id 배열로 정규화한다. 빈 값은 null. */
function parseIds(raw: string | string[] | undefined): string[] | null {
  const joined = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  const ids = [
    ...new Set(
      joined
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  ];
  return ids.length === 0 ? null : ids;
}
