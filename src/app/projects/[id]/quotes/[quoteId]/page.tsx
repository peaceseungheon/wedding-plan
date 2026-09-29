import QuoteDetailClient from "./quote-detail-client";

/**
 * 견적 상세 화면. params 언래핑만 서버에서 수행하고 상호작용 로직은
 * 같은 디렉터리의 클라이언트 컴포넌트로 넘긴다.
 */
export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string; quoteId: string }>;
}) {
  const { id, quoteId } = await params;
  return <QuoteDetailClient projectId={id} quoteId={quoteId} />;
}
