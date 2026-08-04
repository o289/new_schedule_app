import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { useAlert } from "../../context/AlertContext";
import { scheduleKeys } from "../../lib/queryKeys";
import { useScheduleForm } from "./useScheduleForm";
import type { ScheduleResponse } from "../../types/schedule";

export function useSchedule() {
  const { authFetch } = useAuth();
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();

  const { draftSchedule, setDraftSchedule, resetDraft, handleChange } =
    useScheduleForm();

  const baseUrl = "/schedules";

  const schedulesQuery = useQuery({
    queryKey: scheduleKeys.lists(),
    queryFn: ({ signal }) =>
      authFetch<ScheduleResponse[]>(baseUrl, { method: "GET", signal }),
  });

  const createSchedule = useMutation({
    mutationFn: () =>
      authFetch<ScheduleResponse>(baseUrl, {
        method: "POST",
        body: JSON.stringify(draftSchedule),
      }),
  });

  const updateSchedule = useMutation({
    mutationFn: (payload: {
      id: string | undefined;
      schedule: typeof draftSchedule;
    }) =>
      authFetch<ScheduleResponse>(`${baseUrl}/${payload.id}`, {
        method: "PUT",
        body: JSON.stringify(payload.schedule),
      }),
  });

  const deleteSchedule = useMutation({
    mutationFn: (scheduleId: string | undefined) =>
      authFetch<void>(`${baseUrl}/${scheduleId}`, { method: "DELETE" }),
  });

  const schedules = schedulesQuery.data ?? [];

  const fetchSchedules = () =>
    queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });

  const handleScheduleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    await createSchedule.mutateAsync();
    await queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });

    resetDraft();
    showAlert("CREATE_SUCCESS");
  };

  const handleScheduleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload = {
      ...draftSchedule,
      dates: draftSchedule.dates.map((date) => ({
        ...(date.id !== undefined && { id: date.id }),
        startDate: date.startDate,
        endDate: date.endDate,
      })),
    };

    await updateSchedule.mutateAsync({
      id: draftSchedule.id,
      schedule: payload,
    });
    await queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
    showAlert("UPDATE_SUCCESS");
  };

  const handleScheduleDelete = async () => {
    const scheduleId = draftSchedule.id;

    await deleteSchedule.mutateAsync(scheduleId);
    if (scheduleId) {
      queryClient.removeQueries({ queryKey: scheduleKeys.detail(scheduleId) });
    }
    await queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
    showAlert("DELETE_SUCCESS");
  };

  return {
    schedules,
    isFetching: schedulesQuery.isFetching,
    isPending: schedulesQuery.isPending,
    fetchSchedules,
    draftSchedule,
    setDraftSchedule,
    resetDraft,
    handleScheduleCreate,
    handleChange,
    handleScheduleUpdate,
    handleScheduleDelete,
  };
}
