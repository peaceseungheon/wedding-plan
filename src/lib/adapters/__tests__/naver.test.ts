import { type Mock, afterEach, describe, expect, it, vi } from "vitest";
import { searchAddress } from "@/lib/adapters/naver";

const CLIENT_ID = "test-naver-client-id";
const CLIENT_SECRET = "test-naver-client-secret";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubFetch(): Mock<typeof fetch> {
  const fetchMock: Mock<typeof fetch> = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubCredentials(): void {
  vi.stubEnv("NAVER_MAP_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("NAVER_MAP_CLIENT_SECRET", CLIENT_SECRET);
}

describe("searchAddress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("maps the first naver address into coordinates when the API responds 2xx", async () => {
    stubCredentials();
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        status: "OK",
        meta: { totalCount: 1, page: 1, count: 1 },
        addresses: [
          {
            roadAddress: "서울특별시 중구 남대문로 23",
            jibunAddress: "서울특별시 중구 남대문로가 23",
            x: "126.9784147",
            y: "37.5666805",
          },
        ],
      }),
    );

    const result = await searchAddress("서울특별시 중구 남대문로 23");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(url));
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "https://maps.apigw.ntruss.com/map-geocode/v2/geocode",
    );
    expect(requestUrl.searchParams.get("query")).toBe("서울특별시 중구 남대문로 23");
    // 자격증명은 헤더로만 간다 — URL에 실리면 로그에 새므로 금지다.
    expect(String(url)).not.toContain(CLIENT_ID);
    expect(String(url)).not.toContain(CLIENT_SECRET);
    // NCP API 게이트웨이 인증 헤더 쌍이다.
    expect(init?.headers).toEqual({
      "x-ncp-apigw-api-key-id": CLIENT_ID,
      "x-ncp-apigw-api-key": CLIENT_SECRET,
    });

    // 네이버 좌표는 문자열이며 x=경도, y=위도다.
    expect(result).toEqual({
      ok: true,
      coordinates: { latitude: 37.5666805, longitude: 126.9784147 },
    });
  });

  it("returns a fallback result when no address matches the query", async () => {
    stubCredentials();
    const fetchMock = stubFetch();
    fetchMock.mockResolvedValue(
      jsonResponse(200, { status: "OK", meta: { totalCount: 0 }, addresses: [] }),
    );

    const result = await searchAddress("존재하지 않는 주소");

    expect(result).toEqual({ ok: false });
  });

  it("returns a fallback result without a network call when a credential is missing", async () => {
    vi.stubEnv("NAVER_MAP_CLIENT_ID", CLIENT_ID);
    const fetchMock = stubFetch();

    const result = await searchAddress("서울특별시 중구 남대문로 23");

    expect(result).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a fallback result when naver responds 500 or the network throws", async () => {
    stubCredentials();
    const httpErrorMock = stubFetch();
    httpErrorMock.mockResolvedValue(
      jsonResponse(500, { error: { errorCode: "500", message: "Internal Server Error" } }),
    );

    await expect(searchAddress("서울특별시 중구 남대문로 23")).resolves.toEqual({ ok: false });

    const networkErrorMock = stubFetch();
    networkErrorMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(searchAddress("서울특별시 중구 남대문로 23")).resolves.toEqual({ ok: false });
  });
});
