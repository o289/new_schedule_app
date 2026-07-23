import { useCalendar } from "../../context/CalendarContext";
import { getWeekDates } from "../../utils/date";
import { getCategoryTheme } from "../../utils/getCategoryTheme";
import type { EventInput } from "@fullcalendar/core";
import type { Dispatch, SetStateAction } from "react";
import type { ScheduleForm, ScheduleResponse } from "../../types/schedule";
import { toScheduleForm } from "../schedules/scheduleFormAdapter";

interface MobileWeekScheduleProps {
  selectedDate: Date;
  setDraftSchedule: Dispatch<SetStateAction<ScheduleForm>>;
  setSelectedSchedule: (schedule: ScheduleResponse) => void;
  events: EventInput[];
  setIsDrawerOpen?: Dispatch<SetStateAction<boolean>>;
}

export default function MobileWeekSchedule({
  selectedDate,
  setDraftSchedule,
  setSelectedSchedule,
  events,
  setIsDrawerOpen,
}: MobileWeekScheduleProps) {
  const spanClass = `text-xl font-bold`;

  const { handleDaySelect, setSelectedEvent, setAsideMode } = useCalendar();

  const weekDays = getWeekDates(selectedDate);
  const toDate = (value: EventInput["start"]): Date | null => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const sortedEvents = [...events].sort(
    (a, b) =>
      (toDate(a.start)?.getTime() ?? 0) - (toDate(b.start)?.getTime() ?? 0),
  );
  const eventsByDay = weekDays.map((day) => {
    const dayEvents = sortedEvents.filter((event) => {
      const eventDate = toDate(event.start);

      if (!eventDate) return false;

      return (
        eventDate.getFullYear() === day.getFullYear() &&
        eventDate.getMonth() === day.getMonth() &&
        eventDate.getDate() === day.getDate()
      );
    });

    return {
      day,
      events: dayEvents,
    };
  });
  return (
    <div className="bg-white">
      <div className="grid grid-cols-7 border-b border-gray-300">
        {weekDays.map((date) => {
          const dayColor =
            date.getDay() === 0
              ? "text-red-500"
              : date.getDay() === 6
                ? "text-blue-500"
                : "";

          return (
            <button
              key={date.toISOString()}
              className="flex flex-col items-center justify-center p-3 border-r border-gray-300 last:border-r-0"
              onClick={() => handleDaySelect(date)}
            >
              <span className={`${spanClass} ${dayColor}`}>
                {date.getDate()}/
              </span>
              <span className={`${spanClass} ${dayColor}`}>
                {["日", "月", "火", "水", "木", "金", "土"][date.getDay()]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative min-h-[600px]">
        <div className="absolute inset-0 grid grid-cols-7 pointer-events-none">
          {weekDays.map((date) => (
            <div
              key={`line-${date.toISOString()}`}
              className="border-r border-gray-300 last:border-r-0"
            />
          ))}
        </div>
        <div className="relative z-10 grid grid-cols-7 h-full">
          {eventsByDay.map(({ day, events }) => (
            <div key={day.toISOString()} className="flex flex-col gap-2">
              {events.map((event) => {
                const schedule = event.extendedProps?.schedule as
                  ScheduleResponse | undefined;
                if (!schedule) return null;
                const theme = getCategoryTheme(schedule.category?.color);

                return (
                  <div
                    key={event.id}
                    className="rounded-md border border-gray-200 bg-white shadow-sm"
                    style={{
                      borderLeft: `4px solid ${theme.border}`,
                    }}
                    onClick={() => {
                      setSelectedEvent(null);
                      setSelectedSchedule(schedule);
                      setDraftSchedule(toScheduleForm(schedule));
                      if (setIsDrawerOpen) {
                        setIsDrawerOpen(true);
                      }
                      setAsideMode("detail");
                    }}
                  >
                    <div className="text-[14px] font-semibold text-[#374151]">
                      {toDate(event.start)?.toLocaleTimeString("ja-JP", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div
                      className="text-sm font-bold break-words line-clamp-3"
                      style={{ color: theme.border }}
                    >
                      {event.title}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
