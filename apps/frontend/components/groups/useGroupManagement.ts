import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { GroupCreate, GroupJoin } from "#schemas/group";
import { useAlert } from "#frontend/context/AlertContext";
import { groupApi } from "#frontend/lib/api";
import { ApiClientError, getApiErrorCode } from "#frontend/lib/apiError";
import { groupKeys } from "#frontend/lib/queryKeys";

export function useGroupList() {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: groupKeys.lists(),
    queryFn: ({ signal }) => groupApi.list(signal),
  });

  useEffect(() => {
    if (!listQuery.error) return;
    showAlert(getApiErrorCode(listQuery.error));
  }, [listQuery.error, showAlert]);

  const createMutation = useMutation({
    mutationFn: (input: GroupCreate) => groupApi.create(input),
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: groupKeys.lists() });
    },
  });
  const joinMutation = useMutation({
    mutationFn: (input: GroupJoin) => groupApi.join(input),
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: groupKeys.lists() });
    },
    onError: (error) => {
      if (
        error instanceof ApiClientError &&
        error.code === "ALREADY_GROUP_MEMBER" &&
        error.details
      ) {
        return;
      }

      showAlert(getApiErrorCode(error));
    },
  });

  return { listQuery, createMutation, joinMutation };
}

export function useGroupDetail(groupId: string) {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();
  const detailQuery = useQuery({
    queryKey: groupKeys.detail(groupId),
    queryFn: ({ signal }) => groupApi.detail(groupId, signal),
  });

  useEffect(() => {
    if (!detailQuery.error) return;
    showAlert(getApiErrorCode(detailQuery.error));
  }, [detailQuery.error, showAlert]);

  const invalidateDetail = () =>
    queryClient.invalidateQueries({ queryKey: groupKeys.detail(groupId) });
  const removeGroupCache = () => {
    queryClient.removeQueries({ queryKey: groupKeys.detail(groupId) });
    queryClient.removeQueries({
      queryKey: [...groupKeys.calendars(), groupId],
    });
  };

  const leaveMutation = useMutation({
    mutationFn: () => groupApi.leave(groupId),
    retry: false,
    onSuccess: async () => {
      removeGroupCache();
      await queryClient.invalidateQueries({ queryKey: groupKeys.lists() });
    },
  });
  const kickMutation = useMutation({
    mutationFn: (userId: string) => groupApi.kick(groupId, userId),
    retry: false,
    onSuccess: async () => {
      await invalidateDetail();
      await queryClient.invalidateQueries({
        queryKey: [...groupKeys.calendars(), groupId],
      });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => groupApi.remove(groupId),
    retry: false,
    onSuccess: async () => {
      removeGroupCache();
      await queryClient.invalidateQueries({ queryKey: groupKeys.lists() });
    },
  });

  const handleMutationError = (error: unknown) => {
    showAlert(getApiErrorCode(error));
  };

  return {
    detailQuery,
    leaveMutation,
    kickMutation,
    deleteMutation,
    handleMutationError,
  };
}
