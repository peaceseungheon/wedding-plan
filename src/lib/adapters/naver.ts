/**
 * 네이버 지도(주소 좌표 변환) 어댑터. 서버 전용 모듈이다 —
 * API 키가 새지 않게 라우트 핸들러 밖(클라이언트 컴포넌트·브라우저)에서 임포트하지 않는다.
 */

const GEOCODE_URL = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode";

export type NaverCoordinates = {
  readonly latitude: number;
  readonly longitude: number;
};

/** ok=false는 키 없음·네트워크 실패·non-2xx·파싱 실패·변환 결과 없음을 하나로 합친 신호다. */
export type NaverAddressResult =
  | { readonly ok: true; readonly coordinates: NaverCoordinates }
  | { readonly ok: false };

/** 응답 payload에서 addresses 배열을 꺼낸다. 형태가 다르면 빈 배열로 정규화한다. */
function addressesOf(payload: unknown): unknown[] {
  if (typeof payload !== "object" || payload === null) return [];
  if (!("addresses" in payload)) return [];
  const addresses = payload.addresses;
  return Array.isArray(addresses) ? addresses : [];
}

/** 네이버 좌표 필드는 문자열이며 x=경도, y=위도다. 비문자열·비유한값은 null로 정규화한다. */
function coordinate(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCoordinates(address: unknown): NaverCoordinates | null {
  if (typeof address !== "object" || address === null) return null;
  if (!("x" in address) || !("y" in address)) return null;
  const longitude = coordinate(address.x);
  const latitude = coordinate(address.y);
  if (longitude === null || latitude === null) return null;
  return { latitude, longitude };
}

/**
 * 주소 문자열을 위도·경도로 변환한다. 실패는 던지지 않고 ok=false로 보고한다
 * (키 부재·네트워크 오류·non-2xx·변환 결과 없음 모두 백필의 건너뜀으로 귀결). 재시도 없음.
 */
export async function searchAddress(query: string): Promise<NaverAddressResult> {
  const clientId = process.env.NAVER_MAP_CLIENT_ID;
  const clientSecret = process.env.NAVER_MAP_CLIENT_SECRET;
  if (clientId === undefined || clientId.length === 0) {
    return { ok: false };
  }
  if (clientSecret === undefined || clientSecret.length === 0) {
    return { ok: false };
  }

  const url = `${GEOCODE_URL}?${new URLSearchParams({ query })}`;
  try {
    const response = await fetch(url, {
      headers: {
        "x-ncp-apigw-api-key-id": clientId,
        "x-ncp-apigw-api-key": clientSecret,
      },
    });
    if (!response.ok) {
      return { ok: false };
    }
    const payload: unknown = await response.json();
    const first = addressesOf(payload)[0];
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
