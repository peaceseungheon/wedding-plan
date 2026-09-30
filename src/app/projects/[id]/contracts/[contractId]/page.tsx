import ContractClient from "./contract-client";

/**
 * 계약 상세 화면. params 언래핑만 서버에서 수행하고 상호작용 로직은
 * 같은 디렉터리의 클라이언트 컴포넌트로 넘긴다(견적 상세 화면과 동일 구조).
 */
export default async function ContractPage({
  params,
}: {
  params: Promise<{ id: string; contractId: string }>;
}) {
  const { id, contractId } = await params;
  return <ContractClient projectId={id} contractId={contractId} />;
}
