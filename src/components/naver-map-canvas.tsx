"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Container, CustomOverlay, Marker, NaverMap, NavermapsProvider } from "react-naver-maps";
import { Card } from "@/components/ui/card";
import { computeMapViewport } from "@/lib/domain/map-viewport";
import type { WeddingHallMapMarker } from "./wedding-hall-map";

/**
 * 뷰포트 도메인 모듈은 카카오 level(1~14, 클수록 멀리) 기준으로 계산한다.
 * 네이버 zoom은 방향이 반대(클수록 가까이)라 근사 환산만 여기서 한다.
 */
function levelToZoom(level: number): number {
  return 19 - level;
}

/** 네이버맵 캔버스. Client ID는 Web 서비스 URL 등록으로 보호되는 공개 키다. */
export function NaverMapCanvas({
  halls,
  clientId,
}: {
  halls: readonly WeddingHallMapMarker[];
  clientId: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const viewport = useMemo(() => computeMapViewport(halls), [halls]);
  const selectedHall = useMemo(
    () => halls.find((hall) => hall.id === selectedId) ?? null,
    [halls, selectedId],
  );

  return (
    <Card title="위치 지도" action={<CountLabel count={halls.length} />}>
      <div className="overflow-hidden rounded-lg border border-line">
        {/* 지도 타일과 마커는 네이버 SDK가 그리는 제3의 캔버스라 디자인 토큰이 적용되지 않는다. */}
        {/*
         * 네이버 SDK에는 공식 클러스터러가 없다(반응형 라이브러리의 클러스터링 예제는
         * 비타입 셀프호스팅 코드다). v1은 클러스터링 없이 마커를 찍고, 뭉침은 지역 필터와
         * 줌으로 해소한다 — 카카오 캔버스와의 기능 차이는 DESIGN.md에 기록했다.
         */}
        <NavermapsProvider ncpKeyId={clientId}>
          <Container
            className="h-[280px] w-full sm:h-[420px]"
            fallback={
              <p className="text-sm text-ink-muted">지도를 불러오는 중…</p>
            }
          >
            <NaverMap
              center={viewport.center}
              zoom={levelToZoom(viewport.level)}
              onClick={() => setSelectedId(null)}
            >
              {halls.map((hall) => (
                <Marker
                  key={hall.id}
                  position={{ lat: hall.latitude, lng: hall.longitude }}
                  title={hall.venueName}
                  onClick={() =>
                    setSelectedId((previous) => (previous === hall.id ? null : hall.id))
                  }
                />
              ))}
              {selectedHall ? (
                <CustomOverlay
                  position={{ lat: selectedHall.latitude, lng: selectedHall.longitude }}
                >
                  {/* 앵커 계산 대신 transform으로 마커 위-중앙에 띄운다. */}
                  <div className="w-56 -translate-x-1/2 -translate-y-[calc(100%_+_28px)] rounded-lg border border-line bg-surface p-3 shadow-[0_1px_2px_rgb(42_36_32/0.04)]">
                    <p className="text-sm font-semibold">{selectedHall.venueName}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{selectedHall.region}</p>
                    <Link
                      href={`/wedding-halls/${selectedHall.id}`}
                      className="mt-2 inline-block text-[13px] text-ink-muted hover:text-accent"
                    >
                      상세 보기 →
                    </Link>
                  </div>
                </CustomOverlay>
              ) : null}
            </NaverMap>
          </Container>
        </NavermapsProvider>
      </div>
    </Card>
  );
}

function CountLabel({ count }: { count: number }) {
  return (
    <span className="text-[13px] tabular-nums text-ink-muted">{count}곳</span>
  );
}
