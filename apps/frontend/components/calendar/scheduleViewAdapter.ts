// scheduleViewAdapter.js

import type { ScheduleDateResponse } from "#frontend/types/schedule";
import { getLocalDateTimeParts } from "#utils/local-datetime";
import { crossesCalendarDate } from "../schedules/scheduleTime";

function getTodayISODate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * pastPolicy:
 *  - "hide"      : 過去日付を除外
 *  - "show"      : すべて表示
 *  - "gray"      : フラグ付与（UI側で制御）
 */
export function buildTimeGroupsFromDates(
  apiDates: ScheduleDateResponse[],
  pastPolicy: "hide" | "show" | "gray" = "hide",
) {
  const today = getTodayISODate();
  const map = new Map<
    string,
    {
      start: string;
      end: string;
      crossesDate: boolean;
      dates: {
        id: string;
        date: string;
        endDate: string;
        isPast: boolean;
      }[];
    }
  >();

  apiDates.forEach((d) => {
    const start = getLocalDateTimeParts(d.startDate);
    const end = getLocalDateTimeParts(d.endDate);

    const isPast = start.date < today;

    // hide の場合のみここで除外
    if (pastPolicy === "hide" && isPast) return;

    const crossesDate = crossesCalendarDate(d.startDate, d.endDate);
    const key = `${start.time}-${end.time}-${crossesDate ? "next" : "same"}`;

    if (!map.has(key)) {
      map.set(key, {
        start: start.time,
        end: end.time,
        crossesDate,
        dates: [],
      });
    }

    map.get(key)!.dates.push({
      id: d.id,
      date: start.date,
      endDate: end.date,
      isPast, // show / gray / collapse 用
    });
  });

  return Array.from(map.values()).filter((tg) => tg.dates.length > 0);
}
