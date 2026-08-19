import {
  addDays,
  getLocalDateTimeParts,
  isSameDate,
  toDateOnly,
} from "#utils/local-datetime";

export function formatDateTime(
  isoString: string,
  mode: "date" | "time" | "datetime" = "datetime",
): string {
  const { date, time } = getLocalDateTimeParts(isoString);
  const [year = "", month = "", day = ""] = date.split("-");

  switch (mode) {
    case "date":
      return `${Number(year)}年${Number(month)}月${Number(day)}日`;
    case "time":
      return time;
    case "datetime":
      return `${Number(year)}年${Number(month)}月${Number(day)}日 ${time}`;
    default:
      throw new Error(`Invalid mode: ${mode}`);
  }
}

/** 指定日を含む日曜始まりの7日間を返す。 */
export function getWeekDates(baseDate: Date): Date[] {
  const date = toDateOnly(baseDate);
  const start = addDays(date, -date.getDay());
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function isToday(date: Date): boolean {
  return isSameDate(date, new Date());
}
