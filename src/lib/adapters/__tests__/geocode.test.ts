import { type Mock, afterEach, describe, expect, it, vi } from "vitest";
import { activeMapProvider, searchAddress } from "@/lib/adapters/geocode";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(): Mock<typeof fetch> {
  const fetchMock: Mock<typeof fetch> = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("activeMapProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("defaults to naver when the provider env is unset", () => {
    const provider = activeMapProvider();

    expect(provider).toBe("naver");
  });

  it("honors an explicit kakao or naver value", () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_PROVIDER", "kakao");
    expect(activeMapProvider()).toBe("kakao");

    vi.stubEnv("NEXT_PUBLIC_MAP_PROVIDER", "naver");
    expect(activeMapProvider()).toBe("naver");
  });

  it("normalizes an invalid value back to naver", () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_PROVIDER", "google");

    expect(activeMapProvider()).toBe("naver");
  });
});

describe("searchAddress dispatch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("routes to the naver geocoder by default", async () => {
    vi.stubEnv("NAVER_MAP_CLIENT_ID", "test-naver-client-id");
    vi.stubEnv("NAVER_MAP_CLIENT_SECRET", "test-naver-client-secret");
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        status: "OK",
        addresses: [{ roadAddress: "서울특별시 중구 남대문로 23", x: "126.9784147", y: "37.5666805" }],
      }),
    );

    const result = await searchAddress("서울특별시 중구 남대문로 23");

    const [url] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).host).toBe("maps.apigw.ntruss.com");
    expect(result).toEqual({
      ok: true,
      coordinates: { latitude: 37.5666805, longitude: 126.9784147 },
    });
  });

  it("routes to the kakao geocoder when the provider env says kakao", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAP_PROVIDER", "kakao");
    vi.stubEnv("KAKAO_API_KEY", "test-rest-api-key");
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        documents: [{ address: { x: "126.9784147", y: "37.5666805" } }],
      }),
    );

    const result = await searchAddress("서울특별시 중구 남대문로 23");

    const [url] = fetchMock.mock.calls[0];
    expect(new URL(String(url)).host).toBe("dapi.kakao.com");
    expect(result).toEqual({
      ok: true,
      coordinates: { latitude: 37.5666805, longitude: 126.9784147 },
    });
  });
});
