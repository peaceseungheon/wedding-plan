/**
 * 카카오 로컬(키워드) 검색 어댑터. 서버 전용 모듈이다 — API 키가 새지 않게
 * 라우트 핸들러 밖(클라이언트 컴포넌트·브라우저)에서 임포트하지 않는다.
 */

const KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
const MAX_RESULTS = 15;

export type KakaoPlace = {
  readonly placeName: string;
  readonly address: string;
  readonly roadAddress: string;
  readonly phone: string;
  readonly placeUrl: string;
};

/** ok=false는 키 없음·네트워크 실패·non-2xx·응답 파싱 실패를 하나로 합친 fallback 신호다. */
export type KakaoSearchResult =
  | { readonly ok: true; readonly results: readonly KakaoPlace[] }
  | { readonly ok: false };

/** 카카오 document의 필드는 문자열이거나 누락된다. 누락·비문자열은 빈 문자열로 정규화한다. */
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseDocument(value: unknown): KakaoPlace | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("place_name" in value)) return null;
  if (!("address_name" in value)) return null;
  if (!("road_address_name" in value)) return null;
  if (!("phone" in value)) return null;
  if (!("place_url" in value)) return null;
  return {
    placeName: text(value.place_name),
    address: text(value.address_name),
    roadAddress: text(value.road_address_name),
    phone: text(value.phone),
    placeUrl: text(value.place_url),
  };
}

function parseResults(payload: unknown): KakaoPlace[] {
  if (typeof payload !== "object" || payload === null) return [];
  if (!("documents" in payload)) return [];
  const documents = payload.documents;
  if (!Array.isArray(documents)) return [];
  return documents.slice(0, MAX_RESULTS).flatMap((document): KakaoPlace[] => {
    const place = parseDocument(document);
    return place === null ? [] : [place];
  });
}

/**
 * 키워드로 장소를 검색한다. 실패는 던지지 않고 ok=false로 보고한다
 * (키 부재·네트워크 오류·non-2xx 모두 호출부의 수동 등록 fallback으로 귀결). 재시도 없음.
 */
export async function searchVendors(query: string): Promise<KakaoSearchResult> {
  const apiKey = process.env.KAKAO_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    return { ok: false };
  }

  const url = `${KEYWORD_SEARCH_URL}?${new URLSearchParams({ query })}`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      return { ok: false };
    }
    const payload: unknown = await response.json();
    return { ok: true, results: parseResults(payload) };
  } catch {
    // 네트워크 오류·JSON 파싱 실패도 fallback 신호다. 스펙상 재시도하지 않는다.
    return { ok: false };
  }
}
