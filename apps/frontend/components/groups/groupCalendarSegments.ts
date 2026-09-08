import type { GroupBusyEvent, GroupCalendarResponse } from "#schemas/group";
import { normalizeLocalDateTime } from "#utils/local-datetime";

export type GroupCalendarSegment = GroupBusyEvent & {
  day: string;
};

export type GroupDailyBusySegment = {
  day: string;
  startDate: string;
  endDate: string;
  memberCount: number;
  memberIds: string[];
  events: GroupCalendarSegment[];
};

function datePart(value: string): string {
  return value.slice(0, 10);
}

function startOfDay(day: string): string {
  return `${day}T00:00:00`;
}

function formatDay(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nextDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, date! + 1));
  return formatDay(next);
}

export function splitGroupBusyEvent(
  event: GroupBusyEvent,
): GroupCalendarSegment[] {
  const startDate = normalizeLocalDateTime(event.startDate);
  const endDate = normalizeLocalDateTime(event.endDate);
  if (endDate <= startDate) return [];

  const segments: GroupCalendarSegment[] = [];
  let day = datePart(startDate);
  while (startOfDay(day) < endDate) {
    const followingDay = nextDay(day);
    const segmentStart =
      startDate > startOfDay(day) ? startDate : startOfDay(day);
    const segmentEnd =
      endDate < startOfDay(followingDay) ? endDate : startOfDay(followingDay);

    if (segmentEnd > segmentStart) {
      segments.push({
        ...event,
        startDate: segmentStart,
        endDate: segmentEnd,
        day,
      });
    }
    day = followingDay;
  }

  return segments;
}

export function aggregateGroupBusyEvents(
  events: GroupBusyEvent[],
): GroupDailyBusySegment[] {
  const byDay = new Map<string, GroupCalendarSegment[]>();
  for (const event of events) {
    for (const segment of splitGroupBusyEvent(event)) {
      const segments = byDay.get(segment.day) ?? [];
      segments.push(segment);
      byDay.set(segment.day, segments);
    }
  }

  return [...byDay.entries()]
    .flatMap(([day, segments]) => {
      const sorted = [...segments].sort((left, right) =>
        left.startDate.localeCompare(right.startDate),
      );
      const groups: GroupCalendarSegment[][] = [];

      for (const segment of sorted) {
        const current = groups.at(-1);
        const currentEnd = current?.reduce(
          (latest, event) => (event.endDate > latest ? event.endDate : latest),
          current[0]!.endDate,
        );

        if (!current || !currentEnd || segment.startDate > currentEnd) {
          groups.push([segment]);
        } else {
          current.push(segment);
        }
      }

      return groups.map((group) => {
        const memberIds = [
          ...new Set(group.map((event) => event.member.userId)),
        ];
        const endDate = group.reduce(
          (latest, event) => (event.endDate > latest ? event.endDate : latest),
          group[0]!.endDate,
        );

        return {
          day,
          startDate: group[0]!.startDate,
          endDate,
          memberCount: memberIds.length,
          memberIds,
          events: group,
        };
      });
    })
    .sort((left, right) => left.startDate.localeCompare(right.startDate));
}

function addMinutes(value: string, minutes: number): string {
  const [date, time] = value.split("T");
  const [year, month, day] = date!.split("-").map(Number);
  const [hour, minute] = time!.split(":").map(Number);
  const next = new Date(
    Date.UTC(year!, month! - 1, day!, hour!, minute! + minutes),
  );
  const nextDay = formatDay(next);
  const nextHour = String(next.getUTCHours()).padStart(2, "0");
  const nextMinute = String(next.getUTCMinutes()).padStart(2, "0");
  return `${nextDay}T${nextHour}:${nextMinute}:00`;
}

export function findAvailableHalfHourSlots(
  snapshot: GroupCalendarResponse,
  day: string,
): string[] {
  if (
    snapshot.completeness !== "complete" ||
    snapshot.requestedMemberCount !== snapshot.fetchedMemberCount
  ) {
    return [];
  }

  const segments = aggregateGroupBusyEvents(snapshot.events).flatMap((daily) =>
    daily.day === day ? daily.events : [],
  );
  const slots: string[] = [];
  let startDate = startOfDay(day);
  const endOfDay = startOfDay(nextDay(day));
  while (startDate < endOfDay) {
    const endDate = addMinutes(startDate, 30);
    const hasBusyEvent = segments.some(
      (event) => event.startDate < endDate && event.endDate > startDate,
    );
    if (!hasBusyEvent) slots.push(startDate);
    startDate = endDate;
  }

  return slots;
}
