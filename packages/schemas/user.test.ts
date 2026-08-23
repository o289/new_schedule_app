import { describe, expect, it } from "vitest";

import {
  publicUserProfileSchema,
  userNameSchema,
  userResponseSchema,
} from "./user";

describe("user profile schemas", () => {
  it("表示名をtrim後の1〜50文字に制限する", () => {
    expect(userNameSchema.parse("  山田 花子  ")).toBe("山田 花子");
    expect(() => userNameSchema.parse(" ")).toThrow();
    expect(() => userNameSchema.parse("あ".repeat(51))).toThrow();
  });

  it("公開プロフィールはemailを受け付けない", () => {
    expect(
      publicUserProfileSchema.safeParse({
        name: "山田 花子",
        avatar: null,
        email: "private@example.com",
      }).success,
    ).toBe(false);
  });

  it("本人向けレスポンスにはemailを含める", () => {
    expect(
      userResponseSchema.parse({
        email: "member@example.com",
        name: "山田 花子",
        avatar: "sky",
      }),
    ).toMatchObject({ email: "member@example.com" });
  });
});
