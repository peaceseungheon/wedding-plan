import { describe, expect, it } from "vitest";
import { computeMapViewport } from "@/lib/domain/map-viewport";

describe("computeMapViewport", () => {
  it("점이 없으면 서울 중심 전국 기본 뷰를 돌려준다", () => {
    expect(computeMapViewport([])).toEqual({ center: { lat: 37.5665, lng: 126.978 }, level: 12 });
  });

  it("점이 한 곳이면 그 좌표를 중심으로 가까이 확대한다", () => {
    const viewport = computeMapViewport([{ latitude: 35.1796, longitude: 129.0756 }]);
    expect(viewport.center.lat).toBeCloseTo(35.1796);
    expect(viewport.center.lng).toBeCloseTo(129.0756);
    expect(viewport.level).toBe(3);
  });

  it("서울~부산처럼 전국 규모로 퍼져 있면 광역 뷰를 돌려준다", () => {
    const viewport = computeMapViewport([
      { latitude: 37.5665, longitude: 126.978 },
      { latitude: 35.1796, longitude: 129.0756 },
    ]);
    expect(viewport.center.lat).toBeCloseTo(36.37305);
    expect(viewport.center.lng).toBeCloseTo(128.0268);
    expect(viewport.level).toBe(12);
  });

  it("좁은 범위에 몰려 있으면 근거리 뷰를 돌려준다", () => {
    const viewport = computeMapViewport([
      { latitude: 37.5013, longitude: 127.0396 },
      { latitude: 37.5088, longitude: 127.0467 },
    ]);
    expect(viewport.level).toBe(4);
  });

  it("경도 방향 폭은 위도 환산 비율을 반영해 수준을 정한다", () => {
    // 같은 위도에서 경도 차 0.25 → 환산 span 0.2 → level 9.
    const wide = computeMapViewport([
      { latitude: 37.5, longitude: 126.9 },
      { latitude: 37.5, longitude: 127.15 },
    ]);
    expect(wide.level).toBe(9);
    // 경도 차 0.05 → 환산 span 0.04 → 0.02 이상 0.05 미만 → level 5.
    const narrow = computeMapViewport([
      { latitude: 37.5, longitude: 126.9 },
      { latitude: 37.5, longitude: 126.95 },
    ]);
    expect(narrow.level).toBe(5);
  });
});
