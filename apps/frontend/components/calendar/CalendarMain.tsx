import type { Dispatch, SetStateAction } from "react";
import type { ScheduleForm, ScheduleResponse } from "../../types/schedule";
import { useCalendarEvents } from "./useCalendarEvent";
import { useCalendar } from "../../context/CalendarContext";
import FullCalendarWrapper from "./FullCalendarWrapper";
import useIsMobile from "../../hooks/useIsMobile";
import MobileWeekSchedule from "./MobileWeekSchedule";

interface CalendarMainProps {
  schedules: ScheduleResponse[];
  setDraftSchedule: Dispatch<SetStateAction<ScheduleForm>>;
  setIsDrawerOpen?: Dispatch<SetStateAction<boolean>>;
}

export default function CalendarMain({
  schedules,
  setDraftSchedule,
  setIsDrawerOpen,
}: CalendarMainProps) {
  const { events } = useCalendarEvents(schedules);
  const isMobile = useIsMobile(1024);
  const {
    calendarRef,
    selectedDate,
    currentView,
    setSelectedEvent,
    setSelectedSchedule,
    setAsideMode,
    handleDaySelect,
  } = useCalendar();

  return (
    <div className="md:mt-6 rounded-2xl border border-[#e5e7eb] bg-white shadow-sm overflow-hidden">
      {isMobile && currentView === "week" ? (
        <MobileWeekSchedule
          events={events}
          selectedDate={selectedDate}
          setDraftSchedule={setDraftSchedule}
          setSelectedSchedule={setSelectedSchedule}
          {...(setIsDrawerOpen ? { setIsDrawerOpen } : {})}
        />
      ) : (
        <FullCalendarWrapper
          ref={calendarRef}
          events={events}
          selectedDate={selectedDate}
          currentView={currentView}
          onDateClick={(date) => handleDaySelect(date)}
          setDraftSchedule={setDraftSchedule}
          setAsideMode={setAsideMode}
          setSelectedEvent={setSelectedEvent}
          setSelectedSchedule={setSelectedSchedule}
          {...(setIsDrawerOpen ? { setIsDrawerOpen } : {})}
        />
      )}
    </div>
  );
}
