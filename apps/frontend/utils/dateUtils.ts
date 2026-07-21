/*
====================================================
Calendar Calculation Utilities
----------------------------------------------------
用途:
- カレンダーUI用の純粋な日付計算ロジック
- React / FullCalendar に依存しない
- 副作用なし（pure functionsのみ）

ルール:
- Dateを受け取ってDateを返す
- 文字列操作は最小限
- 常にローカル時間基準で扱う
====================================================
*/

/**
 * 時刻を削除したDateを返す（ローカル基準）
 */
export function toDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Date → YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 日付を加算・減算
 */
export function addDays(date: Date, offset: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + offset);
  return result;
}

/**
 * 月の日数取得
 */
export function getDaysInMonth(year: number, month: number): number {
  // month: 1-12想定
  return new Date(year, month, 0).getDate();
}

/**
 * 月の日付配列生成（Date配列で返す）
 */
export function getMonthDates(year: number, month: number): Date[] {
  const days = getDaysInMonth(year, month);
  return Array.from({ length: days }, (_, i) => {
    return new Date(year, month - 1, i + 1);
  });
}

/**
 * 指定日を含む週（7日間）を返す
 * 週の開始は日曜日固定
 */
export function getWeekDates(baseDate: Date): Date[] {
  const date = toDateOnly(baseDate);
  const day = date.getDay(); // 0=Sun
  const start = addDays(date, -day);

  return Array.from({ length: 7 }, (_, i) => {
    return addDays(start, i);
  });
}

/**
 * 同日判定（時刻無視）
 */
export function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * 今日判定
 */
export function isToday(date: Date): boolean {
  return isSameDate(date, new Date());
}

/**
 * 表示範囲内判定
 * endは排他的（FullCalendar仕様に合わせる）
 */
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

/**
 * 週が月を跨いでいるか判定
 */
export function isWeekCrossingMonth(weekDates: Date[]): boolean {
  if (!weekDates || weekDates.length === 0) return false;

  const firstMonth = weekDates[0]!.getMonth();
  return weekDates.some((date) => date.getMonth() !== firstMonth);
}
