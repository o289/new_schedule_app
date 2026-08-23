import type { EventInput } from "@fullcalendar/core";

import type { GroupDailyBusySegment } from "./groupCalendarSegments";

export type GroupCalendarRange = { startDate: string; endDate: string };

export type GroupCalendarEvent = EventInput & {
  extendedProps: { segment: GroupDailyBusySegment };
};

function formatDateInTokyo(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year!}-${values.month!}-${values.day!}`;
}

function shiftDate(day: string, amount: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, date! + amount));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function atStartOfDay(day: string): string {
  return `${day}T00:00:00`;
}

export function getInitialGroupCalendarRange(
  now = new Date(),
): GroupCalendarRange {
  const today = formatDateInTokyo(now);
  const [year, month, date] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(year!, month! - 1, date!)).getUTCDay();
  const startDay = shiftDate(today, -weekday);

  return {
    startDate: atStartOfDay(startDay),
    endDate: atStartOfDay(shiftDate(startDay, 7)),
  };
}

export function getGroupCalendarRange(
  start: Date,
  end: Date,
): GroupCalendarRange {
  return {
    startDate: atStartOfDay(formatDateInTokyo(start)),
    endDate: atStartOfDay(formatDateInTokyo(end)),
  };
}

export function toGroupCalendarEvents(
  segments: GroupDailyBusySegment[],
): GroupCalendarEvent[] {
  return segments.map((segment) => ({
    id: `${segment.day}-${segment.startDate}-${segment.endDate}`,
    title: "予定あり",
    start: segment.startDate,
    end: segment.endDate,
    extendedProps: { segment },
  }));
}

export function formatGroupCalendarEventTime(value: string): string {
  const [day, time] = value.split("T");
  const [year, month, date] = day!.split("-");
  return `${year}年${month}月${date}日 ${time!.slice(0, 5)}`;
}

export function formatGroupCalendarEventTimeRange(
  startDate: string,
  endDate: string,
): string {
  const startTime = startDate.split("T")[1]!.slice(0, 5);
  const endTime = endDate.split("T")[1]!.slice(0, 5);
  const startDay = startDate.split("T")[0];
  const endDay = endDate.split("T")[0];

  return startDay === endDay
    ? `${startTime}〜${endTime}`
    : `${startTime}〜翌日 ${endTime}`;
}
