import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../hooks/client";
import useLoading from "../../hooks/useLoading";
import { useAlert } from "../../context/AlertContext";
import { useScheduleForm } from "./useScheduleForm";
import type { ScheduleResponse } from "../../types/schedule";

export function useSchedule(id: string | null = null) {
  const { accessToken, refreshToken, handleRefresh, clearSession } = useAuth();
  const { showAlert } = useAlert();

  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [schedules, setSchedules] = useState<ScheduleResponse[]>([]);

  const { draftSchedule, setDraftSchedule, resetDraft, handleChange } =
    useScheduleForm();
  const { isFetching, startFetching, stopFetching } = useLoading();

  const base_url = "/schedules";

  // --- API処理 ---

  // 一覧
  const fetchSchedules = async () => {
    startFetching();
    try {
      const res = await apiFetch<ScheduleResponse[]>(
        base_url,
        { method: "GET" },
        { accessToken, refreshToken, handleRefresh, clearSession },
      );
      setSchedules(res);
    } finally {
      stopFetching();
    }
  };

  // 詳細
  const fetchSchedule = async () => {
    startFetching();
    try {
      const res = await apiFetch<ScheduleResponse>(
        `${base_url}/${id}`,
        { method: "GET" },
        { accessToken, refreshToken, handleRefresh, clearSession },
      );
      setSchedule(res);
    } finally {
      stopFetching();
    }
  };

  // 作成
  const handleScheduleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    await apiFetch(
      base_url,
      { method: "POST", body: JSON.stringify(draftSchedule) },
      { accessToken, refreshToken, handleRefresh, clearSession, showAlert },
    );

    resetDraft();
    await fetchSchedules();
    showAlert("CREATE_SUCCESS");
  };

  // --- 更新 ---
  const handleScheduleUpdate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const payload = {
      ...draftSchedule,
      dates: draftSchedule.dates.map((d) => ({
        ...(d.id !== undefined && { id: d.id }),
        startDate: d.startDate,
        endDate: d.endDate,
      })),
    };

    await apiFetch(
      `${base_url}/${draftSchedule.id}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
      { accessToken, refreshToken, handleRefresh, clearSession, showAlert },
    );

    await fetchSchedules();
    showAlert("UPDATE_SUCCESS");
  };

  // --- 削除 ---
  const handleScheduleDelete = async () => {
    if (!window.confirm("本当に削除しますか？")) return;
    await apiFetch(
      `${base_url}/${draftSchedule.id}`,
      { method: "DELETE" },
      { accessToken, refreshToken, handleRefresh, clearSession, showAlert },
    );
    await fetchSchedules();
    showAlert("DELETE_SUCCESS");
  };

  return {
    schedule,
    schedules,
    isFetching,
    fetchSchedules,
    fetchSchedule,
    draftSchedule,
    setDraftSchedule,
    resetDraft,
    handleScheduleCreate,
    handleChange,
    handleScheduleUpdate,
    handleScheduleDelete,
  };
}
