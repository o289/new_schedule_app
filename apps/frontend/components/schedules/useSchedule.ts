import { useEffect } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAlert } from "../../context/AlertContext";
import { scheduleApi } from "../../lib/api";
import { getApiErrorCode } from "../../lib/apiError";
import { scheduleKeys } from "../../lib/queryKeys";
import { useScheduleForm } from "./useScheduleForm";

export function useSchedule() {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();

  const { draftSchedule, setDraftSchedule, resetDraft, handleChange } =
    useScheduleForm();

  const schedulesQuery = useQuery({
    queryKey: scheduleKeys.lists(),
    queryFn: ({ signal }) => scheduleApi.list(signal),
  });

  const createSchedule = useMutation({
    mutationFn: () => scheduleApi.create(draftSchedule),
    onError: (error) => showAlert(getApiErrorCode(error)),
  });

  const updateSchedule = useMutation({
    mutationFn: (payload: {
      id: string | undefined;
      schedule: typeof draftSchedule;
    }) => scheduleApi.update(payload.id, payload.schedule),
    onError: (error) => showAlert(getApiErrorCode(error)),
  });

  const deleteSchedule = useMutation({
    mutationFn: scheduleApi.remove,
    onError: (error) => showAlert(getApiErrorCode(error)),
  });

  const schedules = schedulesQuery.data ?? [];

  useEffect(() => {
    if (schedulesQuery.error) {
      showAlert(getApiErrorCode(schedulesQuery.error));
    }
  }, [schedulesQuery.error, showAlert]);

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
