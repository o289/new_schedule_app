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

export function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function getNowDateTime() {
  // 現在時刻をローカルフォーマットで返す
  const now = new Date();
  return formatLocalDateTime(now);
}

export function getNowPlusOneHour() {
  // 現在時刻＋1時間をローカルフォーマットで返す
  const now = new Date();
  now.setHours(now.getHours() + 1);
  return formatLocalDateTime(now);
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getMonthDates(year: number, month: number): Date[] {
  return Array.from(
    { length: getDaysInMonth(year, month) },
    (_, index) => new Date(year, month - 1, index + 1),
  );
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

/** endは排他的。 */
export function isInRange(
  date: Date,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  const target = toDateOnly(date).getTime();
  const start = toDateOnly(rangeStart).getTime();
  const end = toDateOnly(rangeEnd).getTime();
  return target >= start && target < end;
}

export function isWeekCrossingMonth(weekDates: Date[]): boolean {
  const firstDate = weekDates[0];
  return firstDate
    ? weekDates.some((date) => date.getMonth() !== firstDate.getMonth())
    : false;
}
