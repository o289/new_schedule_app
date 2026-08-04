import { afterEach, describe, expect, it } from "vitest";

import { categoryKeys } from "./queryKeys";
import { queryClient } from "./queryClient";
import {
  clearSession,
  getAccessToken,
  refreshAccessToken,
  saveTokens,
} from "./sessionManager";

describe("Session Manager", () => {
  afterEach(() => clearSession());

  it("同時refreshを一つのPromiseへまとめる", async () => {
    saveTokens({ accessToken: "expired-token", refreshToken: "refresh-token" });
    let requests = 0;
    const requestRefresh = async () => {
      requests += 1;
      return "new-access-token";
    };

    await expect(
      Promise.all([
        refreshAccessToken(requestRefresh),
        refreshAccessToken(requestRefresh),
      ]),
    ).resolves.toEqual(["new-access-token", "new-access-token"]);
    expect(requests).toBe(1);
    expect(getAccessToken()).toBe("new-access-token");
  });

  it("refresh失敗時にTokenとQuery cacheを消す", async () => {
    saveTokens({ accessToken: "expired-token", refreshToken: "refresh-token" });
    queryClient.setQueryData(categoryKeys.lists(), [{ id: "category-id" }]);

    await expect(
      refreshAccessToken(async () =>
        Promise.reject(new Error("refresh failed")),
      ),
    ).rejects.toThrow("refresh failed");

    expect(getAccessToken()).toBeNull();
    expect(queryClient.getQueryData(categoryKeys.lists())).toBeUndefined();
  });
});
