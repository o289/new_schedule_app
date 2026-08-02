import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import type { EventInput } from "@fullcalendar/core";
import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { useCalendar } from "../../context/CalendarContext";
import type { ScheduleResponse } from "../../types/schedule";
import {
  addDays,
  formatDate,
  toDateOnly,
} from "../../../../packages/utils/local-datetime";
import { isToday } from "../../utils/date";
import { getCategoryTheme } from "../../utils/getCategoryTheme";

interface MobileModeProps {
  selectedDate: Date;
  resetDraft: () => void;
  events: EventInput[];
  onScheduleOpen: (schedule: ScheduleResponse, scheduleDateId: string) => void;
  setIsDrawerOpen?: Dispatch<SetStateAction<boolean>>;
}

interface DayEvent {
  event: EventInput;
  timeText: string;
}

const weekDayLabels = ["日", "月", "火", "水", "木", "金", "土"];

function toDate(value: EventInput["start"]): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getMonthDates(month: Date): Date[] {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const start = addDays(toDateOnly(firstDay), -firstDay.getDay());
  const end = addDays(toDateOnly(lastDay), 6 - lastDay.getDay());
  const numberOfDays =
    Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  return Array.from({ length: numberOfDays }, (_, index) =>
    addDays(start, index),
  );
}

