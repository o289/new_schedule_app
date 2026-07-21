// scheduleViewAdapter.js

import type { ScheduleDateResponse } from "../../types/schedule";
import { getLocalDateTimeParts } from "../../utils/date";

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
      dates: { id: string; date: string; isPast: boolean }[];
    }
  >();

  apiDates.forEach((d) => {
    const start = getLocalDateTimeParts(d.startDate);
    const end = getLocalDateTimeParts(d.endDate);

    const isPast = start.date < today;

    // hide の場合のみここで除外
    if (pastPolicy === "hide" && isPast) return;

    const key = `${start.time}-${end.time}`;

    if (!map.has(key)) {
      map.set(key, {
        start: start.time,
        end: end.time,
        dates: [],
      });
    }

    map.get(key)!.dates.push({
      id: d.id,
      date: start.date,
      isPast, // show / gray / collapse 用
    });
  });

  return Array.from(map.values()).filter((tg) => tg.dates.length > 0);
}
