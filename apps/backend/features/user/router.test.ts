import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "#backend/core/api-error";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  logout: vi.fn(),
  logoutAll: vi.fn(),
  requireCurrentUser: vi.fn(),
  verifyAccessToken: vi.fn(),
  getById: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("../auth/service", () => ({
  AuthService: class {
    refresh = mocks.refresh;
    logout = mocks.logout;
    logoutAll = mocks.logoutAll;
  },
}));

vi.mock("../../core/security", () => ({
  verifyAccessToken: mocks.verifyAccessToken,
}));

vi.mock("../../core/current-user", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

vi.mock("./repository", () => ({
  UserRepository: class {
    getById = mocks.getById;
    updateProfile = mocks.updateProfile;
  },
}));

import { app } from "#backend/app";

async function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("user router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockRejectedValue(
      new UnauthorizedError("HTTP_ERROR"),
    );
  });

  it("POST /auth/refresh", async () => {
    const result = {
      data: { access_token: "new-access", refresh_token: "refresh" },
    };
    mocks.refresh.mockResolvedValue(result);

    const response = await post("/auth/refresh", {
      refresh_token: "refresh",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
    expect(mocks.refresh).toHaveBeenCalledWith("refresh");
  });

  it("POST /auth/logoutは204と空レスポンスを返す", async () => {
    mocks.logout.mockResolvedValue(undefined);

    const response = await post("/auth/logout", {
      refresh_token: "refresh",
    });

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
    expect(mocks.logout).toHaveBeenCalledWith("refresh");
  });

  it("POST /auth/logout-allは認証ユーザーの全端末をログアウトする", async () => {
    mocks.requireCurrentUser.mockResolvedValue({ id: "user-id" });
    mocks.logoutAll.mockResolvedValue(undefined);

    const response = await app.request("/auth/logout-all", {
      method: "POST",
      headers: { Authorization: "Bearer access-token" },
    });

    expect(response.status).toBe(204);
    expect(mocks.logoutAll).toHaveBeenCalledWith("user-id");
  });

  it("GET /auth/me", async () => {
    mocks.requireCurrentUser.mockResolvedValue({
      id: "user-id",
      email: "test@example.com",
      name: "テストユーザー",
      avatar: "sky",
    });

    const response = await app.request("/auth/me", {
      headers: { Authorization: "Bearer access-token" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      email: "test@example.com",
      name: "テストユーザー",
      avatar: "sky",
    });
    expect(mocks.requireCurrentUser).toHaveBeenCalledOnce();
  });

  it("PUT /auth/me はプロフィールを更新する", async () => {
    const user = {
      id: "user-id",
      email: "test@example.com",
      name: "更新後の名前",
      avatar: "violet" as const,
    };
    mocks.requireCurrentUser.mockResolvedValue(user);
    mocks.updateProfile.mockResolvedValue(user);

    const response = await app.request("/auth/me", {
      method: "PUT",
      headers: {
        Authorization: "Bearer access-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "更新後の名前", avatar: "violet" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      email: "test@example.com",
      name: "更新後の名前",
      avatar: "violet",
    });
    expect(mocks.updateProfile).toHaveBeenCalledWith("user-id", {
      name: "更新後の名前",
      avatar: "violet",
    });
  });

  it("PUT /auth/me は不正な入力を422にする", async () => {
    mocks.requireCurrentUser.mockResolvedValue({
      id: "user-id",
      email: "test@example.com",
      name: "テストユーザー",
      avatar: null,
    });

    const response = await app.request("/auth/me", {
      method: "PUT",
      headers: {
        Authorization: "Bearer access-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "", avatar: "invalid" }),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      code: "VALIDATION_ERROR",
    });
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("不正なrefreshリクエストを400にする", async () => {
    const response = await post("/auth/refresh", {});

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_REQUEST",
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("未認証のGET /auth/meを401にする", async () => {
    const response = await app.request("/auth/me");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: "HTTP_ERROR" });
  });

  it("Serviceのエラーコードを返す", async () => {
    mocks.refresh.mockRejectedValue(
      new UnauthorizedError("INVALID_REFRESH_TOKEN"),
    );

    const response = await post("/auth/refresh", {
      refresh_token: "invalid",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_REFRESH_TOKEN",
    });
  });
});
