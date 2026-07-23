import type { ScheduleForm, ScheduleResponse } from "../../types/schedule";

/** APIレスポンスを編集フォーム用の独立した値へ変換する。 */
export function toScheduleForm(schedule: ScheduleResponse): ScheduleForm {
  return {
    id: schedule.id,
    title: schedule.title ?? "",
    note: schedule.note ?? "",
    categoryId: schedule.categoryId ?? "",
    dates: schedule.dates.map((date) => ({ ...date })),
  };
}
