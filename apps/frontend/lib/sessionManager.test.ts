import { afterEach, describe, expect, it } from "vitest";

import { categoryKeys, groupKeys } from "./queryKeys";
import { queryClient } from "./queryClient";
import {
  clearSession,
  getAccessToken,
  hasStoredSession,
  refreshAccessToken,
  saveTokens,
  subscribeToSession,
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

  it("refresh失敗時にTokenを消すが実行中のQuery cacheは消さない", async () => {
    saveTokens({ accessToken: "expired-token", refreshToken: "refresh-token" });
    queryClient.setQueryData(categoryKeys.lists(), [{ id: "category-id" }]);

    await expect(
      refreshAccessToken(async () =>
        Promise.reject(new Error("refresh failed")),
      ),
    ).rejects.toThrow("refresh failed");

    expect(getAccessToken()).toBeNull();
    expect(queryClient.getQueryData(categoryKeys.lists())).toEqual([
      { id: "category-id" },
    ]);
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
