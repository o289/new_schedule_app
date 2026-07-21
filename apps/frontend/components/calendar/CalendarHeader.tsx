import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";

import { useCalendar } from "../../context/CalendarContext";
import { getWeekDates } from "../../utils/dateUtils";
import type { Dispatch, SetStateAction } from "react";

interface CalendarHeaderProps {
  isMobile: boolean;
  setIsDrawerOpen?: Dispatch<SetStateAction<boolean>>;
}

export default function CalendarHeader({
  isMobile,
  setIsDrawerOpen,
}: CalendarHeaderProps) {
  const { handleNext, handlePrev, selectedDate, currentView } = useCalendar();

  const weekDates = getWeekDates(selectedDate);
  const start = weekDates[0] ?? selectedDate;
  const end = weekDates[6] ?? selectedDate;

  const buttonSize = isMobile ? "w-9 h-9" : "w-12 h-12";
  const moveButton = `${buttonSize} rounded-xl border border-[#e5e7eb] bg-white  shadow-sm flex items-center justify-center`;

  const title =
    currentView === "day"
      ? `${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日`
      : `${start.getMonth() + 1}月${start.getDate()}日〜${end.getMonth() + 1}月${end.getDate()}日`;

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
          <button onClick={() => handlePrev()} className={`${moveButton}`}>
            <ChevronLeftIcon />
          </button>

          <button onClick={() => handleNext()} className={`${moveButton}`}>
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
    </div>
  );
}
