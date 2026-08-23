import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import { Alert, Button, CircularProgress } from "@mui/material";
import type { ScheduleForm, ScheduleResponse } from "#frontend/types/schedule";
import { useCalendarEvents } from "./useCalendarEvent";
import { useCalendar } from "#frontend/context/CalendarContext";
import FullCalendarWrapper from "./FullCalendarWrapper";
import useIsMobile from "#frontend/hooks/useIsMobile";
import MobileMode from "./MobileMode";
import { toScheduleForm } from "../schedules/scheduleFormAdapter";
import GroupCalendar from "../groups/GroupCalendar";
import {
  getInitialGroupCalendarRange,
  type GroupCalendarRange,
} from "../groups/groupCalendarView";
import { useGroupCalendar } from "../groups/useGroupCalendar";

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
  const [groupRange, setGroupRange] = useState<GroupCalendarRange>(
    getInitialGroupCalendarRange,
  );
  const [hasLoadedGroupCalendar, setHasLoadedGroupCalendar] = useState(false);
  const {
    calendarRef,
    selectedDate,
    desktopView,
    mobileView,
    setSelectedScheduleDateId,
    setSelectedScheduleId,
    setAsideMode,
    setMobileView,
    handleDesktopWeekSelect,
    handleMobileDaySelect,
    selectedCalendar,
  } = useCalendar();
  const groupId =
    selectedCalendar.kind === "group" ? selectedCalendar.groupId : "";
  const groupCalendarQuery = useGroupCalendar(groupId, groupRange);

  useEffect(() => {
    setHasLoadedGroupCalendar(false);
  }, [groupId]);

  useEffect(() => {
    if (groupCalendarQuery.state === "success") setHasLoadedGroupCalendar(true);
  }, [groupCalendarQuery.state]);

  const openScheduleDetail = (
    schedule: ScheduleResponse,
    scheduleDateId: string,
  ) => {
    setSelectedScheduleDateId(scheduleDateId);
    setSelectedScheduleId(schedule.id);
    setDraftSchedule(toScheduleForm(schedule));
    setIsDrawerOpen?.(true);
    setAsideMode("detail");
  };

  if (selectedCalendar.kind === "group") {
    const isInitialLoading =
      !hasLoadedGroupCalendar && groupCalendarQuery.state === "loading";
    const isInitialError =
      !hasLoadedGroupCalendar && groupCalendarQuery.state === "error";

    return (
      <div className="md:mt-6 w-full">
        {isInitialLoading && (
          <div className="flex justify-center py-20">
            <CircularProgress aria-label="グループカレンダーを読み込み中" />
          </div>
        )}
        {isInitialError && (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-[#4b5563]">
              グループカレンダーを取得できませんでした。
            </p>
            <Button
              className="!mt-4"
              variant="contained"
              onClick={() => groupCalendarQuery.refetch()}
            >
              再試行
            </Button>
          </div>
        )}
        {!isInitialLoading && !isInitialError && (
          <>
            {groupCalendarQuery.state === "refreshing" && (
              <Alert severity="info" className="!mb-4">
                最新の予定を確認しています。
              </Alert>
            )}
            {groupCalendarQuery.state === "stale" && (
              <Alert
                severity="warning"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => groupCalendarQuery.refetch()}
                  >
                    再試行
                  </Button>
                }
                className="!mb-4"
              >
                {groupRange.startDate.slice(0, 10)}〜
                {groupRange.endDate.slice(0, 10)}
                の最新情報を取得できませんでした。表示中の予定は更新前の情報です。
              </Alert>
            )}
            {groupCalendarQuery.state === "loading" && (
              <Alert severity="info" className="!mb-4">
                表示する週の予定を読み込み中です。
              </Alert>
            )}
            <GroupCalendar
              segments={groupCalendarQuery.dailyBusySegments}
              initialDate={groupRange.startDate}
              onRangeChange={setGroupRange}
              {...(setIsDrawerOpen
                ? { onMenuOpen: () => setIsDrawerOpen(true) }
                : {})}
            />
          </>
        )}
      </div>
    );
  }

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
          onScheduleOpen={openScheduleDetail}
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
            onScheduleOpen={openScheduleDetail}
          />
        </div>
      )}
    </div>
  );
}
