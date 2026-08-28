import { useEffect, useImperativeHandle, useRef } from "react";
import type { ComponentProps, Ref } from "react";
import FullCalendar from "@fullcalendar/react";
import type {
  DayHeaderContentArg,
  EventClickArg,
  EventContentArg,
  EventInput,
  SlotLabelContentArg,
} from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import jaLocale from "@fullcalendar/core/locales/ja";
import type { ScheduleResponse } from "#frontend/types/schedule";
import EventCard from "./EventCard";
import { toFullCalendarView, type FullCalendarView } from "./calendarView";
import "./FullCalendarWrapper.css";

type FullCalendarProps = ComponentProps<typeof FullCalendar>;
type DateClickArg = Parameters<NonNullable<FullCalendarProps["dateClick"]>>[0];

interface FullCalendarWrapperProps {
  ref?: Ref<FullCalendar>;
  events: EventInput[];
  selectedDate: Date;
  currentView: FullCalendarView;
  onDateClick: (date: Date) => void;
  onScheduleOpen: (schedule: ScheduleResponse, scheduleDateId: string) => void;
}

function FullCalendarWrapper({
  ref,
  events,
  selectedDate,
  currentView,
  onDateClick,
  onScheduleOpen,
}: FullCalendarWrapperProps) {
  const calendarRef = useRef<FullCalendar | null>(null);
  useImperativeHandle(ref, () => calendarRef.current as FullCalendar, []);

  useEffect(() => {
    const calendarApi = calendarRef.current?.getApi();
    if (!calendarApi) return;
    calendarApi.changeView(toFullCalendarView(currentView), selectedDate);
  }, [selectedDate, currentView]);

  const handleDateClick = (arg: DateClickArg) => onDateClick(arg.date);
  const slotLabelContent = (arg: SlotLabelContentArg) => arg.text;
  const dayHeaderContent = (arg: DayHeaderContentArg) => {
    const date = arg.date;
    const day = date.getDate();
    const month = date.getMonth() + 1;

    if (arg.view.type === "dayGridMonth") {
      const weekday = date.toLocaleDateString("ja-JP", {
        weekday: "short",
      });

      return (
        <div className="flex h-11 items-center justify-center">
          <span className="text-sm font-semibold">{weekday}</span>
        </div>
      );
    }

    const weekday = date.toLocaleDateString("ja-JP", {
      weekday: "long",
    });

    // 月跨ぎ判定
    const viewStartMonth = arg.view.currentStart.getMonth();
    const isCrossMonth = month - 1 !== viewStartMonth;

    if (day === 1 && isCrossMonth) {
      const dayCrossMonth = `${month}月${day}日/${weekday}`;
      return (
        <div className="flex h-[72px] items-center justify-center">
          <span className="text-lg font-semibold">{dayCrossMonth}</span>
        </div>
      );
    }

    return (
      <div className="flex h-[72px] items-center justify-center">
        <span className="text-lg font-semibold">
          {day}/{weekday}
        </span>
      </div>
    );
  };
  const handleEventClick = (info: EventClickArg) => {
    const schedule = info.event.extendedProps.schedule as
      ScheduleResponse | undefined;
    if (!schedule) return;

    onScheduleOpen(schedule, info.event.id);
  };
  const eventContent = (arg: EventContentArg) => {
    const variant = arg.view.type === "dayGridMonth" ? "month" : "week";
    return (
      <EventCard event={arg.event} timeText={arg.timeText} variant={variant} />
    );
  };

  return (
    <FullCalendar
      ref={calendarRef}
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin]}
      initialView={toFullCalendarView(currentView)}
      timeZone="Asia/Tokyo"
      locale={jaLocale}
      firstDay={0}
      events={events}
      dateClick={handleDateClick}
      headerToolbar={false}
      slotDuration="00:30:00"
      expandRows={false}
      allDaySlot={false}
      dayMaxEvents={3}
      moreLinkText={(count) => `他${count}件`}
      nextDayThreshold="00:00:00"
      slotLabelContent={slotLabelContent}
      dayHeaderContent={dayHeaderContent}
      height="auto"
      eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
      eventClick={handleEventClick}
      eventContent={eventContent}
    />
  );
}

export default FullCalendarWrapper;
