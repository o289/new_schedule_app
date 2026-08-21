import { describe, expect, it } from "vitest";

import {
  groupCalendarResponseSchema,
  groupJoinSchema,
  groupMemberResponseSchema,
} from "./group";

describe("group schemas", () => {
  it("join codeからUnicode空白を除去して大文字化する", () => {
    expect(groupJoinSchema.parse({ joinCode: " ab\u3000c\t12\n " })).toEqual({
      joinCode: "ABC12",
    });
    expect(() => groupJoinSchema.parse({ joinCode: "\u3000\t " })).toThrow();
  });

  it("公開メンバーにemailを含めない", () => {
    expect(
      groupMemberResponseSchema.safeParse({
        userId: "11111111-1111-4111-8111-111111111111",
        name: "公開ユーザー",
        avatar: null,
        role: "member",
        joinedAt: "2026-08-21T09:00:00.000Z",
        email: "private@example.com",
      }).success,
    ).toBe(false);
  });

  it("カレンダー応答に非公開の予定内容を含めない", () => {
    expect(
      groupCalendarResponseSchema.safeParse({
        groupId: "11111111-1111-4111-8111-111111111111",
        requestedMemberCount: 1,
        fetchedMemberCount: 1,
        completeness: "complete",
        members: [],
        events: [],
        title: "非公開予定",
      }).success,
    ).toBe(false);
  });
});
