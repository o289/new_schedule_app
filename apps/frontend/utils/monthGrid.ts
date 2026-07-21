// frontend/src/utils/monthGrid.js

/**
 * YYYY-MM-DD 形式に変換
 */
export function formatDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 今日判定
 */
export function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * 月を週配列（最大6行）に変換
 * 日曜スタート
 *
 * @param {number} year
 * @param {number} month - 1〜12
 * @returns {Array}
 */
export interface MonthGridDay {
  date: Date;
  dateString: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
}

export function generateMonthGrid(
  year: number,
  month: number,
): MonthGridDay[][] {
  const today = new Date();

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  const startWeekday = firstDay.getDay(); // 0 = 日曜
  const totalDays = lastDay.getDate();

  const weeks: MonthGridDay[][] = [];
  let currentWeek: MonthGridDay[] = [];

  // ① 前月補完
  if (startWeekday !== 0) {
    const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      const date = new Date(year, month - 2, prevMonthLastDay - i);
      currentWeek.push(createDayObject(date, false, today));
    }
  }

  // ② 当月
  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month - 1, day);
    currentWeek.push(createDayObject(date, true, today));

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // ③ 次月補完
  let nextMonthDay = 1;
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      const date = new Date(year, month, nextMonthDay++);
      currentWeek.push(createDayObject(date, false, today));
    }
    weeks.push(currentWeek);
  }

  // ④ 最大6行に調整（FCと同様）
  while (weeks.length < 6) {
    const extraWeek: MonthGridDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(year, month, nextMonthDay++);
      extraWeek.push(createDayObject(date, false, today));
    }
    weeks.push(extraWeek);
  }

  return weeks;
}

/**
 * 日オブジェクト生成（UI依存なし）
 */
function createDayObject(
  date: Date,
  isCurrentMonth: boolean,
  today: Date,
): MonthGridDay {
  return {
    date,
    dateString: formatDateString(date),
    day: date.getDate(),
    isCurrentMonth,
    isToday: isSameDate(date, today),
  };
}

/**
 * 月移動（年跨ぎ対応）
 *
 * @param {number} year
 * @param {number} month
 * @param {number} delta - ±1
 * @returns {{year:number, month:number}}
 */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const newDate = new Date(year, month - 1 + delta, 1);
  return {
    year: newDate.getFullYear(),
    month: newDate.getMonth() + 1,
  };
}
