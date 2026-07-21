import { useEffect, useState } from "react";

import type { ScheduleForm, ScheduleFormDate } from "../../types/schedule";
import { toISODatetime } from "../../utils/date";
import { getMostFrequentTimeRange, updateAllDatesTime } from "./scheduleTime";

interface ChangeTarget {
  name: "dates";
  value: ScheduleFormDate[];
}

export function useScheduleDateTime(
  formData: ScheduleForm,
  onChange: (event: { target: ChangeTarget }) => void,
  isEditing: boolean,
) {
  const [dates, setDates] = useState<ScheduleFormDate[]>(formData.dates);
  const [start, setStartValue] = useState("");
  const [end, setEndValue] = useState("");

  useEffect(() => setDates(formData.dates), [formData.dates]);

  useEffect(() => {
    if (!isEditing) return;

    const range = getMostFrequentTimeRange(formData.dates);
    setStartValue(range?.start ?? "");
    setEndValue(range?.end ?? "");
  }, [formData.dates, isEditing]);

  const changeTimeRange = (nextStart: string, nextEnd: string) => {
    if (!isEditing || !nextStart || !nextEnd) return;

    const nextDates = updateAllDatesTime(dates, {
      start: nextStart,
      end: nextEnd,
    });
    setDates(nextDates);
    onChange({ target: { name: "dates", value: nextDates } });
  };

  const setStart = (nextStart: string) => {
    setStartValue(nextStart);
    changeTimeRange(nextStart, end);
  };

  const setEnd = (nextEnd: string) => {
    setEndValue(nextEnd);
    changeTimeRange(start, nextEnd);
  };

  const addDate = (date: string) => {
    if (!start || !end) return;
    const startDate = toISODatetime(date, start);
    const endDate = toISODatetime(date, end);
    if (
      dates.some(
        (item) => item.startDate === startDate && item.endDate === endDate,
      )
    )
      return;
    const nextDates = [...dates, { startDate, endDate }];
    setDates(nextDates);
    onChange({ target: { name: "dates", value: nextDates } });
  };

  const removeDate = (date: string) => {
    const nextDates = dates.filter((item) => !item.startDate.startsWith(date));
    setDates(nextDates);
    onChange({ target: { name: "dates", value: nextDates } });
  };

  return { dates, start, setStart, end, setEnd, addDate, removeDate };
}
