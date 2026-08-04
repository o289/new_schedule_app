import { useState } from "react";
import { useCategory } from "../categories/useCategory";
import { useSchedule } from "../schedules/useSchedule";

import useIsMobile from "../../hooks/useIsMobile";

import CalendarMain from "../../components/calendar/CalendarMain";
import CalendarAside from "../../components/calendar/CalendarAside";

import { Drawer, CircularProgress } from "@mui/material";
import CalendarHeader from "../../components/calendar/CalendarHeader";

export default function ScheduleCalendarPage() {
  const category = useCategory();

  const {
    schedules,
    isPending,
    handleScheduleCreate,
    handleScheduleUpdate,
    handleScheduleDelete,
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

  if (isPending) {
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
            categories={category.categories}
            schedules={schedules}
            category={category}
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
            resetDraft={resetDraft}
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
    <div className="flex h-full min-h-0 w-screen flex-col bg-[#f8f9fb]">
      <div className="min-h-0 flex-1">
        <CalendarMain
          schedules={schedules}
          resetDraft={resetDraft}
          setDraftSchedule={setDraftSchedule}
          setIsDrawerOpen={setIsDrawerOpen}
        />
      </div>

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
          categories={category.categories}
          schedules={schedules}
          category={category}
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
