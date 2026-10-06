import { type Mock, afterEach, describe, expect, it, vi } from "vitest";
import { searchAddress, searchVendors } from "@/lib/adapters/kakao";

const API_KEY = "test-rest-api-key";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(): Mock<typeof fetch> {
  const fetchMock: Mock<typeof fetch> = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("searchVendors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps kakao documents into places when the API responds 2xx", async () => {
    vi.stubEnv("KAKAO_API_KEY", API_KEY);
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        documents: [
          {
            place_name: "라온제나 웨딩컨벤션",
            address_name: "서울특별시 중구 을지로 12",
            road_address_name: "서울특별시 중구 을지로 12",
            phone: "02-1234-5678",
            place_url: "http://place.map.kakao.com/111",
          },
          {
            place_name: "더 라움",
            address_name: "서울특별시 송파구 올림픽로 35",
            road_address_name: "",
            phone: "",
            place_url: "http://place.map.kakao.com/222",
          },
        ],
      }),
    );

    const result = await searchVendors("웨딩홀");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(url));
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "https://dapi.kakao.com/v2/local/search/keyword.json",
    );
    expect(requestUrl.searchParams.get("query")).toBe("웨딩홀");
    // 키는 헤더로만 간다 — URL에 실리면 로그에 새므로 금지다.
    expect(String(url)).not.toContain(API_KEY);
    // 카카오 REST API는 Authorization: KakaoAK 스킴만 받는다 (Bearer는 401 AccessDeniedError).
    expect(init?.headers).toEqual({ Authorization: `KakaoAK ${API_KEY}` });

    expect(result).toEqual({
      ok: true,
      results: [
        {
          placeName: "라온제나 웨딩컨벤션",
          address: "서울특별시 중구 을지로 12",
          roadAddress: "서울특별시 중구 을지로 12",
          phone: "02-1234-5678",
          placeUrl: "http://place.map.kakao.com/111",
          latitude: null,
          longitude: null,
        },
        {
          placeName: "더 라움",
          address: "서울특별시 송파구 올림픽로 35",
          roadAddress: "",
          phone: "",
          placeUrl: "http://place.map.kakao.com/222",
          latitude: null,
          longitude: null,
        },
      ],
    });
  });

  it("maps document x/y into latitude/longitude, normalizing invalid values to null", async () => {
    vi.stubEnv("KAKAO_API_KEY", API_KEY);
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        documents: [
          {
            place_name: "라온제나 웨딩컨벤션",
            address_name: "서울특별시 중구 을지로 12",
            road_address_name: "서울특별시 중구 을지로 12",
            phone: "02-1234-5678",
            place_url: "http://place.map.kakao.com/111",
            x: "126.9784147",
            y: "37.5666805",
          },
          {
            place_name: "더 라움",
            address_name: "서울특별시 송파구 올림픽로 35",
            road_address_name: "",
            phone: "",
            place_url: "http://place.map.kakao.com/222",
            x: "not-a-number",
            y: "",
          },
        ],
      }),
    );

    const result = await searchVendors("웨딩홀");

    // 좌표 계약: number | null. 변환 실패(빈 문자열/숫자 아님)는 null이 되되 장소 자체는 버리지 않는다 — 목록에는 남고 마커만 생략된다.
    expect(result).toEqual({
      ok: true,
      results: [
        {
          placeName: "라온제나 웨딩컨벤션",
          address: "서울특별시 중구 을지로 12",
          roadAddress: "서울특별시 중구 을지로 12",
          phone: "02-1234-5678",
          placeUrl: "http://place.map.kakao.com/111",
          latitude: 37.5666805,
          longitude: 126.9784147,
        },
        {
          placeName: "더 라움",
          address: "서울특별시 송파구 올림픽로 35",
          roadAddress: "",
          phone: "",
          placeUrl: "http://place.map.kakao.com/222",
          latitude: null,
          longitude: null,
        },
      ],
    });
  });

  it("returns a fallback result without a network call when the API key is empty", async () => {
    vi.stubEnv("KAKAO_API_KEY", "");
    const fetchMock = stubFetch();

    const result = await searchVendors("웨딩홀");

    expect(result).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a fallback result when kakao responds 500 or the network throws", async () => {
    vi.stubEnv("KAKAO_API_KEY", API_KEY);
    const httpErrorMock = stubFetch();
    httpErrorMock.mockResolvedValue(jsonResponse(500, { error: "internal" }));

    await expect(searchVendors("웨딩홀")).resolves.toEqual({ ok: false });

    const networkErrorMock = stubFetch();
    networkErrorMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(searchVendors("웨딩홀")).resolves.toEqual({ ok: false });
  });
});

describe("searchAddress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps the first kakao document into coordinates when the API responds 2xx", async () => {
    vi.stubEnv("KAKAO_API_KEY", API_KEY);
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        documents: [
          {
            address_name: "서울특별시 중구 남대문로 23",
            address: { x: "126.9784147", y: "37.5666805" },
            road_address: { x: "126.9800123", y: "37.5700456" },
          },
        ],
      }),
    );

    const result = await searchAddress("서울특별시 중구 남대문로 23");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(url));
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "https://dapi.kakao.com/v2/local/search/address.json",
    );
    expect(requestUrl.searchParams.get("query")).toBe("서울특별시 중구 남대문로 23");
    expect(String(url)).not.toContain(API_KEY);
    // 카카오 REST API는 Authorization: KakaoAK 스킴만 받는다 (Bearer는 401 AccessDeniedError).
    expect(init?.headers).toEqual({ Authorization: `KakaoAK ${API_KEY}` });

    expect(result).toEqual({
      ok: true,
      coordinates: { latitude: 37.5666805, longitude: 126.9784147 },
    });
  });

  it("falls back to the road address coordinates when the jibun address is missing", async () => {
    vi.stubEnv("KAKAO_API_KEY", API_KEY);
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        documents: [
          {
            address_name: "경기 하남시 미사대로 750",
            address: null,
            road_address: { x: "127.2156810", y: "37.5395820" },
          },
        ],
      }),
    );

    const result = await searchAddress("경기 하남시 미사대로 750");

    expect(result).toEqual({
      ok: true,
      coordinates: { latitude: 37.539582, longitude: 127.215681 },
    });
  });

  it("returns a fallback result when no document matches the address", async () => {
    vi.stubEnv("KAKAO_API_KEY", API_KEY);
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(jsonResponse(200, { documents: [] }));

    const result = await searchAddress("존재하지 않는 주소");

    expect(result).toEqual({ ok: false });
  });

  it("returns a fallback result without a network call when the API key is empty", async () => {
    vi.stubEnv("KAKAO_API_KEY", "");
    const fetchMock = stubFetch();

    const result = await searchAddress("서울특별시 중구 남대문로 23");

    expect(result).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a fallback result when kakao responds 500 or the network throws", async () => {
    vi.stubEnv("KAKAO_API_KEY", API_KEY);
    const httpErrorMock = stubFetch();
    httpErrorMock.mockResolvedValue(jsonResponse(500, { error: "internal" }));

    await expect(searchAddress("서울특별시 중구 남대문로 23")).resolves.toEqual({ ok: false });

    const networkErrorMock = stubFetch();
    networkErrorMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(searchAddress("서울특별시 중구 남대문로 23")).resolves.toEqual({ ok: false });
  });
});
