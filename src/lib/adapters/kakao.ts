/**
 * 카카오 로컬 검색(키워드 장소 검색·주소 좌표 변환) 어댑터. 서버 전용 모듈이다 —
 * API 키가 새지 않게 라우트 핸들러 밖(클라이언트 컴포넌트·브라우저)에서 임포트하지 않는다.
 */

const KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
const ADDRESS_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/address.json";
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

export type KakaoCoordinates = {
  readonly latitude: number;
  readonly longitude: number;
};

/** ok=false는 키 없음·네트워크 실패·non-2xx·파싱 실패·변환 결과 없음을 하나로 합친 신호다. */
export type KakaoAddressResult =
  | { readonly ok: true; readonly coordinates: KakaoCoordinates }
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

/** 응답 payload에서 documents 배열을 꺼낸다. 형태가 다르면 빈 배열로 정규화한다. */
function documentsOf(payload: unknown): unknown[] {
  if (typeof payload !== "object" || payload === null) return [];
  if (!("documents" in payload)) return [];
  const documents = payload.documents;
  return Array.isArray(documents) ? documents : [];
}

function parseResults(payload: unknown): KakaoPlace[] {
  return documentsOf(payload).slice(0, MAX_RESULTS).flatMap((document): KakaoPlace[] => {
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
      // 카카오 REST API는 KakaoAK 스킴만 받는다 — Bearer는 401로 거부된다.
      headers: { Authorization: `KakaoAK ${apiKey}` },
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

/** 카카오 좌표 필드는 문자열이며 x=경도, y=위도다. 비문자열·비유한값은 null로 정규화한다. */
function coordinate(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 주소 document는 지번(address) 좌표를 우선하고, 없으면 도로명(road_address) 좌표를 본다. */
function parseCoordinates(document: unknown): KakaoCoordinates | null {
  if (typeof document !== "object" || document === null) return null;
  const address = "address" in document ? document.address : undefined;
  const roadAddress = "road_address" in document ? document.road_address : undefined;
  const source =
    typeof address === "object" && address !== null
      ? address
      : typeof roadAddress === "object" && roadAddress !== null
        ? roadAddress
        : null;
  if (source === null) return null;
  if (!("x" in source) || !("y" in source)) return null;
  const longitude = coordinate(source.x);
  const latitude = coordinate(source.y);
  if (longitude === null || latitude === null) return null;
  return { latitude, longitude };
}

/**
 * 주소 문자열을 위도·경도로 변환한다. 실패는 던지지 않고 ok=false로 보고한다
 * (키 부재·네트워크 오류·non-2xx·변환 결과 없음 모두 백필의 건너뜀으로 귀결). 재시도 없음.
 */
export async function searchAddress(query: string): Promise<KakaoAddressResult> {
  const apiKey = process.env.KAKAO_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    return { ok: false };
  }

  const url = `${ADDRESS_SEARCH_URL}?${new URLSearchParams({ query })}`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${apiKey}` },
    });
    if (!response.ok) {
      return { ok: false };
    }
    const payload: unknown = await response.json();
    const first = documentsOf(payload)[0];
    if (first === undefined) {
      return { ok: false };
    }
    const coordinates = parseCoordinates(first);
    return coordinates === null ? { ok: false } : { ok: true, coordinates };
  } catch {
    // 네트워크 오류·JSON 파싱 실패도 fallback 신호다. 스펙상 재시도하지 않는다.
    return { ok: false };
  }
}
