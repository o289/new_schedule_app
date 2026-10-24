import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "./apiError";
import { apiClient } from "./apiClient";
import { categoryKeys } from "./queryKeys";
import { queryClient } from "./queryClient";
import {
  beginSessionTermination,
  clearSession,
  getAccessToken,
  getRefreshToken,
  saveTokens,
  subscribeToRefreshExpiry,
  StaleRefreshError,
} from "./sessionManager";

const groupId = "11111111-1111-4111-8111-111111111111";

describe("apiClient error details", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearSession();
  });

  it("ALREADY_GROUP_MEMBER の検証済みgroupIdだけを保持する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "ALREADY_GROUP_MEMBER",
            data: { groupId },
          }),
          {
            status: 409,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    await expect(apiClient.public("/groups/join")).rejects.toMatchObject({
      code: "ALREADY_GROUP_MEMBER",
      status: 409,
      details: { groupId },
    } satisfies Partial<ApiClientError>);
  });

  it("未検証のerror dataは保持しない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "ALREADY_GROUP_MEMBER",
            data: { groupId: "invalid" },
          }),
          {
            status: 409,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    try {
      await apiClient.public("/groups/join");
      throw new Error("Expected ApiClientError");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).details).toBeUndefined();
    }
  });

  it("401後のrefreshで新しい2つのtokenを保存してリトライする", async () => {
    saveTokens({ accessToken: "expired-access", refreshToken: "old-refresh" });
    const expiryEvents: number[] = [];
    const unsubscribe = subscribeToRefreshExpiry(({ attemptId }) => {
      expiryEvents.push(attemptId);
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ code: "HTTP_ERROR" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              data: {
                access_token: "new-access",
                refresh_token: "new-refresh",
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: "category-id" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        ),
    );

    await expect(apiClient.authenticated("/categories")).resolves.toEqual({
      id: "category-id",
    });
    expect(getAccessToken()).toBe("new-access");
    expect(getRefreshToken()).toBe("new-refresh");
    unsubscribe();
    expect(expiryEvents).toEqual([]);
  });

  it("refresh失敗時はtokenとユーザー固有Query cacheを消去する", async () => {
    saveTokens({ accessToken: "expired-access", refreshToken: "old-refresh" });
    queryClient.setQueryData(categoryKeys.lists(), [{ id: "category-id" }]);
    const expiryEvents: number[] = [];
    const unsubscribe = subscribeToRefreshExpiry(({ attemptId }) => {
      expiryEvents.push(attemptId);
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ code: "HTTP_ERROR" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ code: "INVALID_REFRESH_TOKEN" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          }),
        ),
    );

    await expect(apiClient.authenticated("/categories")).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
    });
    expect(getAccessToken()).toBeNull();
    expect(queryClient.getQueryData(categoryKeys.lists())).toBeUndefined();
    unsubscribe();
    expect(expiryEvents).toEqual([]);
  });

  it("期限切れrefreshを同時要求から一度だけ通知する", async () => {
    saveTokens({ accessToken: "expired-access", refreshToken: "old-refresh" });
    const events: number[] = [];
    const unsubscribe = subscribeToRefreshExpiry(({ attemptId }) => {
      events.push(attemptId);
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "HTTP_ERROR" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "HTTP_ERROR" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "REFRESH_TOKEN_EXPIRED" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const results = await Promise.allSettled([
      apiClient.authenticated("/categories"),
      apiClient.authenticated("/groups"),
    ]);
    unsubscribe();

    expect(results.map((result) => result.status)).toEqual([
      "rejected",
      "rejected",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(events).toHaveLength(1);
    expect(getAccessToken()).toBeNull();
  });

  it("logout後に到着した古い401で新sessionをrefresh/retryしない", async () => {
    saveTokens({ accessToken: "old-access", refreshToken: "old-refresh" });
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => (resolveRequest = resolve)),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = apiClient.authenticated("/categories");
    beginSessionTermination();
    saveTokens({ accessToken: "new-access", refreshToken: "new-refresh" });
    resolveRequest(
      new Response(JSON.stringify({ code: "HTTP_ERROR" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(pending).rejects.toBeInstanceOf(StaleRefreshError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBe("new-access");
    expect(getRefreshToken()).toBe("new-refresh");
  });
});
