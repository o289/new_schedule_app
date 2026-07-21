import { useMemo } from "react";
import type { EventInput } from "@fullcalendar/core";
import type { ScheduleResponse } from "../../types/schedule";

export function useCalendarEvents(schedules: ScheduleResponse[]) {
  const events = useMemo<EventInput[]>(() => {
    return schedules.flatMap((s: ScheduleResponse) =>
      s.dates.map((d) => ({
        id: d.id,
        title: s.title ?? "",
        start: d.startDate,
        end: d.endDate,

        color: "transparent",

        extendedProps: {
          schedule: s,
        },
      })),
    );
  }, [schedules]);

  return { events };
}
