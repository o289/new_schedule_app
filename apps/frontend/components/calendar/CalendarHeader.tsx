import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";

import { useCalendar } from "../../context/CalendarContext";
import type { Dispatch, SetStateAction } from "react";
import {
  formatDesktopCalendarTitle,
  type DesktopCalendarView,
} from "./calendarView";

interface CalendarHeaderProps {
  isMobile: boolean;
  setIsDrawerOpen?: Dispatch<SetStateAction<boolean>>;
}

export default function CalendarHeader({
  isMobile,
  setIsDrawerOpen,
}: CalendarHeaderProps) {
  const { handleNext, handlePrev, selectedDate, desktopView, setDesktopView } =
    useCalendar();

  const buttonSize = isMobile ? "w-9 h-9" : "w-12 h-12";
  const moveButton = `${buttonSize} rounded-xl border border-[#e5e7eb] bg-white  shadow-sm flex items-center justify-center`;

  const title = formatDesktopCalendarTitle(selectedDate, desktopView);

  const viewButtonClass = (view: DesktopCalendarView) =>
    `rounded-lg px-5 py-2 text-sm font-bold transition-colors ${
      desktopView === view
        ? "bg-[#2f80ed] text-white"
        : "bg-white text-[#374151] hover:bg-[#f3f4f6]"
    }`;

  return (
    <div className="flex items-center justify-between py-6 md:p-3">
      {/* 左側 */}
      <div className="flex items-center gap-4">
        {isMobile && (
          <div className="gap-2">
            <IconButton onClick={() => setIsDrawerOpen?.(true)}>
              <MenuIcon />
            </IconButton>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            aria-label="前の期間"
            onClick={() => handlePrev()}
            className={`${moveButton}`}
          >
            <ChevronLeftIcon />
          </button>

          <button
            type="button"
            aria-label="次の期間"
            onClick={() => handleNext()}
            className={`${moveButton}`}
          >
            <ChevronRightIcon />
          </button>
        </div>

        <h2
          className="
            text-[20px]
            font-bold
            text-[#111827]
            ml-2
          "
        >
          {title}
        </h2>
      </div>

      {!isMobile && (
        <div
          aria-label="カレンダー表示"
          className="flex rounded-xl border border-[#e5e7eb] bg-white p-1 shadow-sm"
          role="group"
        >
          <button
            type="button"
            aria-pressed={desktopView === "month"}
            className={viewButtonClass("month")}
            onClick={() => setDesktopView("month")}
          >
            月
          </button>
          <button
            type="button"
            aria-pressed={desktopView === "week"}
            className={viewButtonClass("week")}
            onClick={() => setDesktopView("week")}
          >
            週
          </button>
        </div>
      )}
    </div>
  );
}
