"use client";

import { PlaceMap, type PlaceMarker } from "./place-map";

/** 지도에 마커로 표시할 예식장 한 건. 좌표가 있는 홀만 이 형태로 넘어온다. */
export type WeddingHallMapMarker = {
  id: string;
  venueName: string;
  region: string;
  latitude: number;
  longitude: number;
};

/**
 * 예식장 위치 지도. 지도 셸 자체는 장소 공통 구조(place-map)에 있고
 * 여기는 예식장 전용 필드(venueName·region)를 PlaceMarker로 옮기는
 * 어댑터다 — 목록 페이지의 인터페이스는 그대로다.
 */
export function WeddingHallMap({ halls }: { halls: readonly WeddingHallMapMarker[] }) {
  const markers: PlaceMarker[] = halls.map((hall) => ({
    id: hall.id,
    name: hall.venueName,
    address: hall.region,
    latitude: hall.latitude,
    longitude: hall.longitude,
    detailUrl: `/wedding-halls/${hall.id}`,
  }));
  return (
    <PlaceMap
      title="위치 지도"
      markers={markers}
      emptyMessage="좌표가 있는 예식장이 없다. 좌표 변환(geocode)이 끝나면 마커가 표시된다."
    />
  );
}
