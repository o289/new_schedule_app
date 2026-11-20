import { afterEach, describe, expect, it } from "vitest";

import { categoryKeys, groupKeys } from "./queryKeys";
import { queryClient } from "./queryClient";
import {
  beginSessionTermination,
  beginLogoutRequest,
  clearSession,
  clearSessionIfGeneration,
  handleRefreshFailure,
  getAccessToken,
  hasStoredSession,
  isSessionGenerationCurrent,
  refreshAccessToken,
  saveTokens,
  subscribeToSession,
  subscribeToRefreshExpiry,
  StaleRefreshError,
} from "./sessionManager";

describe("Session Manager", () => {
  afterEach(() => clearSession());

  it("同時refreshを一つのPromiseへまとめる", async () => {
    saveTokens({ accessToken: "expired-token", refreshToken: "refresh-token" });
    let requests = 0;
    const requestRefresh = async () => {
      requests += 1;
      return {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
      };
    };

    await expect(
      Promise.all([
        refreshAccessToken(requestRefresh),
        refreshAccessToken(requestRefresh),
      ]),
    ).resolves.toEqual(["new-access-token", "new-access-token"]);
    expect(requests).toBe(1);
    expect(getAccessToken()).toBe("new-access-token");
    expect(localStorage.getItem("refreshToken")).toBe("new-refresh-token");
  });

  it("refresh失敗理由を一度だけsession cleanupへ渡す", async () => {
    saveTokens({ accessToken: "expired-token", refreshToken: "refresh-token" });
    queryClient.setQueryData(categoryKeys.lists(), [{ id: "category-id" }]);

    let failure: unknown;
    try {
      await refreshAccessToken(async () => {
        throw Object.assign(new Error("expired"), {
          code: "REFRESH_TOKEN_EXPIRED",
        });
      });
    } catch (error) {
      failure = error;
    }

    expect(getAccessToken()).toBe("expired-token");
    const events: number[] = [];
    const unsubscribe = subscribeToRefreshExpiry(({ attemptId }) => {
      events.push(attemptId);
    });
    expect(handleRefreshFailure(failure)).toBe(true);
    expect(handleRefreshFailure(failure)).toBe(false);
    unsubscribe();
    expect(events).toHaveLength(1);
    expect(getAccessToken()).toBeNull();
    expect(queryClient.getQueryData(categoryKeys.lists())).toBeUndefined();
  });

  it("未購読中に期限切れ通知が確定しても後続のclearで失わない", async () => {
    saveTokens({ accessToken: "expired-token", refreshToken: "refresh-token" });
    let failure: unknown;
    try {
      await refreshAccessToken(async () => {
        throw Object.assign(new Error("expired"), {
          code: "REFRESH_TOKEN_EXPIRED",
        });
      });
    } catch (error) {
      failure = error;
    }
    expect(handleRefreshFailure(failure)).toBe(true);

    clearSession();
    const events: number[] = [];
    const unsubscribe = subscribeToRefreshExpiry(({ attemptId }) => {
      events.push(attemptId);
    });
    unsubscribe();

    expect(events).toHaveLength(1);
  });

  it("manual logout後の古いrefresh成功を破棄する", async () => {
    saveTokens({ accessToken: "old-access", refreshToken: "old-refresh" });
    let resolveRefresh!: (tokens: {
      accessToken: string;
      refreshToken: string;
    }) => void;
    const pending = refreshAccessToken(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    beginSessionTermination();
    saveTokens({ accessToken: "new-access", refreshToken: "new-refresh" });
    resolveRefresh({
      accessToken: "stale-access",
      refreshToken: "stale-refresh",
    });

    await expect(pending).rejects.toBeInstanceOf(StaleRefreshError);
    expect(getAccessToken()).toBe("new-access");
    expect(localStorage.getItem("refreshToken")).toBe("new-refresh");
  });

  it("manual logout後の古い期限切れrefresh失敗は新sessionを消さない", async () => {
    saveTokens({ accessToken: "old-access", refreshToken: "old-refresh" });
    let rejectRefresh!: (error: Error) => void;
    const pending = refreshAccessToken(
      () =>
        new Promise((_, reject) => {
          rejectRefresh = reject;
        }),
    );
    beginSessionTermination();
    saveTokens({ accessToken: "new-access", refreshToken: "new-refresh" });
    rejectRefresh(
      Object.assign(new Error("expired"), {
        code: "REFRESH_TOKEN_EXPIRED",
      }),
    );

    await expect(pending).rejects.toBeInstanceOf(StaleRefreshError);
    expect(getAccessToken()).toBe("new-access");
    expect(handleRefreshFailure(new Error("unrelated"))).toBe(false);
  });

  it("古いlogout onSettledは後から保存した新sessionを消さない", () => {
    saveTokens({ accessToken: "old-access", refreshToken: "old-refresh" });
    const logoutRequest = beginLogoutRequest();
    saveTokens({ accessToken: "new-access", refreshToken: "new-refresh" });

    expect(logoutRequest.refreshToken).toBe("old-refresh");
    expect(isSessionGenerationCurrent(logoutRequest.generation)).toBe(false);
    expect(clearSessionIfGeneration(logoutRequest.generation)).toBe(false);
    expect(getAccessToken()).toBe("new-access");
    expect(localStorage.getItem("refreshToken")).toBe("new-refresh");
  });

  it("clearSessionでTokenとQuery cacheを消す", () => {
    saveTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    queryClient.setQueryData(categoryKeys.lists(), [{ id: "category-id" }]);
    queryClient.setQueryData(groupKeys.lists(), [{ id: "group-id" }]);

    clearSession();

    expect(getAccessToken()).toBeNull();
    expect(queryClient.getQueryData(categoryKeys.lists())).toBeUndefined();
    expect(queryClient.getQueryData(groupKeys.lists())).toBeUndefined();
  });

  it("Tokenの保存と削除を購読者へ通知する", () => {
    const snapshots: boolean[] = [];
    const unsubscribe = subscribeToSession(() => {
      snapshots.push(hasStoredSession());
    });

    saveTokens({ accessToken: "access-token", refreshToken: "refresh-token" });
    clearSession();
    unsubscribe();

    expect(snapshots).toEqual([true, false]);
  });
});
