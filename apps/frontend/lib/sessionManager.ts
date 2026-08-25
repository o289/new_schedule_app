import { queryClient } from "./queryClient";

let accessToken: string | null = localStorage.getItem("accessToken");
let refreshToken: string | null = localStorage.getItem("refreshToken");
let refreshPromise: Promise<string> | null = null;
const sessionListeners = new Set<() => void>();

function notifySessionListeners() {
  sessionListeners.forEach((listener) => listener());
}

export function subscribeToSession(listener: () => void) {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

export function hasStoredSession() {
  return Boolean(accessToken || refreshToken);
}

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return refreshToken;
}

export function saveTokens(tokens: {
  accessToken: string;
  refreshToken: string;
}) {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  localStorage.setItem("accessToken", tokens.accessToken);
  localStorage.setItem("refreshToken", tokens.refreshToken);
  notifySessionListeners();
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  notifySessionListeners();
}

export function clearSession() {
  clearTokens();
  queryClient.clear();
}

export function refreshAccessToken(
  requestRefresh: (
    refreshToken: string,
  ) => Promise<{ accessToken: string; refreshToken: string }>,
) {
  if (!refreshToken) {
    return Promise.reject(new Error("Refresh token is unavailable"));
  }

  if (!refreshPromise) {
    refreshPromise = requestRefresh(refreshToken)
      .then((tokens) => {
        saveTokens(tokens);
        return tokens.accessToken;
      })
      .catch((error: unknown) => {
        // Keep the active auth query alive so React Query can publish the error.
        clearTokens();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}
