import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError } from "../../core/api-error";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  logout: vi.fn(),
  requireCurrentUser: vi.fn(),
  verifyAccessToken: vi.fn(),
  getById: vi.fn(),
}));

vi.mock("../auth/service", () => ({
  AuthService: class {
    refresh = mocks.refresh;
    logout = mocks.logout;
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
  },
}));

import { app } from "../../app";

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

  it("GET /auth/me", async () => {
    mocks.requireCurrentUser.mockResolvedValue({
      id: "user-id",
      email: "test@example.com",
      refreshToken: "secret-refresh-token",
    });

    const response = await app.request("/auth/me", {
      headers: { Authorization: "Bearer access-token" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      email: "test@example.com",
    });
    expect(mocks.requireCurrentUser).toHaveBeenCalledOnce();
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
