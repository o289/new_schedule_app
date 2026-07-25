import type { Dispatch, SetStateAction } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import type { ScheduleForm, ScheduleResponse } from "../../types/schedule";
import { useCalendarEvents } from "./useCalendarEvent";
import { useCalendar } from "../../context/CalendarContext";
import FullCalendarWrapper from "./FullCalendarWrapper";
import useIsMobile from "../../hooks/useIsMobile";
import MobileMode from "./MobileMode";

interface CalendarMainProps {
  schedules: ScheduleResponse[];
  resetDraft: () => void;
  setDraftSchedule: Dispatch<SetStateAction<ScheduleForm>>;
  setIsDrawerOpen?: Dispatch<SetStateAction<boolean>>;
}

export default function CalendarMain({
  schedules,
  resetDraft,
  setDraftSchedule,
  setIsDrawerOpen,
}: CalendarMainProps) {
  const { events } = useCalendarEvents(schedules);
  const isMobile = useIsMobile(1024);
  const {
    calendarRef,
    selectedDate,
    desktopView,
    mobileView,
    setSelectedScheduleDateId,
    setSelectedSchedule,
    setAsideMode,
    setMobileView,
    handleDesktopWeekSelect,
    handleMobileDaySelect,
  } = useCalendar();

  return (
    <div
      className={
        isMobile
          ? "h-full min-h-0 w-full bg-white"
          : "md:mt-6 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm"
      }
    >
      {isMobile && mobileView === "month" ? (
        <MobileMode
          events={events}
          selectedDate={selectedDate}
          resetDraft={resetDraft}
          setDraftSchedule={setDraftSchedule}
          setSelectedSchedule={setSelectedSchedule}
          setSelectedScheduleDateId={setSelectedScheduleDateId}
          {...(setIsDrawerOpen ? { setIsDrawerOpen } : {})}
        />
      ) : (
        <div className={isMobile ? "flex h-full min-h-0 flex-col" : undefined}>
          {isMobile && mobileView === "day" && (
            <div className="shrink-0 border-b border-[#e5e7eb] bg-white px-4 py-3">
              <button
                type="button"
                className="flex items-center gap-1 text-base font-bold text-[#111827]"
                onClick={() => setMobileView("month")}
              >
                <ChevronLeftIcon />
                カレンダーへ戻る
              </button>
            </div>
          )}
          <FullCalendarWrapper
            ref={calendarRef}
            events={events}
            selectedDate={selectedDate}
            currentView={isMobile ? "day" : desktopView}
            onDateClick={(date) => {
              if (isMobile) {
                handleMobileDaySelect(date);
                return;
              }

              handleDesktopWeekSelect(date);
            }}
            setDraftSchedule={setDraftSchedule}
            setAsideMode={setAsideMode}
            setSelectedScheduleDateId={setSelectedScheduleDateId}
            setSelectedSchedule={setSelectedSchedule}
            {...(setIsDrawerOpen ? { setIsDrawerOpen } : {})}
          />
        </div>
      )}
    </div>
  );
}
