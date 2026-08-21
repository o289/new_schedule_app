import { describe, expect, it } from "vitest";

import {
  scheduleCreateSchema,
  scheduleResponseSchema,
  scheduleUpdateSchema,
} from "#schemas/schedule";

const categoryId = "22222222-2222-4222-8222-222222222222";

const scheduleDate = {
  startDate: "2026-07-22T10:00:00",
  endDate: "2026-07-22T11:00:00",
};
const dates = [scheduleDate];

describe("schedule schema", () => {
  it("Createでは仮押さえを受理し、省略時は本登録にする", () => {
    expect(
      scheduleCreateSchema.parse({
        title: "仮押さえ",
        categoryId,
        isTentative: true,
        dates,
      }).isTentative,
    ).toBe(true);

    expect(
      scheduleCreateSchema.parse({
        title: "本登録",
        categoryId,
        dates,
      }).isTentative,
    ).toBe(false);
  });

  it("Updateでは値を省略しても補完せず、真偽値だけを更新できる", () => {
    expect(scheduleUpdateSchema.parse({})).not.toHaveProperty("isTentative");
    expect(scheduleUpdateSchema.parse({ isTentative: true })).toEqual({
      isTentative: true,
    });
    expect(scheduleUpdateSchema.parse({ isTentative: false })).toEqual({
      isTentative: false,
    });
  });

  it("任意の会議URLを受理し、不正なURLを拒否する", () => {
    expect(
      scheduleCreateSchema.safeParse({
        title: "会議",
        categoryId,
        url: "https://meet.google.com/abc-defg-hij",
        dates,
      }).success,
    ).toBe(true);
    expect(
      scheduleCreateSchema.safeParse({
        title: "会議",
        categoryId,
        url: "not-a-url",
        dates,
      }).success,
    ).toBe(false);
    expect(scheduleUpdateSchema.safeParse({ url: null }).success).toBe(true);
  });

  it.each(["true", 1, null])("真偽値以外の値を拒否する", (value) => {
    expect(
      scheduleCreateSchema.safeParse({
        title: "予定",
        categoryId,
        isTentative: value,
        dates,
      }).success,
    ).toBe(false);
  });

  it("Responseでは仮押さえ状態を必須にする", () => {
    const baseResponse = {
      id: "11111111-1111-4111-8111-111111111111",
      title: "予定",
      categoryId,
      category: { name: "仕事", color: "red", icon: "work" },
      dates: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          ...scheduleDate,
        },
      ],
    };

    expect(scheduleResponseSchema.safeParse(baseResponse).success).toBe(false);
    expect(
      scheduleResponseSchema.safeParse({
        ...baseResponse,
        isTentative: false,
        url: "https://teams.microsoft.com/l/meetup-join/example",
      }).success,
    ).toBe(true);
  });
});
