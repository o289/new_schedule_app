import type { ScheduleForm, ScheduleResponse } from "#frontend/types/schedule";

/** APIレスポンスを編集フォーム用の独立した値へ変換する。 */
export function toScheduleForm(schedule: ScheduleResponse): ScheduleForm {
  return {
    id: schedule.id,
    title: schedule.title ?? "",
    note: schedule.note ?? "",
    categoryId: schedule.categoryId ?? "",
    isTentative: schedule.isTentative,
    dates: schedule.dates.map((date) => ({ ...date })),
  };
}
