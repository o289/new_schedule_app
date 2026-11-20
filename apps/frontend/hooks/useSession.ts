import { useEffect, useSyncExternalStore } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAlert } from "../context/AlertContext";
import { authApi } from "../lib/api";
import { getApiErrorCode } from "../lib/apiError";
import { authQueries } from "../lib/queryOptions";
import {
  beginLogoutRequest,
  beginSessionTermination,
  clearSessionIfGeneration,
  isSessionGenerationCurrent,
  hasStoredSession,
  subscribeToSession,
  StaleRefreshError,
} from "../lib/sessionManager";

export function useSession() {
  const { showAlert } = useAlert();
  const hasSession = useSyncExternalStore(
    subscribeToSession,
    hasStoredSession,
    hasStoredSession,
  );
  const sessionQuery = useQuery({
    ...authQueries.me(),
    enabled: hasSession,
  });
  const logoutMutation = useMutation({
    mutationFn: async (logoutRequest: {
      generation: number;
      refreshToken: string | null;
    }) => {
      if (!isSessionGenerationCurrent(logoutRequest.generation)) {
        throw new StaleRefreshError();
      }
      if (logoutRequest.refreshToken) {
        await authApi.logout(logoutRequest.refreshToken);
      }
    },
    onSettled: (_data, error, logoutRequest) => {
      if (
        logoutRequest &&
        clearSessionIfGeneration(logoutRequest.generation) &&
        error &&
        !(error instanceof StaleRefreshError)
      ) {
        showAlert(getApiErrorCode(error));
      }
    },
  });
  const logoutAllMutation = useMutation({
    mutationFn: (logoutGeneration: number) => {
      if (!isSessionGenerationCurrent(logoutGeneration)) {
        throw new StaleRefreshError();
      }
      return authApi.logoutAll();
    },
    onSettled: (_data, error, logoutGeneration) => {
      if (
        logoutGeneration !== undefined &&
        clearSessionIfGeneration(logoutGeneration) &&
        error &&
        !(error instanceof StaleRefreshError)
      ) {
        showAlert(getApiErrorCode(error));
      }
    },
  });

  useEffect(() => {
    if (
      sessionQuery.error &&
      getApiErrorCode(sessionQuery.error) !== "REFRESH_TOKEN_EXPIRED" &&
      !(sessionQuery.error instanceof StaleRefreshError)
    ) {
      showAlert(getApiErrorCode(sessionQuery.error));
    }
  }, [sessionQuery.error, showAlert]);

  const logout = async () => {
    const logoutRequest = beginLogoutRequest();
    await logoutMutation.mutateAsync(logoutRequest).catch(() => undefined);
  };

  const logoutAll = async () => {
    const logoutGeneration = beginSessionTermination();
    await logoutAllMutation
      .mutateAsync(logoutGeneration)
      .catch(() => undefined);
  };

  return {
    user: sessionQuery.data ?? null,
    isAuthenticated: Boolean(sessionQuery.data) && !sessionQuery.isError,
    isLoading: hasSession && sessionQuery.isPending,
    logout,
    logoutAll,
    isLoggingOut: logoutMutation.isPending || logoutAllMutation.isPending,
  };
}
