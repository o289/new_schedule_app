import { describe, expect, it } from "vitest";

import type { ScheduleResponse } from "../../types/schedule";
import { toScheduleForm } from "./scheduleFormAdapter";

const schedule: ScheduleResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "授業",
  categoryId: "22222222-2222-4222-8222-222222222222",
  category: { name: "学校", color: "red" },
  dates: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      startDate: "2026-07-22T10:00:00",
      endDate: "2026-07-22T13:00:00",
    },
  ],
};

describe("toScheduleForm", () => {
  it("編集に必要な値を引き継ぎ、日程配列を独立させる", () => {
    const form = toScheduleForm(schedule);

    expect(form).toMatchObject({
      id: schedule.id,
      title: "授業",
      note: "",
      categoryId: schedule.categoryId,
      dates: schedule.dates,
    });
    expect(form.dates).not.toBe(schedule.dates);
    expect(form.dates[0]).not.toBe(schedule.dates[0]);
  });
});
