/**
 * APIで扱う日時は、UTCへ変換しない日本時間の日時文字列である。
 * 例: "2026-07-22T10:00:00"（末尾にZを付けない）
 */

export interface LocalDateTimeParts {
  date: string;
  time: string;
}

/** DB由来の空白区切りを、APIで扱うT区切りのローカル日時へ統一する。 */
export function normalizeLocalDateTime(value: string): string {
  return value.replace(" ", "T");
}

/** 日時文字列を日付（YYYY-MM-DD）と時刻（HH:mm）に分ける。 */
export function getLocalDateTimeParts(value: string): LocalDateTimeParts {
  return {
    date: value.slice(0, 10),
    time: value.slice(11, 16),
  };
}

/** 日時文字列から日付部分（YYYY-MM-DD）を取り出す。 */
export function toISODate(isoDatetime: string): string {
  return isoDatetime.slice(0, 10);
}

/** 日付と時刻をタイムゾーンなしの日時文字列として結合する。 */
export function toISODatetime(isoDate: string, time: string): string {
  return `${isoDate}T${time}:00`;
}

/** Dateをローカル日付のYYYY-MM-DD形式へ変換する。 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** YYYY-MM-DD形式の日付を、ローカル日付のまま指定日数だけ移動する。 */
export function addDaysToISODate(isoDate: string, offset: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }

  return formatDate(new Date(year, month - 1, day + offset));
}

/** 時刻を除いたローカル日付を返す。 */
export function toDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** 指定日から日数を加減する。 */
export function addDays(date: Date, offset: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + offset);
  return result;
}

/** 二つのDateが同じローカル日付かどうかを判定する。 */
export function isSameDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
