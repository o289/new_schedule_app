import { addDays } from "../../../../packages/utils/local-datetime";
import { getWeekDates } from "../../utils/date";

export type DesktopCalendarView = "month" | "week";
export type MobileCalendarView = "month" | "day";
export type FullCalendarView = DesktopCalendarView | "day";

export function toFullCalendarView(view: FullCalendarView) {
  switch (view) {
    case "month":
      return "dayGridMonth";
    case "week":
      return "timeGridWeek";
    case "day":
      return "timeGridDay";
  }
}

export function moveDesktopCalendarDate(
  date: Date,
  view: DesktopCalendarView,
  direction: -1 | 1,
): Date {
  if (view === "week") {
    return addDays(date, direction * 7);
  }

  const targetMonth = date.getMonth() + direction;
  const lastDayOfTargetMonth = new Date(
    date.getFullYear(),
    targetMonth + 1,
    0,
  ).getDate();

  return new Date(
    date.getFullYear(),
    targetMonth,
    Math.min(date.getDate(), lastDayOfTargetMonth),
  );
}

export function formatDesktopCalendarTitle(
  selectedDate: Date,
  view: DesktopCalendarView,
): string {
  if (view === "month") {
    return `${selectedDate.getFullYear()}年${selectedDate.getMonth() + 1}月`;
  }

  const weekDates = getWeekDates(selectedDate);
  const start = weekDates[0] ?? selectedDate;
  const end = weekDates[6] ?? selectedDate;

  return `${start.getMonth() + 1}月${start.getDate()}日〜${end.getMonth() + 1}月${end.getDate()}日`;
}
