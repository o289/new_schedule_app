import { describe, expect, it, vi } from "vitest";

import { sortCategories } from "#utils/category-sort";
import { CategoryService } from "./service";
import { CategoryRepository } from "./repository";

const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "category@example.com",
  name: "カテゴリーユーザー",
  avatar: null,
  refreshToken: null,
};

const unsortedCategories = [
  {
    id: "3",
    userId: user.id,
    name: "学校",
    color: "blue" as const,
    icon: "school",
  },
  {
    id: "1",
    userId: user.id,
    name: "車",
    color: "red" as const,
    icon: "car",
  },
  {
    id: "4",
    userId: user.id,
    name: "あ",
    color: "blue" as const,
    icon: "work",
  },
  {
    id: "2",
    userId: user.id,
    name: "仕事",
    color: "blue" as const,
    icon: "work",
  },
  {
    id: "0",
    userId: user.id,
    name: "仕事",
    color: "blue" as const,
    icon: "work",
  },
];

describe("CategoryService", () => {
  it("一覧を色・アイコン・名前・IDの順で固定する", async () => {
    const repository = new CategoryRepository();
    const getByUser = vi
      .spyOn(repository, "getByUser")
      .mockResolvedValue(unsortedCategories);
    const service = new CategoryService(repository);

    await expect(service.listCategories(user)).resolves.toEqual([
      unsortedCategories[1],
      unsortedCategories[2],
      unsortedCategories[4],
      unsortedCategories[3],
      unsortedCategories[0],
    ]);
    expect(getByUser).toHaveBeenCalledWith(user.id);
  });

  it("並び替えは入力配列を変更しない", () => {
    const originalIds = unsortedCategories.map((category) => category.id);

    sortCategories(unsortedCategories);

    expect(unsortedCategories.map((category) => category.id)).toEqual(
      originalIds,
    );
  });
});
