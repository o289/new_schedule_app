import { useEffect, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAlert } from "../context/AlertContext";
import { authApi } from "../lib/api";
import { getApiErrorCode } from "../lib/apiError";
import { authQueries } from "../lib/queryOptions";
import { authKeys } from "../lib/queryKeys";
import {
  clearSession,
  getRefreshToken,
  hasStoredSession,
  subscribeToSession,
} from "../lib/sessionManager";

export function useSession() {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();
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
    mutationFn: async () => {
      const refreshToken = getRefreshToken();
      if (refreshToken) await authApi.logout(refreshToken);
    },
    onSettled: () => clearSession(),
  });
  const logoutAllMutation = useMutation({
    mutationFn: () => authApi.logoutAll(),
    onSettled: () => clearSession(),
  });

  useEffect(() => {
    if (sessionQuery.error) {
      showAlert(getApiErrorCode(sessionQuery.error));
    }
  }, [sessionQuery.error, showAlert]);

  const logout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error) {
      showAlert(getApiErrorCode(error));
    } finally {
      queryClient.removeQueries({ queryKey: authKeys.all });
    }
  };

  const logoutAll = async () => {
    try {
      await logoutAllMutation.mutateAsync();
    } catch (error) {
      showAlert(getApiErrorCode(error));
    } finally {
      queryClient.removeQueries({ queryKey: authKeys.all });
    }
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
