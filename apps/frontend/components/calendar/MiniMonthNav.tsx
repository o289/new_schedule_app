import { useState } from "react";
import clsx from "clsx";

import { isSameDate } from "../../utils/date";
import { generateMonthGrid } from "../../utils/monthGrid";
import type { Dispatch, SetStateAction } from "react";

interface MiniMonthNavProps {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  onDayClick: (date: Date) => void;
  onWeekClick: (date: Date) => void;
  setIsDrawerOpen?: Dispatch<SetStateAction<boolean>>;
}

export default function MiniMonthNav({
  selectedDate,
  setSelectedDate,
  onDayClick,
  onWeekClick,
  setIsDrawerOpen,
}: MiniMonthNavProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const weeks = generateMonthGrid(year, month);

  const handlePrev = () => {
    setCurrentDate(new Date(year, currentDate.getMonth() - 1, 1));
  };

  const handleNext = () => {
    setCurrentDate(new Date(year, currentDate.getMonth() + 1, 1));
  };

  return (
    <div className="w-80 bg-white rounded-xl shadow-md p-4">
      <div className="flex justify-between items-center mb-3">
        <button
          className="bg-gray-200 rounded-md px-2 py-1 cursor-pointer"
          onClick={handlePrev}
        >
          &lt;
        </button>
        <div className="font-semibold">
          {year}年{month}月
        </div>
        <button
          className="bg-gray-200 rounded-md px-2 py-1 cursor-pointer"
          onClick={handleNext}
        >
          &gt;
        </button>
      </div>

      <div className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))] text-xs mb-1.5">
        <div></div>
        <div className="text-red-600">日</div>
        <div>月</div>
        <div>火</div>
        <div>水</div>
        <div>木</div>
        <div>金</div>
        <div className="text-blue-600">土</div>
      </div>

      {weeks.map((week, weekIndex) => (
        <div
          className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))] mb-1"
          key={weekIndex}
        >
          <div
            className="text-center text-xs text-gray-500 cursor-pointer"
            onClick={() => {
              const weekStart = week[0]?.date;
              if (weekStart) onWeekClick(weekStart);
              setIsDrawerOpen?.(false);
            }}
          >
            {weekIndex + 1}
          </div>

          {week.map((item, idx) => {
            const { date, isCurrentMonth } = item;
            const isToday = isSameDate(date, new Date());
            const isSelected = isSameDate(date, selectedDate);

            return (
              <div
                key={idx}
                className={clsx(
                  "text-center py-1.5 cursor-pointer rounded-md transition-colors hover:bg-gray-100",
                  isToday && "border border-blue-500",
                  isSelected && "bg-blue-500 text-white",
                  !isCurrentMonth && "opacity-25",
                  date.getDay() === 0 && "text-red-600",
                  date.getDay() === 6 && "text-blue-600",
                )}
                onClick={() => {
                  setSelectedDate(date);
                  onDayClick(date);
                  setIsDrawerOpen?.(false);
                }}
              >
                {date.getDate()}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
