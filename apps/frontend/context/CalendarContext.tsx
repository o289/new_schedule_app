import { createContext, useContext, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type FullCalendar from "@fullcalendar/react";
import {
  moveDesktopCalendarDate,
  type DesktopCalendarView,
  type MobileCalendarView,
} from "../components/calendar/calendarView";

export type AsideMode = "create" | "edit" | "detail" | "category" | null;

interface CalendarContextValue {
  calendarRef: RefObject<FullCalendar | null>;
  selectedDate: Date;
  desktopView: DesktopCalendarView;
  setDesktopView: (view: DesktopCalendarView) => void;
  mobileView: MobileCalendarView;
  setMobileView: (view: MobileCalendarView) => void;
  selectedScheduleDateId: string | null;
  setSelectedScheduleDateId: (scheduleDateId: string | null) => void;
  selectedScheduleId: string | null;
  setSelectedScheduleId: (scheduleId: string | null) => void;
  asideMode: AsideMode;
  setAsideMode: (mode: AsideMode) => void;
  handleDesktopWeekSelect: (date: Date) => void;
  handleMobileDaySelect: (date: Date) => void;
  handleNext: () => void;
  handlePrev: () => void;
}

const CalendarContext = createContext<CalendarContextValue | undefined>(
  undefined,
);

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [desktopView, setDesktopView] = useState<DesktopCalendarView>("month");
  const [mobileView, setMobileView] = useState<MobileCalendarView>("month");
  const [selectedScheduleDateId, setSelectedScheduleDateId] = useState<
    string | null
  >(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(
    null,
  );
  const [asideMode, setAsideMode] = useState<AsideMode>(null);
  const calendarRef = useRef<FullCalendar | null>(null);

  const handleDesktopWeekSelect = (date: Date) => {
    setSelectedDate(date);
    setDesktopView("week");
  };

  const handleMobileDaySelect = (date: Date) => {
    setSelectedDate(date);
    setMobileView("day");
  };

  const handlePrev = () => {
    const api = calendarRef.current?.getApi();

    if (!api) {
      setSelectedDate(moveDesktopCalendarDate(selectedDate, desktopView, -1));
      return;
    }

    api.prev();

    setSelectedDate(api.getDate());
  };

  const handleNext = () => {
    const api = calendarRef.current?.getApi();

    if (!api) {
      setSelectedDate(moveDesktopCalendarDate(selectedDate, desktopView, 1));
      return;
    }

    api.next();

    setSelectedDate(api.getDate());
  };

  return (
    <CalendarContext.Provider
      value={{
        calendarRef,
        selectedDate,
        desktopView,
        setDesktopView,
        mobileView,
        setMobileView,
        selectedScheduleDateId,
        setSelectedScheduleDateId,
        selectedScheduleId,
        setSelectedScheduleId,
        asideMode,
        setAsideMode,
        handleDesktopWeekSelect,
        handleMobileDaySelect,
        handleNext,
        handlePrev,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar() {
  const context = useContext(CalendarContext);
  if (!context)
    throw new Error("useCalendar must be used within CalendarProvider");
  return context;
}
