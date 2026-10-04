/**
 * 지도 프로바이더 공용 디스패처. 프로바이더 교체(kakao↔naver)가 이 파일 하나로 끝나게
 * 밖에서는 개별 어댑터 대신 이 모듈을 임포트한다. 서버 전용 — 클라이언트 컴포넌트에서 임포트하지 않는다.
 */

import { searchAddress as searchAddressViaKakao } from "@/lib/adapters/kakao";
import { searchAddress as searchAddressViaNaver } from "@/lib/adapters/naver";

export type MapProvider = "kakao" | "naver";

/** 두 프로바이더 어댑터가 공통으로 쓰는 좌표 변환 결과 계약이다. */
export type GeocodeResult =
  | { readonly ok: true; readonly coordinates: { readonly latitude: number; readonly longitude: number } }
  | { readonly ok: false };

/** NEXT_PUBLIC_MAP_PROVIDER가 "kakao"일 때만 카카오, 나머지(기본값 포함)는 네이버다. */
export function activeMapProvider(): MapProvider {
  return process.env.NEXT_PUBLIC_MAP_PROVIDER === "kakao" ? "kakao" : "naver";
}

/**
 * 활성 프로바이더의 주소→좌표 변환으로 위임한다. 각 어댑터의 실패 계약(ok=false fail-soft)을
 * 그대로 통과시킨다.
 */
export async function searchAddress(query: string): Promise<GeocodeResult> {
  return activeMapProvider() === "kakao"
    ? searchAddressViaKakao(query)
    : searchAddressViaNaver(query);
}
