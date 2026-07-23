import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { ComponentProps, Dispatch, SetStateAction } from "react";
import FullCalendar from "@fullcalendar/react";
import type {
  DayHeaderContentArg,
  EventClickArg,
  EventContentArg,
  EventInput,
  SlotLabelContentArg,
} from "@fullcalendar/core";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import jaLocale from "@fullcalendar/core/locales/ja";
import type { AsideMode, CalendarView } from "../../context/CalendarContext";
import type { ScheduleForm, ScheduleResponse } from "../../types/schedule";
import useIsMobile from "../../hooks/useIsMobile";
import EventCard from "./EventCard";
import { toScheduleForm } from "../schedules/scheduleFormAdapter";
import "./FullCalendarWrapper.css";

type FullCalendarProps = ComponentProps<typeof FullCalendar>;
type DateClickArg = Parameters<NonNullable<FullCalendarProps["dateClick"]>>[0];

interface FullCalendarWrapperProps {
  events: EventInput[];
  selectedDate: Date;
  setSelectedEvent: (event: EventClickArg["event"]) => void;
  setSelectedSchedule: (schedule: ScheduleResponse) => void;
  currentView: CalendarView;
  onDateClick: (date: Date) => void;
  setDraftSchedule: Dispatch<SetStateAction<ScheduleForm>>;
  setAsideMode: (mode: AsideMode) => void;
  setIsDrawerOpen?: Dispatch<SetStateAction<boolean>>;
}

const FullCalendarWrapper = forwardRef<FullCalendar, FullCalendarWrapperProps>(
  function FullCalendarWrapper(
    {
      events,
      selectedDate,
      setSelectedEvent,
      setSelectedSchedule,
      currentView,
      onDateClick,
      setDraftSchedule,
      setAsideMode,
      setIsDrawerOpen,
    },
    ref,
  ) {
    const isMobile = useIsMobile();
    const calendarRef = useRef<FullCalendar | null>(null);
    useImperativeHandle(ref, () => calendarRef.current as FullCalendar, []);

    useEffect(() => {
      calendarRef.current?.getApi().changeView("timeGridWeek");
    }, [isMobile]);

    useEffect(() => {
      const calendarApi = calendarRef.current?.getApi();
      if (!calendarApi) return;
      calendarApi.changeView(
        currentView === "day" ? "timeGridDay" : "timeGridWeek",
        selectedDate,
      );
    }, [selectedDate, currentView]);

    const handleDateClick = (arg: DateClickArg) => onDateClick(arg.date);
    const slotLabelContent = (arg: SlotLabelContentArg) =>
      isMobile && arg.view.type === "timeGridWeek" ? null : arg.text;
    const dayHeaderContent = (arg: DayHeaderContentArg) => {
      const date = arg.date;
      const day = date.getDate();
      const month = date.getMonth() + 1;

      const isWeek = arg.view.type === "timeGridWeek";
      const isMobileWeek = isMobile && isWeek;

      const weekday = date.toLocaleDateString("ja-JP", {
        weekday: isMobileWeek ? "short" : "long",
      });

      // 月跨ぎ判定
      const viewStartMonth = arg.view.currentStart.getMonth();
      const isCrossMonth = month - 1 !== viewStartMonth;

      if (day === 1 && isCrossMonth) {
        const dayCrossMonth = isMobileWeek
          ? `${month}/${day}${weekday}`
          : `${month}月${day}日/${weekday}`;
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

      setSelectedEvent(info.event);
      setSelectedSchedule(schedule);
      setDraftSchedule(toScheduleForm(schedule));
      setIsDrawerOpen?.(true);
      setAsideMode("detail");
    };
    const eventContent = (arg: EventContentArg) => (
      <EventCard event={arg.event} timeText={arg.timeText} />
    );

    return (
      <FullCalendar
        ref={calendarRef}
        plugins={[timeGridPlugin, interactionPlugin, luxonPlugin]}
        initialView="timeGridWeek"
        timeZone="Asia/Tokyo"
        locale={jaLocale}
        firstDay={0}
        events={events}
        dateClick={handleDateClick}
        headerToolbar={false}
        slotDuration="00:30:00"
        expandRows={false}
        allDaySlot={false}
        slotLabelContent={slotLabelContent}
        dayHeaderContent={dayHeaderContent}
        height="auto"
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        eventClick={handleEventClick}
        eventContent={eventContent}
      />
    );
  },
);

export default FullCalendarWrapper;
