import { createContext, createRef, useContext, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type FullCalendar from "@fullcalendar/react";
import type { EventApi } from "@fullcalendar/core";
import type { ScheduleResponse } from "../types/schedule";

export type CalendarView = "day" | "week";
export type AsideMode = "create" | "edit" | "detail" | "category" | null;

interface CalendarContextValue {
  calendarRef: RefObject<FullCalendar | null>;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  currentView: CalendarView;
  setCurrentView: (view: CalendarView) => void;
  selectedEvent: EventApi | null;
  setSelectedEvent: (event: EventApi | null) => void;
  selectedSchedule: ScheduleResponse | null;
  setSelectedSchedule: (schedule: ScheduleResponse | null) => void;
  asideMode: AsideMode;
  setAsideMode: (mode: AsideMode) => void;
  handleDaySelect: (date: Date) => void;
  handleWeekSelect: (date: Date) => void;
  handleNext: () => void;
  handlePrev: () => void;
}

const CalendarContext = createContext<CalendarContextValue | undefined>(
  undefined,
);

export function CalendarProvider({ children }: { children: ReactNode }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [currentView, setCurrentView] = useState<CalendarView>("week");
  const [selectedEvent, setSelectedEvent] = useState<EventApi | null>(null);
  const [selectedSchedule, setSelectedSchedule] =
    useState<ScheduleResponse | null>(null);
  const [asideMode, setAsideMode] = useState<AsideMode>(null);
  const calendarRef = createRef<FullCalendar>();

  const handleDaySelect = (date: Date) => {
    setSelectedDate(date);
    setCurrentView("day");
  };

  const handleWeekSelect = (date: Date) => {
    setSelectedDate(date);
    setCurrentView("week");
  };

  const handlePrev = () => {
    const api = calendarRef.current?.getApi();

    if (!api) {
      const prevDate = new Date(selectedDate);

      if (currentView === "week") {
        prevDate.setDate(prevDate.getDate() - 7);
      } else {
        prevDate.setDate(prevDate.getDate() - 1);
      }

      setSelectedDate(prevDate);
      return;
    }

    api.prev();

    setSelectedDate(api.getDate());
  };

  const handleNext = () => {
    const api = calendarRef.current?.getApi();

    if (!api) {
      const nextDate = new Date(selectedDate);

      if (currentView === "week") {
        nextDate.setDate(nextDate.getDate() + 7);
      } else {
        nextDate.setDate(nextDate.getDate() + 1);
      }

      setSelectedDate(nextDate);
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
        setSelectedDate,
        currentView,
        setCurrentView,
        selectedEvent,
        setSelectedEvent,
        selectedSchedule,
        setSelectedSchedule,
        asideMode,
        setAsideMode,
        handleDaySelect,
        handleWeekSelect,
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
