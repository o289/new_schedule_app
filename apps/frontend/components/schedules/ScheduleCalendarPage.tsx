import { useState, useEffect } from "react";
import { useCategory } from "../categories/useCategory";
import { useSchedule } from "../schedules/useSchedule";

import useIsMobile from "../../hooks/useIsMobile";

import CalendarMain from "../../components/calendar/CalendarMain";
import CalendarAside from "../../components/calendar/CalendarAside";

import { Drawer, CircularProgress } from "@mui/material";
import CalendarHeader from "../../components/calendar/CalendarHeader";

export default function ScheduleCalendarPage() {
  const { categories } = useCategory();

  const {
    schedules,
    isFetching,
    handleScheduleCreate,
    handleScheduleUpdate,
    handleScheduleDelete,
    fetchSchedules,
    draftSchedule,
    setDraftSchedule,
    resetDraft,
    handleChange,
  } = useSchedule();

  // =============================
  // Unified State
  // =============================
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isMobile = useIsMobile(1024);

  useEffect(() => {
    fetchSchedules(); // ← マウント時に必ず実行
  }, []);

  if (isFetching || !schedules) {
    return (
      <div className="flex justify-center items-center">
        <CircularProgress aria-label="Loading…" />
      </div>
    );
  }

  // =============================
  // Desktop Layout
  // =============================

  if (!isMobile) {
    return (
      <div className="flex h-full overflow-hidden bg-[#f8f9fb]">
        <div className="w-[368px]">
          <CalendarAside
            draftSchedule={draftSchedule}
            resetForm={resetDraft}
            categories={categories}
            handleChange={handleChange}
            handleScheduleCreate={handleScheduleCreate}
            handleScheduleUpdate={handleScheduleUpdate}
            handleScheduleDelete={handleScheduleDelete}
          />
        </div>

        <div className="flex-1 overflow-auto bg-white px-5">
          <CalendarHeader isMobile={isMobile} />
          <CalendarMain
            schedules={schedules}
            setDraftSchedule={setDraftSchedule}
          />
        </div>
      </div>
    );
  }

  // =============================
  // Mobile Layout
  // =============================

  return (
    <div className="h-full bg-[#f8f9fb]">
      <CalendarHeader isMobile={isMobile} setIsDrawerOpen={setIsDrawerOpen} />

      <CalendarMain
        schedules={schedules}
        setDraftSchedule={setDraftSchedule}
        setIsDrawerOpen={setIsDrawerOpen}
      />

      <Drawer
        anchor="left"
        open={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        PaperProps={{
          sx: {
            width: "100%",
          },
        }}
      >
        <CalendarAside
          draftSchedule={draftSchedule}
          resetForm={resetDraft}
          categories={categories}
          handleChange={handleChange}
          handleScheduleCreate={handleScheduleCreate}
          handleScheduleUpdate={handleScheduleUpdate}
          handleScheduleDelete={handleScheduleDelete}
          setIsDrawerOpen={setIsDrawerOpen}
          closeButton={() => {
            setIsDrawerOpen(false);
          }}
        />
      </Drawer>
    </div>
  );
}
