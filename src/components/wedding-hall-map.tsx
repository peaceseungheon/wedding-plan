"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CustomOverlayMap,
  Map,
  MapMarker,
  MarkerClusterer,
  useKakaoLoader,
} from "react-kakao-maps-sdk";
import { Card } from "@/components/ui/card";
import { computeMapViewport } from "@/lib/domain/map-viewport";

/** 지도에 마커로 표시할 예식장 한 건. 좌표가 있는 홀만 이 형태로 넘어온다. */
export type WeddingHallMapMarker = {
  id: string;
  venueName: string;
  region: string;
  latitude: number;
  longitude: number;
};

/** 빌드 타임에 주입되는 카카오맵 JavaScript 키. 사이트 도메인 등록으로 보호되는 공개 키다. */
const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "";

/** 예식장 위치 지도. 좌표가 있는 홀만 클러스터 마커로 찍고, 마커를 클릭하면 상세 링크 오버레이를 띤다. */
export function WeddingHallMap({ halls }: { halls: readonly WeddingHallMapMarker[] }) {
  if (halls.length === 0) {
    return (
      <Card title="위치 지도">
        <p className="text-sm text-ink-muted">
          좌표가 있는 예식장이 없다. 좌표 변환(geocode)이 끝나면 마커가 표시된다.
        </p>
      </Card>
    );
  }
  if (KAKAO_JS_KEY === "") {
    return (
      <Card title="위치 지도" action={<CountLabel count={halls.length} />}>
        <p className="text-sm text-ink-muted">
          카카오맵 JavaScript 키가 설정되지 않았다. 카카오 개발자 콘솔에서 Web 플랫폼 사이트 도메인을
          등록하고 발급한 JavaScript 키를 NEXT_PUBLIC_KAKAO_JS_KEY로 설정하면 지도가 표시된다.
        </p>
      </Card>
    );
  }
  return <KakaoMapCanvas halls={halls} appkey={KAKAO_JS_KEY} />;
}

function CountLabel({ count }: { count: number }) {
  return (
    <span className="text-[13px] tabular-nums text-ink-muted">{count}곳</span>
  );
}

function KakaoMapCanvas({ halls, appkey }: { halls: readonly WeddingHallMapMarker[]; appkey: string }) {
  const [loading, error] = useKakaoLoader({ appkey, libraries: ["clusterer"] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const viewport = useMemo(() => computeMapViewport(halls), [halls]);
  const selectedHall = useMemo(
    () => halls.find((hall) => hall.id === selectedId) ?? null,
    [halls, selectedId],
  );

  return (
    <Card title="위치 지도" action={<CountLabel count={halls.length} />}>
      {loading ? (
        <div className="flex h-[280px] items-center justify-center rounded-lg border border-line sm:h-[420px]">
          <p className="text-sm text-ink-muted">지도를 불러오는 중…</p>
        </div>
      ) : error ? (
        <div className="flex h-[280px] flex-col items-center justify-center gap-2 rounded-lg border border-line px-4 text-center sm:h-[420px]">
          <p className="text-sm font-semibold">지도를 불러올 수 없다</p>
          <p className="text-[13px] text-ink-muted">
            카카오 개발자 콘솔의 사이트 도메인 등록과 지도 활성 상태를 확인한다.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          {/* 지도 타일과 마커는 카카오 SDK가 그리는 제3의 캔버스라 디자인 토큰이 적용되지 않는다. */}
          <Map
            center={viewport.center}
            className="h-[280px] w-full sm:h-[420px]"
            level={viewport.level}
            onClick={() => setSelectedId(null)}
          >
            <MarkerClusterer averageCenter minLevel={6}>
              {halls.map((hall) => (
                <MapMarker
                  key={hall.id}
                  position={{ lat: hall.latitude, lng: hall.longitude }}
                  title={hall.venueName}
                  onClick={() =>
                    setSelectedId((previous) => (previous === hall.id ? null : hall.id))
                  }
                />
              ))}
            </MarkerClusterer>
            {selectedHall ? (
              <CustomOverlayMap
                position={{ lat: selectedHall.latitude, lng: selectedHall.longitude }}
                yAnchor={1.4}
              >
                <div className="w-56 rounded-lg border border-line bg-surface p-3 shadow-[0_1px_2px_rgb(42_36_32/0.04)]">
                  <p className="text-sm font-semibold">{selectedHall.venueName}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">{selectedHall.region}</p>
                  <Link
                    href={`/wedding-halls/${selectedHall.id}`}
                    className="mt-2 inline-block text-[13px] text-ink-muted hover:text-accent"
                  >
                    상세 보기 →
                  </Link>
                </div>
              </CustomOverlayMap>
            ) : null}
          </Map>
        </div>
      )}
    </Card>
  );
}
