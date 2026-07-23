import type { ScheduleFormDate } from "../../types/schedule";
import {
  getLocalDateTimeParts,
  toISODate,
  toISODatetime,
} from "../../utils/date";

export interface TimeRange {
  start: string;
  end: string;
}

function getTime(dateTime: string): string | null {
  const { time } = getLocalDateTimeParts(dateTime);
  return /^\d{2}:\d{2}$/.test(time) ? time : null;
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
    startDate: toISODatetime(toISODate(date.startDate), range.start),
    endDate: toISODatetime(toISODate(date.endDate), range.end),
  }));
}
