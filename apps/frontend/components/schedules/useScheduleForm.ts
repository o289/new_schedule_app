import { useState } from "react";
import type { ScheduleForm, ScheduleResponse } from "#frontend/types/schedule";
import { toScheduleForm } from "./scheduleFormAdapter";

export type ScheduleChangeEvent = {
  target: {
    name: string;
    value: string | boolean | null | ScheduleForm["dates"];
  };
};

function isScheduleDateChange(
  event: ScheduleChangeEvent,
): event is { target: { name: "dates"; value: ScheduleForm["dates"] } } {
  return event.target.name === "dates";
}

const initialSchedule: ScheduleForm = {
  title: "",
  note: "",
  url: null,
  dates: [],
  categoryId: "",
  isTentative: false,
};

export function useScheduleForm() {
  const [draftSchedule, setDraftSchedule] =
    useState<ScheduleForm>(initialSchedule);
  const handleChange = (event: ScheduleChangeEvent) => {
    const { name, value } = event.target;
    if (isScheduleDateChange(event)) {
      setDraftSchedule((current) => ({
        ...current,
        dates: event.target.value,
      }));
      return;
    }
    setDraftSchedule(
      (current) =>
        ({
          ...current,
          [name]: value,
        }) as ScheduleForm,
    );
  };
  const resetDraft = () => setDraftSchedule(initialSchedule);
  const loadSchedule = (schedule: ScheduleResponse) => {
    setDraftSchedule(toScheduleForm(schedule));
  };
  return {
    draftSchedule,
    setDraftSchedule,
    handleChange,
    resetDraft,
    loadSchedule,
  };
}
