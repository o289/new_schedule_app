import { useState } from "react";
import type { ScheduleForm, ScheduleResponse } from "../../types/schedule";

export type ScheduleChangeEvent = {
  target: {
    name: string;
    value: string | ScheduleForm["dates"];
  };
};

function isScheduleDateChange(
  event: ScheduleChangeEvent,
): event is { target: { name: "dates"; value: ScheduleForm["dates"] } } {
  return event.target.name === "dates";
}

const initialSchedule: ScheduleForm = { title: "", note: "", dates: [], categoryId: "" };

export function useScheduleForm() {
  const [draftSchedule, setDraftSchedule] = useState<ScheduleForm>(initialSchedule);
  const handleChange = (event: ScheduleChangeEvent) => {
    const { name, value } = event.target;
    if (isScheduleDateChange(event)) {
      setDraftSchedule((current) => ({ ...current, dates: event.target.value }));
      return;
    }
    setDraftSchedule((current) => ({
      ...current,
      [name]: value,
    } as ScheduleForm));
  };
  const resetDraft = () => setDraftSchedule(initialSchedule);
  const loadSchedule = (schedule: ScheduleResponse) => {
    setDraftSchedule({ title: schedule.title ?? "", note: schedule.note ?? "", dates: schedule.dates, categoryId: schedule.categoryId ?? "" });
  };
  return { draftSchedule, setDraftSchedule, handleChange, resetDraft, loadSchedule };
}
