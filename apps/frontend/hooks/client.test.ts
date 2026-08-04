import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "../lib/apiError";
import { apiClient } from "../lib/apiClient";
import { clearSession, saveTokens } from "../lib/sessionManager";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const requestUrl = (path: string) => `${API_URL}${path}`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestHeaders(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

describe("認証対応APIクライアント", () => {
  afterEach(() => {
    clearSession();
    vi.unstubAllGlobals();
  });

  it("publicリクエストにはAuthorizationを付けない", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "1" }));
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.public("/resource");

    expect(requestHeaders(fetchMock).get("Authorization")).toBeNull();
  });

  it("authenticatedリクエストにはAccess Tokenを付ける", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "1" }));
    vi.stubGlobal("fetch", fetchMock);
    saveTokens({ accessToken: "access-token", refreshToken: "refresh-token" });

    await apiClient.authenticated("/resource");

    expect(requestHeaders(fetchMock).get("Authorization")).toBe(
      "Bearer access-token",
    );
  });

  it("401後にrefreshして元リクエストを一回だけ再送する", async () => {
    const fetchMock = vi.fn(
      async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> => {
        if (String(input) === requestUrl("/auth/refresh")) {
          return jsonResponse({ data: { access_token: "new-access-token" } });
        }
        if (
          new Headers(init?.headers).get("Authorization") ===
          "Bearer new-access-token"
        ) {
          return jsonResponse({ id: "1" });
        }
        return jsonResponse({ code: "INVALID_CREDENTIALS" }, 401);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    saveTokens({ accessToken: "expired-token", refreshToken: "refresh-token" });

    await expect(
      apiClient.authenticated<{ id: string }>("/resource"),
    ).resolves.toEqual({
      id: "1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("再送失敗時は再送側のエラーを返す", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: "INVALID_CREDENTIALS" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ data: { access_token: "new-token" } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ code: "SCHEDULE_TIME_OVERLAP" }, 409),
      );
    vi.stubGlobal("fetch", fetchMock);
    saveTokens({ accessToken: "expired-token", refreshToken: "refresh-token" });

    await expect(apiClient.authenticated("/resource")).rejects.toMatchObject({
      code: "SCHEDULE_TIME_OVERLAP",
      status: 409,
    });
  });

  it("204とAbortSignalを正しく扱う", async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiClient.public<void>("/resource", { signal: controller.signal }),
    ).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("不正なJSONとAPIエラーをApiClientErrorとして返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response("not-json", {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({ code: "PASSKEY_NOT_FOUND" }, 404),
        ),
    );

    await expect(apiClient.public("/invalid-json")).rejects.toBeInstanceOf(
      ApiClientError,
    );
    await expect(apiClient.public("/passkey")).rejects.toMatchObject({
      code: "PASSKEY_NOT_FOUND",
      status: 404,
    });
  });
});
