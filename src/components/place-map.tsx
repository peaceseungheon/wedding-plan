"use client";

import { Card } from "@/components/ui/card";
import { KakaoMapCanvas } from "./kakao-map-canvas";
import { NaverMapCanvas } from "./naver-map-canvas";

/**
 * 지도에 마커로 표시할 장소 한 건. 예식장 지도와 업체 검색 결과 지도가
 * 같은 셸을 쓰기에 장소 공통 필드만 남긴다 — subtitle은 예식장은 지역,
 * 업체는 주소처럼 각 화면이 의미를 정한다.
 */
export type PlaceMarker = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  /** 오버레이의 "상세 보기" 링크. 없으면 링크 없는 오버레이다. */
  detailUrl?: string;
  /** true면 외부 링크(새 탭), 없거나 false면 앱 내 이동이다. */
  detailExternal?: boolean;
};

/** NEXT_PUBLIC_MAP_PROVIDER가 "kakao"일 때만 카카오, 나머지(기본값 포함)는 네이버다. */
const MAP_PROVIDER = process.env.NEXT_PUBLIC_MAP_PROVIDER === "kakao" ? "kakao" : "naver";

/** 빌드 타임에 주입되는 카카오맵 JavaScript 키. 사이트 도메인 등록으로 보호되는 공개 키다. */
const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "";

/** 빌드 타임에 주입되는 네이버맵 Client ID. Web 서비스 URL 등록으로 보호되는 공개 키다. */
const NAVER_MAP_CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ?? "";

/**
 * 장소 지도 셸. 프로바이더(kakao·naver) 선택은 env가 결정하고 이 셸은
 * 마커 유무·키 유무 상태 카드와 캔버스 위임만 담당한다 — 프로바이더가
 * 바뀌거나 쓰는 화면이 늘어도 각 화면의 인터페이스는 그대로다.
 */
export function PlaceMap({
  title,
  markers,
  emptyMessage,
}: {
  title: string;
  markers: readonly PlaceMarker[];
  emptyMessage?: string;
}) {
  if (markers.length === 0) {
    return (
      <Card title={title}>
        <p className="text-sm text-ink-muted">
          {emptyMessage ?? "표시할 위치가 없다."}
        </p>
      </Card>
    );
  }
  if (MAP_PROVIDER === "kakao" && KAKAO_JS_KEY === "") {
    return (
      <Card title={title} action={<CountLabel count={markers.length} />}>
        <p className="text-sm text-ink-muted">
          카카오맵 JavaScript 키가 설정되지 않았다. 카카오 개발자 콘솔에서 Web 플랫폼 사이트 도메인을
          등록하고 발급한 JavaScript 키를 NEXT_PUBLIC_KAKAO_JS_KEY로 설정하면 지도가 표시된다.
        </p>
      </Card>
    );
  }
  if (MAP_PROVIDER === "naver" && NAVER_MAP_CLIENT_ID === "") {
    return (
      <Card title={title} action={<CountLabel count={markers.length} />}>
        <p className="text-sm text-ink-muted">
          네이버맵 Client ID가 설정되지 않았다. NCP 콘솔에서 Maps 앱을 등록하고(Web Dynamic Map +
          Geocoding 선택, 웹 서비스 URL에 http://localhost 추가) 발급한 Client ID를
          NEXT_PUBLIC_NAVER_MAP_CLIENT_ID로 설정하면 지도가 표시된다.
        </p>
      </Card>
    );
  }
  return MAP_PROVIDER === "kakao" ? (
    <KakaoMapCanvas title={title} markers={markers} appkey={KAKAO_JS_KEY} />
  ) : (
    <NaverMapCanvas title={title} markers={markers} clientId={NAVER_MAP_CLIENT_ID} />
  );
}

function CountLabel({ count }: { count: number }) {
  return (
    <span className="text-[13px] tabular-nums text-ink-muted">{count}곳</span>
  );
}
