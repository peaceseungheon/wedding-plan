/** 지도 뷰포트 계산용 좌표. */
export type MapPoint = {
  latitude: number;
  longitude: number;
};

/** 지도 중심과 확대 수준. level은 카카오맵 단계로, 클수록 넓게 보인다. */
export type MapViewport = {
  center: { lat: number; lng: number };
  level: number;
};

/** 좌표가 없을 때 기본으로 보여줄 전국 뷰(서울 중심). */
const FALLBACK_VIEWPORT: MapViewport = { center: { lat: 37.5665, lng: 126.978 }, level: 12 };

/** 한반도 위도에서 위도 1도 대비 경도 1도의 실제 거리 비(근사). 경도 span을 위도 단위로 환산해 비교한다. */
const LNG_SPAN_RATIO = 0.8;

/** 위도 환산 span → 확대 수준 대응표. 위에서부터 비교해 만족하는 첫 행을 쓴다. */
const LEVEL_TABLE: ReadonlyArray<readonly [minSpan: number, level: number]> = [
  [1.6, 12],
  [0.8, 11],
  [0.4, 10],
  [0.2, 9],
  [0.1, 8],
  [0.05, 7],
  [0.02, 5],
];

/** 마커 묶음 전체를 담는 지도 중심과 확대 수준을 계산한다. 점이 없으면 전국 기본 뷰를 돌려준다. */
export function computeMapViewport(points: readonly MapPoint[]): MapViewport {
  if (points.length === 0) {
    return FALLBACK_VIEWPORT;
  }
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const center = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  if (points.length === 1) {
    return { center, level: 3 };
  }
  const span = Math.max(maxLat - minLat, (maxLng - minLng) * LNG_SPAN_RATIO);
  for (const [minSpan, level] of LEVEL_TABLE) {
    if (span >= minSpan) {
      return { center, level };
    }
  }
  return { center, level: 4 };
}
