import type { ScheduleFormDate } from "../../types/schedule";

export interface TimeRange {
  start: string;
  end: string;
}

const japanTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function getTime(isoDateTime: string): string | null {
  // APIの日時はUTCとして保存される。タイムゾーンなしの既存値もUTCとして扱う。
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(isoDateTime)
    ? isoDateTime
    : `${isoDateTime}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;

  return japanTimeFormatter.format(date);
}

function toUtcDateTime(dateValue: string, time: string): string {
  const year = Number(dateValue.slice(0, 4));
  const month = Number(dateValue.slice(5, 7));
  const day = Number(dateValue.slice(8, 10));
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    throw new Error("Invalid date or time");
  }

  // 日本時間の入力を、APIで扱うUTCのタイムゾーンなしISO文字列へ変換する。
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute))
    .toISOString()
    .slice(0, 19);
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
    startDate: toUtcDateTime(date.startDate.slice(0, 10), range.start),
    endDate: toUtcDateTime(date.endDate.slice(0, 10), range.end),
  }));
}