export default function MobileMode({
  selectedDate,
  resetDraft,
  events,
  onScheduleOpen,
  setIsDrawerOpen,
}: MobileModeProps) {
  const { handleMobileDaySelect, setAsideMode } = useCalendar();
  const [displayMonth, setDisplayMonth] = useState(selectedDate);
  const months = [displayMonth];

  const eventsByDate = useMemo(() => {
    const sortedEvents = [...events].sort(
      (first, second) =>
        (toDate(first.start)?.getTime() ?? 0) -
        (toDate(second.start)?.getTime() ?? 0),
    );
    const result = new Map<string, DayEvent[]>();

    for (const event of sortedEvents) {
      const eventStart = toDate(event.start);
      const eventEnd = toDate(event.end);
      if (!eventStart || !eventEnd) continue;

      const firstDate = toDateOnly(eventStart);
      const finalDate = toDateOnly(new Date(eventEnd.getTime() - 1));

      for (
        let day = firstDate;
        day.getTime() <= finalDate.getTime();
        day = addDays(day, 1)
      ) {
        const dayStart = toDateOnly(day);
        const dayEnd = addDays(dayStart, 1);
        const visibleStart = eventStart < dayStart ? dayStart : eventStart;
        const visibleEnd = eventEnd > dayEnd ? dayEnd : eventEnd;
        const endLabel =
          visibleEnd.getTime() === dayEnd.getTime()
            ? "24:00"
            : formatTime(visibleEnd);
        const key = formatDate(day);

        result.set(key, [
          ...(result.get(key) ?? []),
          { event, timeText: `${formatTime(visibleStart)} - ${endLabel}` },
        ]);
      }
    }

    return result;
  }, [events]);

  useEffect(() => {
    setDisplayMonth(selectedDate);
  }, [selectedDate]);

  const handlePrev = () => {
    setDisplayMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
    );
  };

  const handleNext = () => {
    setDisplayMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
    );
  };

  const openScheduleDetail = (event: EventInput) => {
    const schedule = event.extendedProps?.schedule as
      ScheduleResponse | undefined;
    if (!schedule || !event.id) return;

    onScheduleOpen(schedule, String(event.id));
  };

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-white">
      <header className="sticky top-0 z-30 shrink-0 bg-white shadow-[0_1px_0_#e5e7eb]">
        <div className="flex items-center justify-between px-5 pt-5">
          <button
            type="button"
            className="flex h-12 items-center gap-1 rounded-2xl bg-white px-3 text-base font-bold text-[#111827] shadow-md"
            onClick={() => setIsDrawerOpen?.(true)}
          >
            <ChevronLeftIcon />
            メニュー
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="予定を追加"
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#111827] shadow-md"
              onClick={() => {
                resetDraft();
                setAsideMode("create");
                setIsDrawerOpen?.(true);
              }}
            >
              <AddIcon />
            </button>
            <button
              type="button"
              aria-label="カテゴリーを管理"
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#111827] shadow-md"
              onClick={() => {
                setAsideMode("category");
                setIsDrawerOpen?.(true);
              }}
            >
              <LocalOfferOutlinedIcon />
            </button>
            <button
              type="button"
              className="h-12 rounded-2xl bg-white px-4 text-base font-bold text-[#111827] shadow-md"
              onClick={() => handleMobileDaySelect(new Date())}
            >
              今日
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 px-5 py-4">
          <button
            type="button"
            aria-label="前の月"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#111827] hover:bg-[#f3f4f6]"
            onClick={handlePrev}
          >
            <ChevronLeftIcon />
          </button>
          <h2 className="min-w-20 text-center text-3xl font-bold text-[#111827]">
            {displayMonth.getFullYear()}年{displayMonth.getMonth() + 1}月
          </h2>
          <button
            type="button"
            aria-label="次の月"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#111827] hover:bg-[#f3f4f6]"
            onClick={handleNext}
          >
            <ChevronRightIcon />
          </button>
        </div>

        <div className="grid w-full grid-cols-7 border-b border-[#e5e7eb] bg-white">
          {weekDayLabels.map((label, index) => (
            <div
              key={label}
              className={`py-2 text-center text-sm font-semibold ${
                index === 0
                  ? "text-red-500"
                  : index === 6
                    ? "text-blue-500"
                    : "text-[#374151]"
              }`}
            >
              {label}
            </div>
          ))}
        </div>
      </header>

      <div className="shrink-0">
        {months.map((month) => {
          const days = getMonthDates(month);
          const monthKey = `${month.getFullYear()}-${month.getMonth()}`;

          return (
            <div key={monthKey} className="border-b border-[#e5e7eb]">
              <div className="grid w-full grid-cols-7">
                {days.map((day) => {
                  const dayEvents = eventsByDate.get(formatDate(day)) ?? [];
                  const isCurrentMonth = day.getMonth() === month.getMonth();
                  const isCurrentDay = isToday(day);
                  const weekday = day.getDay();
                  const dayColor =
                    weekday === 0
                      ? "text-red-500"
                      : weekday === 6
                        ? "text-blue-500"
                        : "text-[#374151]";

                  return (
                    <div
                      key={formatDate(day)}
                      className="min-h-[7.25rem] border-b border-r border-[#f3f4f6] p-1 last:border-r-0"
                    >
                      <button
                        type="button"
                        aria-label={`${day.getMonth() + 1}月${day.getDate()}日を表示`}
                        className={`mb-1 flex h-8 w-8 items-center justify-center rounded-xl text-sm font-semibold ${
                          isCurrentDay
                            ? "bg-[#2f80ed] text-white"
                            : isCurrentMonth
                              ? dayColor
                              : "text-[#c4c8cf]"
                        }`}
                        onClick={() => handleMobileDaySelect(day)}
                      >
                        {day.getDate()}
                      </button>

                      <div className="flex flex-col gap-1">
                        {dayEvents.slice(0, 2).map(({ event, timeText }) => {
                          const schedule = event.extendedProps?.schedule as
                            ScheduleResponse | undefined;
                          if (!schedule) return null;
                          const theme = getCategoryTheme(
                            schedule.category?.color,
                          );

                          return (
                            <button
                              key={String(event.id)}
                              type="button"
                              className="overflow-hidden rounded-md border border-[#e5e7eb] bg-white text-left shadow-sm"
                              style={{
                                borderLeft: `3px solid ${theme.border}`,
                              }}
                              onClick={() => openScheduleDetail(event)}
                            >
                              <span className="block truncate px-1 text-[9px] font-semibold text-[#374151]">
                                {timeText}
                              </span>
                              <span
                                className="block truncate px-1 text-[10px] font-bold"
                                style={{ color: theme.border }}
                              >
                                {event.title}
                              </span>
                            </button>
                          );
                        })}

                        {dayEvents[2] &&
                          (() => {
                            const { event } = dayEvents[2];
                            const schedule = event.extendedProps?.schedule as
                              ScheduleResponse | undefined;
                            if (!schedule) return null;
                            const theme = getCategoryTheme(
                              schedule.category?.color,
                            );

                            return (
                              <button
                                key={String(event.id)}
                                type="button"
                                className="w-full truncate rounded-full px-1.5 py-0.5 text-left text-[10px] font-bold"
                                style={{
                                  backgroundColor: theme.bg,
                                  color: theme.text,
                                }}
                                onClick={() => openScheduleDetail(event)}
                              >
                                {event.title}
                              </button>
                            );
                          })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
