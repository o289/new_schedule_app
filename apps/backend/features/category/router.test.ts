import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError } from "../../core/api-error";

const mocks = vi.hoisted(() => ({
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  requireCurrentUser: vi.fn(),
  verifyAccessToken: vi.fn(),
  getById: vi.fn(),
}));

vi.mock("./service", () => ({
  CategoryService: class {
    listCategories = mocks.listCategories;
    createCategory = mocks.createCategory;
    updateCategory = mocks.updateCategory;
    deleteCategory = mocks.deleteCategory;
  },
}));

vi.mock("../auth/service", () => ({
  AuthService: class {},
}));

vi.mock("../user/repository", () => ({
  UserRepository: class {
    getById = mocks.getById;
  },
}));

vi.mock("../../core/security", () => ({
  verifyAccessToken: mocks.verifyAccessToken,
}));

vi.mock("../../core/current-user", () => ({
  requireCurrentUser: mocks.requireCurrentUser,
}));

import { app } from "../../app";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "category@example.com",
  refreshToken: null,
};

const category = {
  id: "22222222-2222-4222-8222-222222222222",
  userId: user.id,
  name: "仕事",
  color: "red" as const,
};

function request(path: string, options: RequestInit = {}) {
  return app.request(path, {
    ...options,
    headers: {
      Authorization: "Bearer access-token",
      "content-type": "application/json",
      ...options.headers,
    },
  });
}

describe("category router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCurrentUser.mockResolvedValue(user);
  });

  it("POST /categories はカテゴリーを作成する", async () => {
    mocks.createCategory.mockResolvedValue(category);

    const response = await request("/categories", {
      method: "POST",
      body: JSON.stringify({ name: "仕事", color: "red" }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(category);
    expect(mocks.createCategory).toHaveBeenCalledWith(user, {
      name: "仕事",
      color: "red",
    });
  });

  it("POST /categories は色が未指定ならgrayを渡す", async () => {
    mocks.createCategory.mockResolvedValue({
      ...category,
      name: "プライベート",
      color: "gray",
    });

    const response = await request("/categories", {
      method: "POST",
      body: JSON.stringify({ name: "プライベート" }),
    });

    expect(response.status).toBe(201);
    expect(mocks.createCategory).toHaveBeenCalledWith(user, {
      name: "プライベート",
      color: "gray",
    });
  });

  it.each([{ color: "blue" }, { name: "不正", color: "black" }])(
    "POST /categories は不正な入力を422にする",
    async (body) => {
      const response = await request("/categories", {
        method: "POST",
        body: JSON.stringify(body),
      });

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toEqual({
        code: "VALIDATION_ERROR",
      });
      expect(mocks.createCategory).not.toHaveBeenCalled();
    },
  );

  it("GET /categories はログインユーザーの一覧を返す", async () => {
    mocks.listCategories.mockResolvedValue([category]);

    const response = await request("/categories");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([category]);
    expect(mocks.listCategories).toHaveBeenCalledWith(user);
  });

  it("PUT /categories/:id はカテゴリーを更新する", async () => {
    mocks.updateCategory.mockResolvedValue({
      ...category,
      name: "更新後",
      color: "green",
    });

    const response = await request(`/categories/${category.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: "更新後", color: "green" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ...category,
      name: "更新後",
      color: "green",
    });
  });

  it("PUT /categories/:id は存在しないカテゴリーを404にする", async () => {
    mocks.updateCategory.mockRejectedValue(
      new NotFoundError("NOT_FOUND_CATEGORY"),
    );

    const response = await request(`/categories/${category.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: "存在しない" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      code: "NOT_FOUND_CATEGORY",
    });
  });

  it("DELETE /categories/:id は204を返す", async () => {
    mocks.deleteCategory.mockResolvedValue(undefined);

    const response = await request(`/categories/${category.id}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
  });

  it("DELETE /categories/:id は存在しないカテゴリーを404にする", async () => {
    mocks.deleteCategory.mockRejectedValue(
      new NotFoundError("NOT_FOUND_CATEGORY"),
    );

    const response = await request(`/categories/${category.id}`, {
      method: "DELETE",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      code: "NOT_FOUND_CATEGORY",
    });
  });
});
