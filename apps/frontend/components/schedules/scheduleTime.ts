import type { ScheduleFormDate } from "#frontend/types/schedule";
import {
  addDaysToISODate,
  getLocalDateTimeParts,
  toISODate,
  toISODatetime,
} from "#utils/local-datetime";

export interface TimeRange {
  start: string;
  end: string;
}

const TIME_PATTERN = /^\d{2}:\d{2}$/;

function getTime(dateTime: string): string | null {
  const { time } = getLocalDateTimeParts(dateTime);
  return TIME_PATTERN.test(time) ? time : null;
}

/** 選択日を開始日とし、終了時刻が早い場合だけ終了日を翌日にする。 */
export function buildScheduleDateRange(
  selectedDate: string,
  range: TimeRange,
): Pick<ScheduleFormDate, "startDate" | "endDate"> {
  if (
    !TIME_PATTERN.test(range.start) ||
    !TIME_PATTERN.test(range.end) ||
    range.start === range.end
  ) {
    throw new Error("Start and end time must be different");
  }

  const endDate =
    range.end < range.start ? addDaysToISODate(selectedDate, 1) : selectedDate;

  return {
    startDate: toISODatetime(selectedDate, range.start),
    endDate: toISODatetime(endDate, range.end),
  };
}

export function crossesCalendarDate(
  startDate: string,
  endDate: string,
): boolean {
  return toISODate(startDate) !== toISODate(endDate);
}

function formatMonthDay(dateTime: string): string {
  const [year = "", month = "", day = ""] = toISODate(dateTime).split("-");
  if (!year || !month || !day) return "";
  return `${Number(month)}月${Number(day)}日`;
}

/** 同日は時刻だけ、跨日は開始日と終了日を含めて表示する。 */
export function formatScheduleDateRange(
  startDate: string,
  endDate: string,
): string {
  const start = getLocalDateTimeParts(startDate);
  const end = getLocalDateTimeParts(endDate);

  if (!crossesCalendarDate(startDate, endDate)) {
    return `${start.time} - ${end.time}`;
  }

  return `${formatMonthDay(startDate)} ${start.time} 〜 ${formatMonthDay(endDate)} ${end.time}`;
}

/** 日程配列で最も多い開始・終了時刻の組み合わせを返す。 */
export function getMostFrequentTimeRange(
  dates: ScheduleFormDate[],
): TimeRange | null {
  const counts = new Map<string, { range: TimeRange; count: number }>();
  let mostFrequent: { range: TimeRange; count: number } | null = null;

  for (const date of dates) {
    const start = getTime(date.startDate);
    const end = getTime(date.endDate);
    if (!start || !end) continue;

    const key = `${start}-${end}`;
    const entry = counts.get(key) ?? { range: { start, end }, count: 0 };
    entry.count += 1;
    counts.set(key, entry);

    // 同数時は先に現れた組み合わせを維持する。
    if (!mostFrequent || entry.count > mostFrequent.count) {
      mostFrequent = entry;
    }
  }

  return mostFrequent?.range ?? null;
}

/** 日付とIDを保ったまま、すべての日程の時刻を一括変更する。 */
export function updateAllDatesTime(
  dates: ScheduleFormDate[],
  range: TimeRange,
): ScheduleFormDate[] {
  return dates.map((date) => ({
    ...date,
    ...buildScheduleDateRange(toISODate(date.startDate), range),
  }));
}
